import "server-only";
import type { PGlite, Transaction } from "@electric-sql/pglite";
import { asRole, type RequestRole, type SchemaMeta, type TableMeta, type ForeignKey } from "./db";
import { json, error, pgErrorResponse } from "./http";

/**
 * Translates PostgREST requests (as sent by supabase-js) into SQL against the
 * embedded database. Every query runs inside a transaction with the caller's
 * role and JWT claims set, so RLS applies exactly as it does on Supabase.
 *
 * Supported: select with columns/aliases/casts/embeds (!hint, !inner, count),
 * filters (eq neq gt gte lt lte like ilike match imatch is isdistinct in cs cd ov
 * fts plfts phfts wfts, not., or/and trees, embedded filters), order, limit,
 * offset, count=exact, head, single object responses, insert / upsert / update /
 * delete with return=representation, and RPC calls.
 */

class RestError extends Error {
  constructor(public status: number, public code: string, message: string, public details: string | null = null) {
    super(message);
  }
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const q = (id: string) => {
  if (!IDENT.test(id)) throw new RestError(400, "PGRST100", `Invalid identifier: ${id}`);
  return `"${id}"`;
};
const TYPE_RE = /^[A-Za-z_][A-Za-z0-9_ ,()[\]."]*$/;
const safeType = (t: string) => {
  if (!TYPE_RE.test(t)) throw new RestError(400, "PGRST100", `Invalid type: ${t}`);
  return t;
};

// ── select= parsing ──────────────────────────────────────────────────────────

type SelectItem =
  | { kind: "star" }
  | { kind: "col"; name: string; alias?: string; cast?: string; path: { op: "->" | "->>"; key: string }[] }
  | { kind: "count"; alias?: string }
  | { kind: "embed"; relation: string; alias?: string; hints: string[]; inner: boolean; items: SelectItem[] };

function splitTop(s: string, sep = ","): string[] {
  const out: string[] = [];
  let depth = 0;
  let quoted = false;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === '"' && s[i - 1] !== "\\") quoted = !quoted;
    if (!quoted) {
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      else if (ch === sep && depth === 0) {
        out.push(cur);
        cur = "";
        continue;
      }
    }
    cur += ch;
  }
  if (cur.length) out.push(cur);
  return out;
}

function parseSelect(raw: string): SelectItem[] {
  const s = raw.replace(/\s+(?=(?:[^"]*"[^"]*")*[^"]*$)/g, "");
  if (!s) return [{ kind: "star" }];
  return splitTop(s).map((part): SelectItem => {
    if (part === "*") return { kind: "star" };
    const embed = /^(?:([A-Za-z_][A-Za-z0-9_]*):)?([A-Za-z_][A-Za-z0-9_]*)((?:![A-Za-z_][A-Za-z0-9_]*)*)\((.*)\)$/s.exec(part);
    if (embed) {
      const [, alias, relation, hintStr, inner] = embed;
      if (relation === "count" && !inner) return { kind: "count", alias };
      const hints = (hintStr ?? "").split("!").filter(Boolean);
      return {
        kind: "embed",
        relation: relation!,
        alias,
        inner: hints.includes("inner"),
        hints: hints.filter((h) => h !== "inner" && h !== "left"),
        items: parseSelect(inner ?? ""),
      };
    }
    const col = /^(?:([A-Za-z_][A-Za-z0-9_]*):)?([A-Za-z_][A-Za-z0-9_]*)((?:->>?[A-Za-z0-9_]+)*)(?:::([A-Za-z_][A-Za-z0-9_ ]*(?:\[\])?))?$/.exec(part);
    if (!col) throw new RestError(400, "PGRST100", `Could not parse select item: ${part}`);
    const [, alias, name, pathStr, cast] = col;
    if (name === "count" && !pathStr) return { kind: "count", alias };
    const path = [...(pathStr ?? "").matchAll(/(->>?)([A-Za-z0-9_]+)/g)].map((m) => ({ op: m[1] as "->" | "->>", key: m[2]! }));
    return { kind: "col", name: name!, alias, cast, path };
  });
}

// ── Filters ──────────────────────────────────────────────────────────────────

type Filter =
  | { kind: "cond"; column: string; op: string; negate: boolean; value: string; modifier?: string }
  | { kind: "logic"; op: "and" | "or"; negate: boolean; children: Filter[] };

const OPS = new Set(["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "match", "imatch", "is", "isdistinct", "in", "cs", "cd", "ov", "sl", "sr", "nxl", "nxr", "adj", "fts", "plfts", "phfts", "wfts"]);

function parseOpValue(column: string, raw: string): Filter {
  let negate = false;
  let rest = raw;
  if (rest.startsWith("not.")) {
    negate = true;
    rest = rest.slice(4);
  }
  const dot = rest.indexOf(".");
  if (dot < 0) throw new RestError(400, "PGRST100", `Invalid filter: ${column}=${raw}`);
  let op = rest.slice(0, dot);
  const value = rest.slice(dot + 1);
  let modifier: string | undefined;
  const mod = /^(\w+)\((\w+)\)$/.exec(op);
  if (mod) {
    op = mod[1]!;
    modifier = mod[2];
  }
  if (!OPS.has(op)) throw new RestError(400, "PGRST100", `Unknown operator: ${op}`);
  return { kind: "cond", column, op, negate, value, modifier };
}

function parseLogic(op: "and" | "or", negate: boolean, raw: string): Filter {
  const inner = raw.trim();
  if (!inner.startsWith("(") || !inner.endsWith(")")) throw new RestError(400, "PGRST100", `Invalid logic tree: ${raw}`);
  const children = splitTop(inner.slice(1, -1)).map((part): Filter => {
    const logic = /^(not\.)?(and|or)(\(.*\))$/s.exec(part);
    if (logic) return parseLogic(logic[2] as "and" | "or", !!logic[1], logic[3]!);
    const segs = part.split(".");
    let i = 1;
    while (i < segs.length && !(OPS.has(segs[i]!.replace(/\(\w+\)$/, "")) || (segs[i] === "not" && OPS.has((segs[i + 1] ?? "").replace(/\(\w+\)$/, ""))))) i++;
    if (i >= segs.length) throw new RestError(400, "PGRST100", `Invalid filter in logic tree: ${part}`);
    return parseOpValue(segs.slice(0, i).join("."), segs.slice(i).join("."));
  });
  return { kind: "logic", op, negate, children };
}

function unquote(v: string) {
  return v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1).replace(/\\(.)/g, "$1") : v;
}

function parseList(v: string): string[] {
  const inner = v.startsWith("(") && v.endsWith(")") ? v.slice(1, -1) : v;
  if (!inner) return [];
  return splitTop(inner).map((x) => unquote(x.trim()));
}

const pgArrayLiteral = (items: string[]) => `{${items.map((x) => `"${x.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`;

class Params {
  values: unknown[] = [];
  add(v: unknown) {
    this.values.push(v);
    return `$${this.values.length}`;
  }
}

type Scope = { table: TableMeta | null; alias: string };

function colType(scope: Scope, column: string): string | null {
  return scope.table?.columns.get(column) ?? null;
}

function compileCond(f: Extract<Filter, { kind: "cond" }>, scope: Scope, params: Params): string {
  if (scope.table && !scope.table.columns.has(f.column)) throw new RestError(400, "42703", `column ${scope.table.name}.${f.column} does not exist`);
  const c = `${scope.alias}.${q(f.column)}`;
  const type = colType(scope, f.column);
  const typed = (v: string) => (type ? `cast(${params.add(v)}::text as ${safeType(type)})` : `${params.add(v)}::text`);
  const left = type ? c : `${c}::text`;
  let sql: string;
  switch (f.op) {
    case "eq": sql = `${left} = ${typed(f.value)}`; break;
    case "neq": sql = `${left} <> ${typed(f.value)}`; break;
    case "gt": sql = `${left} > ${typed(f.value)}`; break;
    case "gte": sql = `${left} >= ${typed(f.value)}`; break;
    case "lt": sql = `${left} < ${typed(f.value)}`; break;
    case "lte": sql = `${left} <= ${typed(f.value)}`; break;
    case "isdistinct": sql = `${left} is distinct from ${typed(f.value)}`; break;
    case "like": sql = `${c}::text like ${params.add(f.value.replace(/\*/g, "%"))}::text`; break;
    case "ilike": sql = `${c}::text ilike ${params.add(f.value.replace(/\*/g, "%"))}::text`; break;
    case "match": sql = `${c}::text ~ ${params.add(f.value)}::text`; break;
    case "imatch": sql = `${c}::text ~* ${params.add(f.value)}::text`; break;
    case "is": {
      const v = f.value.toLowerCase();
      if (!["null", "true", "false", "unknown"].includes(v)) throw new RestError(400, "PGRST100", `Invalid "is" value: ${f.value}`);
      sql = `${c} is ${v}`;
      break;
    }
    case "in": {
      const items = parseList(f.value);
      sql = items.length ? `${left} = any(cast(${params.add(pgArrayLiteral(items))}::text as ${type ? safeType(type) : "text"}[]))` : "false";
      break;
    }
    case "cs": sql = `${c} @> ${typed(f.value)}`; break;
    case "cd": sql = `${c} <@ ${typed(f.value)}`; break;
    case "ov": sql = `${c} && ${type ? typed(f.value.startsWith("(") ? pgArrayLiteral(parseList(f.value)) : f.value) : params.add(f.value)}`; break;
    case "sl": sql = `${c} << ${typed(f.value)}`; break;
    case "sr": sql = `${c} >> ${typed(f.value)}`; break;
    case "nxl": sql = `${c} &< ${typed(f.value)}`; break;
    case "nxr": sql = `${c} &> ${typed(f.value)}`; break;
    case "adj": sql = `${c} -|- ${typed(f.value)}`; break;
    case "fts":
    case "plfts":
    case "phfts":
    case "wfts": {
      const fn = { fts: "to_tsquery", plfts: "plainto_tsquery", phfts: "phraseto_tsquery", wfts: "websearch_to_tsquery" }[f.op];
      const cfg = f.modifier ? `${params.add(f.modifier)}::regconfig, ` : "";
      sql = `${c} @@ ${fn}(${cfg}${params.add(f.value)}::text)`;
      break;
    }
    default:
      throw new RestError(400, "PGRST100", `Unsupported operator ${f.op}`);
  }
  return f.negate ? `not (${sql})` : sql;
}

function compileFilter(f: Filter, scope: Scope, params: Params): string {
  if (f.kind === "cond") return compileCond(f, scope, params);
  if (!f.children.length) return "true";
  const sql = `(${f.children.map((c) => compileFilter(c, scope, params)).join(f.op === "or" ? " or " : " and ")})`;
  return f.negate ? `not ${sql}` : sql;
}

// ── Per-path params (top level + embedded resources) ─────────────────────────

type Order = { column: string; desc: boolean; nulls?: "first" | "last" };
type Level = { filters: Filter[]; order: Order[]; limit?: number; offset?: number };
const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns", "and", "or", "not"]);

function parseOrder(raw: string): Order[] {
  return splitTop(raw).map((part) => {
    const segs = part.split(".");
    const column = segs[0]!;
    const desc = segs.includes("desc");
    const nulls = segs.includes("nullsfirst") ? "first" : segs.includes("nullslast") ? "last" : undefined;
    return { column, desc, nulls };
  });
}

function collectLevels(params: URLSearchParams, skip: Set<string> = new Set()): Map<string, Level> {
  const levels = new Map<string, Level>();
  const level = (p: string) => {
    if (!levels.has(p)) levels.set(p, { filters: [], order: [] });
    return levels.get(p)!;
  };
  for (const [key, value] of params) {
    if (skip.has(key)) continue;
    const segs = key.split(".");
    const last = segs[segs.length - 1]!;
    const prefix = segs.slice(0, -1).join(".");
    if (key === "select" || key === "on_conflict" || key === "columns") continue;
    if (last === "order") level(prefix).order.push(...parseOrder(value));
    else if (last === "limit") level(prefix).limit = Number(value);
    else if (last === "offset") level(prefix).offset = Number(value);
    else if (last === "or" || last === "and") level(prefix).filters.push(parseLogic(last, false, value));
    else if (last === "not" && segs.length >= 2 && (segs[segs.length - 2] === "or" || segs[segs.length - 2] === "and")) continue;
    else if (RESERVED.has(last) && segs.length === 1) continue;
    else level(prefix).filters.push(parseOpValue(last, value));
  }
  // not.or=(...) / not.and=(...)
  for (const [key, value] of params) {
    const m = /^(?:(.*)\.)?not\.(or|and)$/.exec(key);
    if (m) level(m[1] ?? "").filters.push(parseLogic(m[2] as "or" | "and", true, value));
  }
  return levels;
}

function orderSql(order: Order[], scope: Scope) {
  if (!order.length) return "";
  return (
    "order by " +
    order
      .map((o) => {
        if (scope.table && !scope.table.columns.has(o.column)) throw new RestError(400, "42703", `column ${scope.table.name}.${o.column} does not exist`);
        return `${scope.alias}.${q(o.column)} ${o.desc ? "desc" : "asc"}${o.nulls ? ` nulls ${o.nulls}` : ""}`;
      })
      .join(", ")
  );
}

// ── Relationships ────────────────────────────────────────────────────────────

type Rel = { target: TableMeta; fk: ForeignKey; kind: "m2o" | "o2m" | "o2o" };

function resolveRel(meta: SchemaMeta, from: TableMeta, relation: string, hints: string[]): Rel {
  const target = meta.tables.get(relation);
  if (!target) throw new RestError(400, "PGRST200", `Could not find a relationship between '${from.name}' and '${relation}' in the schema cache`);
  const isUnique = (t: TableMeta, cols: string[]) => t.uniques.some((u) => u.length === cols.length && u.every((c) => cols.includes(c)));
  let candidates: (Rel & { viaSourceColumn: boolean })[] = [];
  for (const fk of meta.fks) {
    if (fk.table === from.name && fk.refTable === target.name) candidates.push({ target, fk, kind: "m2o", viaSourceColumn: false });
    if (fk.table === target.name && fk.refTable === from.name) candidates.push({ target, fk, kind: isUnique(target, fk.columns) ? "o2o" : "o2m", viaSourceColumn: false });
  }
  for (const hint of hints) {
    candidates = candidates
      .filter((c) => c.fk.name === hint || (c.kind === "m2o" ? c.fk.columns.includes(hint) : c.fk.columns.includes(hint)) || c.fk.refColumns.includes(hint))
      .map((c) => ({ ...c, viaSourceColumn: c.kind === "m2o" && c.fk.columns.includes(hint) }));
  }
  // Self-references hinted by a column name resolve to the many-to-one side (e.g. industries!parent_id).
  if (candidates.length > 1 && candidates.some((c) => c.viaSourceColumn)) candidates = candidates.filter((c) => c.viaSourceColumn);
  // Deduplicate the same FK seen from both directions on self-references.
  if (candidates.length > 1 && from.name === target.name && !hints.length) candidates = candidates.filter((c) => c.kind === "m2o");
  if (candidates.length === 0) throw new RestError(400, "PGRST200", `Could not find a relationship between '${from.name}' and '${relation}' in the schema cache`);
  if (candidates.length > 1) throw new RestError(300, "PGRST201", `Could not embed because more than one relationship was found for '${from.name}' and '${relation}'`);
  return candidates[0]!;
}

function joinCondition(rel: Rel, parentAlias: string, childAlias: string) {
  return rel.fk.columns
    .map((col, i) =>
      rel.kind === "m2o"
        ? `${childAlias}.${q(rel.fk.refColumns[i]!)} = ${parentAlias}.${q(col)}`
        : `${childAlias}.${q(col)} = ${parentAlias}.${q(rel.fk.refColumns[i]!)}`,
    )
    .join(" and ");
}

// ── SQL building ─────────────────────────────────────────────────────────────

type Builder = { meta: SchemaMeta; params: Params; levels: Map<string, Level>; aliasCounter: { n: number } };

function nextAlias(b: Builder) {
  return `t${++b.aliasCounter.n}`;
}

/** jsonb object expression for one row of `scope`. */
function objectExpr(b: Builder, scope: Scope, items: SelectItem[], path: string): { expr: string; innerConds: string[] } {
  const pairs: string[] = [];
  let base: string | null = null;
  const innerConds: string[] = [];
  for (const item of items) {
    if (item.kind === "star") base = `to_jsonb(${scope.alias})`;
    else if (item.kind === "col") {
      if (scope.table && !scope.table.columns.has(item.name)) throw new RestError(400, "42703", `column ${scope.table.name}.${item.name} does not exist`);
      let expr = `${scope.alias}.${q(item.name)}`;
      for (const p of item.path) expr = `(${expr}${p.op}${b.params.add(p.key)}::text)`;
      if (item.cast) expr = `(${expr})::${safeType(item.cast)}`;
      const key = item.alias ?? (item.path.length ? item.path[item.path.length - 1]!.key : item.name);
      pairs.push(`${b.params.add(key)}::text, ${expr}`);
    } else if (item.kind === "count") {
      pairs.push(`${b.params.add(item.alias ?? "count")}::text, count(*) over ()`);
    } else {
      if (!scope.table) throw new RestError(400, "PGRST200", "Embedding is not supported on this resource");
      const key = item.alias ?? item.relation;
      const childPath = path ? `${path}.${key}` : key;
      const rel = resolveRel(b.meta, scope.table, item.relation, item.hints);
      const childAlias = nextAlias(b);
      const child: Scope = { table: rel.target, alias: childAlias };
      const lvl = b.levels.get(childPath) ?? { filters: [], order: [] };
      const conds = [joinCondition(rel, scope.alias, childAlias), ...lvl.filters.map((f) => compileFilter(f, child, b.params))];
      const onlyCount = item.items.length === 1 && item.items[0]!.kind === "count";
      let expr: string;
      if (onlyCount) {
        const k = (item.items[0] as { alias?: string }).alias ?? "count";
        expr = `(select jsonb_build_array(jsonb_build_object(${b.params.add(k)}::text, count(*))) from public.${q(rel.target.name)} ${childAlias} where ${conds.join(" and ")})`;
      } else {
        const inner = objectExpr(b, child, item.items, childPath);
        const allConds = [...conds, ...inner.innerConds];
        if (rel.kind === "o2m") {
          const ord = orderSql(lvl.order, child);
          const lim = lvl.limit !== undefined ? `limit ${Math.max(0, Math.floor(lvl.limit))}` : "";
          const off = lvl.offset !== undefined ? `offset ${Math.max(0, Math.floor(lvl.offset))}` : "";
          expr = `coalesce((select jsonb_agg(s.j order by s.rn) from (select ${inner.expr} as j, row_number() over (${ord}) as rn from public.${q(rel.target.name)} ${childAlias} where ${allConds.join(" and ")} ${ord} ${lim} ${off}) s), '[]'::jsonb)`;
        } else {
          expr = `(select ${inner.expr} from public.${q(rel.target.name)} ${childAlias} where ${allConds.join(" and ")} limit 1)`;
        }
        if (item.inner) {
          innerConds.push(`exists (select 1 from public.${q(rel.target.name)} ${childAlias} where ${allConds.join(" and ")})`);
        }
      }
      pairs.push(`${b.params.add(key)}::text, ${expr}`);
    }
  }
  const chunks: string[] = [];
  for (let i = 0; i < pairs.length; i += 40) chunks.push(`jsonb_build_object(${pairs.slice(i, i + 40).join(", ")})`);
  const parts = [...(base ? [base] : []), ...chunks];
  return { expr: parts.length ? parts.join(" || ") : "'{}'::jsonb", innerConds };
}

// ── Request handling ─────────────────────────────────────────────────────────

function parsePrefer(h: string | null) {
  const out: Record<string, string> = {};
  for (const part of (h ?? "").split(",")) {
    const [k, v] = part.trim().split("=");
    if (k) out[k] = v ?? "";
  }
  return out;
}

type Result = { rows: unknown[]; count: number | null };

function respond(req: Request, result: Result, opts: { status?: number; offset?: number; minimal?: boolean; scalar?: boolean } = {}) {
  const accept = req.headers.get("accept") ?? "";
  const headers: Record<string, string> = {};
  const n = result.rows.length;
  const offset = opts.offset ?? 0;
  if (result.count !== null || req.method === "GET" || req.method === "HEAD") {
    headers["content-range"] = n ? `${offset}-${offset + n - 1}/${result.count ?? "*"}` : `*/${result.count ?? "*"}`;
  }
  if (accept.includes("application/vnd.pgrst.object")) {
    if (n !== 1) return error(406, "PGRST116", "JSON object requested, multiple (or no) rows returned", `The result contains ${n} rows`);
    if (req.method === "HEAD" || opts.minimal) return new Response(null, { status: opts.status ?? 200, headers });
    return json(result.rows[0], opts.status ?? 200, headers);
  }
  if (req.method === "HEAD" || opts.minimal) return new Response(null, { status: opts.minimal && (opts.status ?? 200) === 200 ? 204 : (opts.status ?? 200), headers });
  return json(opts.scalar ? result.rows[0] ?? null : result.rows, opts.status ?? 200, headers);
}

async function readBody(req: Request): Promise<unknown> {
  const text = await req.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new RestError(400, "PGRST102", "Empty or invalid json");
  }
}

function toArgLiteral(v: unknown, type: string): string | null {
  if (v === null || v === undefined) return null;
  if (type === "jsonb" || type === "json") return JSON.stringify(v);
  if (Array.isArray(v)) return pgArrayLiteral(v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))));
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export async function handleRest(req: Request, sub: string, db: PGlite, meta: SchemaMeta, role: RequestRole): Promise<Response> {
  const url = new URL(req.url);
  const method = req.method.toUpperCase();
  const prefer = parsePrefer(req.headers.get("prefer"));
  const wantCount = prefer.count === "exact" || prefer.count === "planned" || prefer.count === "estimated";

  try {
    // ── RPC ──
    const rpc = /^\/rpc\/([A-Za-z_][A-Za-z0-9_]*)$/.exec(sub);
    if (rpc) {
      const fn = meta.functions.get(rpc[1]!);
      if (!fn) throw new RestError(404, "PGRST202", `Could not find the function public.${rpc[1]} in the schema cache`);
      const args = (method === "GET" || method === "HEAD" ? {} : await readBody(req)) as Record<string, unknown>;
      const params = new Params();
      const argSql = Object.entries(args).map(([k, v]) => {
        const a = fn.args.find((x) => x.name === k);
        if (!a) throw new RestError(404, "PGRST202", `Could not find the function public.${fn.name}(${Object.keys(args).join(", ")}) in the schema cache`);
        const lit = toArgLiteral(v, a.type);
        return `${q(a.name)} => ${lit === null ? `null::${safeType(a.type)}` : `cast(${params.add(lit)}::text as ${safeType(a.type)})`}`;
      });
      const call = `public.${q(fn.name)}(${argSql.join(", ")})`;
      const result = await asRole(db, role, async (tx) => {
        if (fn.returnKind === "void") {
          await tx.query(`select ${call}`, params.values);
          return null;
        }
        if (!fn.returnsSet && fn.returnKind === "scalar") {
          const { rows } = await tx.query<{ j: unknown }>(`select to_jsonb(${call}) as j`, params.values);
          return { rows: [rows[0]?.j ?? null], count: null, scalar: true };
        }
        const levels = collectLevels(url.searchParams);
        const top = levels.get("") ?? { filters: [], order: [] };
        const scope: Scope = { table: null, alias: "t0" };
        const b: Builder = { meta, params, levels, aliasCounter: { n: 0 } };
        const from = fn.returnKind === "scalar" ? `${call} as t0(v)` : `${call} as t0`;
        const sel = fn.returnKind === "scalar" ? { expr: "to_jsonb(t0.v)", innerConds: [] } : objectExpr(b, scope, parseSelect(url.searchParams.get("select") ?? "*"), "");
        const where = [...top.filters.map((f) => compileFilter(f, scope, params)), ...sel.innerConds];
        const whereSql = where.length ? `where ${where.join(" and ")}` : "";
        const lim = top.limit !== undefined ? `limit ${Math.floor(top.limit)}` : "";
        const off = top.offset ? `offset ${Math.floor(top.offset)}` : "";
        const { rows } = await tx.query<{ j: unknown }>(`select ${sel.expr} as j from ${from} ${whereSql} ${orderSql(top.order, scope)} ${lim} ${off}`, params.values);
        let count: number | null = null;
        if (wantCount) count = (await tx.query<{ n: number }>(`select count(*)::int as n from (select ${sel.expr} as j from ${from} ${whereSql}) s`, params.values)).rows[0]!.n;
        return { rows: rows.map((r) => r.j), count, scalar: !fn.returnsSet, offset: top.offset ?? 0 };
      });
      if (!result) return new Response(null, { status: 204 });
      return respond(req, result, { scalar: result.scalar, offset: (result as { offset?: number }).offset });
    }

    // ── Tables ──
    const tm = /^\/([A-Za-z_][A-Za-z0-9_]*)$/.exec(sub);
    const table = tm ? meta.tables.get(tm[1]!) : undefined;
    if (!table) throw new RestError(404, "PGRST205", `Could not find the table 'public.${tm?.[1] ?? sub}' in the schema cache`);
    const levels = collectLevels(url.searchParams);
    const top = levels.get("") ?? { filters: [], order: [] };
    const params = new Params();
    const b: Builder = { meta, params, levels, aliasCounter: { n: 0 } };
    const scope: Scope = { table, alias: "t0" };
    const selectItems = parseSelect(url.searchParams.get("select") ?? "*");

    if (method === "GET" || method === "HEAD") {
      const sel = objectExpr(b, scope, selectItems, "");
      const where = [...top.filters.map((f) => compileFilter(f, scope, params)), ...sel.innerConds];
      const whereSql = where.length ? `where ${where.join(" and ")}` : "";
      const lim = top.limit !== undefined ? `limit ${Math.max(0, Math.floor(top.limit))}` : "";
      const off = top.offset ? `offset ${Math.max(0, Math.floor(top.offset))}` : "";
      const result = await asRole(db, role, async (tx) => {
        const rows = method === "HEAD" ? [] : (await tx.query<{ j: unknown }>(`select ${sel.expr} as j from public.${q(table.name)} t0 ${whereSql} ${orderSql(top.order, scope)} ${lim} ${off}`, params.values)).rows.map((r) => r.j);
        const count = wantCount ? (await tx.query<{ n: number }>(`select count(*)::int as n from (select ${sel.expr} as j from public.${q(table.name)} t0 ${whereSql}) s`, params.values)).rows[0]!.n : null;
        return { rows, count };
      });
      return respond(req, result, { offset: top.offset ?? 0 });
    }

    const returning = prefer.return === "representation";

    if (method === "POST") {
      const raw = await readBody(req);
      const rows = (Array.isArray(raw) ? raw : [raw]) as Record<string, unknown>[];
      const colParam = url.searchParams.get("columns");
      const cols = colParam ? colParam.split(",").map((c) => c.replace(/"/g, "").trim()) : [...new Set(rows.flatMap((r) => Object.keys(r)))];
      for (const c of cols) if (!table.columns.has(c)) throw new RestError(400, "PGRST204", `Could not find the '${c}' column of '${table.name}' in the schema cache`);
      if (!rows.length) return respond(req, { rows: [], count: null }, { status: 201, minimal: !returning });
      const colList = cols.map(q).join(", ");
      let conflict = "";
      if (prefer.resolution === "merge-duplicates" || prefer.resolution === "ignore-duplicates") {
        const target = (url.searchParams.get("on_conflict")?.split(",").map((s) => s.trim()) ?? table.primaryKey).map(q).join(", ");
        const updatable = cols.filter((c) => !(url.searchParams.get("on_conflict")?.split(",").map((s) => s.trim()) ?? table.primaryKey).includes(c));
        conflict =
          prefer.resolution === "ignore-duplicates" || !updatable.length
            ? `on conflict (${target}) do nothing`
            : `on conflict (${target}) do update set ${updatable.map((c) => `${q(c)} = excluded.${q(c)}`).join(", ")}`;
      }
      const payload = params.add(JSON.stringify(rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c] ?? null])))));
      const dml = `insert into public.${q(table.name)} as t0 (${colList}) select ${colList} from jsonb_populate_recordset(null::public.${q(table.name)}, ${payload}::text::jsonb) ${conflict} returning t0.*`;
      const result = await runDml(db, role, b, scope, selectItems, dml, returning);
      return respond(req, result, { status: 201, minimal: !returning });
    }

    if (method === "PATCH") {
      const raw = (await readBody(req)) as Record<string, unknown>;
      const cols = Object.keys(raw);
      for (const c of cols) if (!table.columns.has(c)) throw new RestError(400, "PGRST204", `Could not find the '${c}' column of '${table.name}' in the schema cache`);
      if (!cols.length) return respond(req, { rows: [], count: null }, { minimal: !returning });
      const payload = params.add(JSON.stringify(raw));
      const where = top.filters.map((f) => compileFilter(f, scope, params));
      const dml = `update public.${q(table.name)} as t0 set ${cols.map((c) => `${q(c)} = r.${q(c)}`).join(", ")} from jsonb_populate_record(null::public.${q(table.name)}, ${payload}::text::jsonb) as r ${where.length ? `where ${where.join(" and ")}` : ""} returning t0.*`;
      const result = await runDml(db, role, b, scope, selectItems, dml, returning);
      return respond(req, result, { minimal: !returning });
    }

    if (method === "DELETE") {
      const where = top.filters.map((f) => compileFilter(f, scope, params));
      const dml = `delete from public.${q(table.name)} as t0 ${where.length ? `where ${where.join(" and ")}` : ""} returning t0.*`;
      const result = await runDml(db, role, b, scope, selectItems, dml, returning);
      return respond(req, result, { minimal: !returning });
    }

    return error(405, "PGRST117", `Unsupported HTTP method: ${method}`);
  } catch (e) {
    if (e instanceof RestError) return error(e.status, e.code, e.message, e.details);
    return pgErrorResponse(e);
  }
}

async function runDml(db: PGlite, role: RequestRole, b: Builder, scope: Scope, items: SelectItem[], dml: string, returning: boolean): Promise<Result> {
  return asRole(db, role, async (tx: Transaction) => {
    if (!returning) {
      const r = await tx.query(dml.replace(/ returning t0\.\*$/, ""), b.params.values);
      return { rows: [], count: r.affectedRows ?? null };
    }
    const sel = objectExpr(b, scope, items, "");
    const { rows } = await tx.query<{ j: unknown }>(`with m as (${dml}) select ${sel.expr} as j from m t0`, b.params.values);
    return { rows: rows.map((r) => r.j), count: null };
  });
}
