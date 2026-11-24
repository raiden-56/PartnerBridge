import "server-only";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import crypto from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

/**
 * Embedded Postgres for local demo mode. One instance per server process, kept
 * on globalThis so every bundle (proxy, route handlers, server components)
 * shares it. The real migrations — including every RLS policy — are applied,
 * so local behaviour matches production authorization.
 */

export const LOCAL_DATA_DIR = process.env.LOCAL_DEMO_DATA_DIR ? path.resolve(process.env.LOCAL_DEMO_DATA_DIR) : path.join(process.cwd(), ".local-data");
const DB_DIR = path.join(LOCAL_DATA_DIR, "pglite");
export const STORAGE_DIR = path.join(LOCAL_DATA_DIR, "storage");

const SUPABASE_STUBS = `
create schema if not exists extensions;
set search_path = public, extensions;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  aud text not null default 'authenticated',
  role text not null default 'authenticated',
  email text unique,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data jsonb not null default '{"provider":"email","providers":["email"]}'::jsonb,
  banned_until timestamptz,
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table auth.refresh_tokens (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);
create table auth.one_time_tokens (
  token_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  created_at timestamptz not null default now()
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role', true), '')
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  metadata jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
create function storage.filename(name text) returns text language sql immutable as $$
  select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)]
$$;
grant usage on schema public, auth, storage, extensions to anon, authenticated, service_role;
create schema local_demo;
create table local_demo.meta (key text primary key, value text not null);
`;

const GRANTS = `
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
grant execute on all functions in schema storage to anon, authenticated, service_role;
`;

// ── Schema metadata (used by the REST translator) ─────────────────────────────

export type ForeignKey = { name: string; table: string; columns: string[]; refTable: string; refColumns: string[] };
export type TableMeta = { name: string; columns: Map<string, string>; primaryKey: string[]; uniques: string[][] };
export type FunctionMeta = { name: string; args: { name: string; type: string; hasDefault: boolean }[]; returnsSet: boolean; returnKind: "composite" | "scalar" | "void" | "table"; returnType: string };
export type SchemaMeta = { tables: Map<string, TableMeta>; fks: ForeignKey[]; functions: Map<string, FunctionMeta> };

async function loadMeta(db: PGlite): Promise<SchemaMeta> {
  const tables = new Map<string, TableMeta>();
  const cols = await db.query<{ table: string; column: string; type: string }>(`
    select c.relname as table, a.attname as column, format_type(a.atttypid, a.atttypmod) as type
    from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','v','p','m') and a.attnum > 0 and not a.attisdropped
    order by c.relname, a.attnum`);
  for (const r of cols.rows) {
    if (!tables.has(r.table)) tables.set(r.table, { name: r.table, columns: new Map(), primaryKey: [], uniques: [] });
    tables.get(r.table)!.columns.set(r.column, r.type);
  }
  const cons = await db.query<{ name: string; type: string; table: string; columns: string[]; ref_table: string | null; ref_columns: string[] | null }>(`
    select con.conname as name, con.contype as type, c.relname as table,
      array(select a.attname from unnest(con.conkey) with ordinality k(n, i) join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.n order by k.i)::text[] as columns,
      fc.relname as ref_table,
      case when con.confrelid = 0 then null else array(select a.attname from unnest(con.confkey) with ordinality k(n, i) join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.n order by k.i)::text[] end as ref_columns
    from pg_constraint con join pg_class c on c.oid = con.conrelid join pg_namespace n on n.oid = c.relnamespace
    left join pg_class fc on fc.oid = con.confrelid
    where n.nspname = 'public' and con.contype in ('p','u','f')`);
  const fks: ForeignKey[] = [];
  for (const r of cons.rows) {
    const t = tables.get(r.table);
    if (!t) continue;
    if (r.type === "p") t.primaryKey = r.columns;
    if (r.type === "p" || r.type === "u") t.uniques.push(r.columns);
    if (r.type === "f" && r.ref_table) fks.push({ name: r.name, table: r.table, columns: r.columns, refTable: r.ref_table, refColumns: r.ref_columns ?? [] });
  }
  // Unique indexes (not constraints) also make a relationship one-to-one.
  const idx = await db.query<{ table: string; columns: string[] }>(`
    select c.relname as table, array(select a.attname from unnest(i.indkey) k(n) join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.n)::text[] as columns
    from pg_index i join pg_class c on c.oid = i.indrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and i.indisunique and i.indpred is null`);
  for (const r of idx.rows) tables.get(r.table)?.uniques.push(r.columns);

  const functions = new Map<string, FunctionMeta>();
  const fns = await db.query<{ name: string; arg_names: string[] | null; arg_modes: string[] | null; arg_types: string[]; nargs: number; ndefaults: number; retset: boolean; typtype: string; rettype: string; has_out: boolean }>(`
    select p.proname as name, p.proargnames as arg_names, p.proargmodes::text[] as arg_modes,
      array(select format_type(t, null) from unnest(p.proargtypes) with ordinality u(t, i) order by i)::text[] as arg_types,
      p.pronargs as nargs, p.pronargdefaults as ndefaults, p.proretset as retset, rt.typtype::text as typtype,
      format_type(p.prorettype, null) as rettype, coalesce('t' = any(p.proargmodes::text[]) or 'o' = any(p.proargmodes::text[]), false) as has_out
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_type rt on rt.oid = p.prorettype
    where n.nspname = 'public' and p.prokind = 'f'`);
  for (const f of fns.rows) {
    const names = f.arg_names ?? [];
    const modes = f.arg_modes;
    const inNames = modes ? names.filter((_, i) => ["i", "b", "v"].includes(modes[i]!)) : names.slice(0, f.nargs);
    const args = f.arg_types.map((type, i) => ({ name: inNames[i] ?? `$${i + 1}`, type, hasDefault: i >= f.nargs - f.ndefaults }));
    const returnKind: FunctionMeta["returnKind"] = f.rettype === "void" ? "void" : f.has_out || f.rettype === "record" ? "table" : f.typtype === "c" ? "composite" : "scalar";
    functions.set(f.name, { name: f.name, args, returnsSet: f.retset, returnKind, returnType: f.rettype });
  }
  return { tables, fks, functions };
}

// ── Instance lifecycle ───────────────────────────────────────────────────────

type LocalState = {
  db: PGlite;
  meta: SchemaMeta;
  jwtSecret: string;
  /** Resolves when demo data is in place (requests from the seeder skip it). */
  seeded: Promise<void>;
};

const KEY = Symbol.for("partnerbridge.local-supabase");
type Holder = { state?: Promise<LocalState> };
const holder: Holder = ((globalThis as Record<symbol, unknown>)[KEY] ??= {}) as Holder;

async function open(): Promise<LocalState> {
  mkdirSync(LOCAL_DATA_DIR, { recursive: true });
  mkdirSync(STORAGE_DIR, { recursive: true });
  let db = await PGlite.create(DB_DIR, { extensions: { pgcrypto, pg_trgm } });
  await db.exec("set timezone to 'UTC'");

  const ready = await db
    .query<{ value: string }>(`select value from local_demo.meta where key = 'seeded'`)
    .then((r) => r.rows[0]?.value === "yes")
    .catch(() => false);

  if (!ready) {
    // Fresh (or half-finished) database: rebuild from scratch.
    await db.close();
    rmSync(DB_DIR, { recursive: true, force: true });
    rmSync(STORAGE_DIR, { recursive: true, force: true });
    mkdirSync(STORAGE_DIR, { recursive: true });
    db = await PGlite.create(DB_DIR, { extensions: { pgcrypto, pg_trgm } });
    await db.exec("set timezone to 'UTC'");
    console.log("[local-demo] creating local database…");
    await db.exec(SUPABASE_STUBS);
    const dir = path.join(process.cwd(), "supabase", "migrations");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
      await db.exec(readFileSync(path.join(dir, f), "utf8"));
    }
    await db.exec(GRANTS);
    await db.query(`insert into local_demo.meta (key, value) values ('jwt_secret', $1)`, [crypto.randomBytes(32).toString("hex")]);
  }

  const meta = await loadMeta(db);
  const { rows } = await db.query<{ value: string }>(`select value from local_demo.meta where key = 'jwt_secret'`);
  const state: LocalState = { db, meta, jwtSecret: rows[0]!.value, seeded: Promise.resolve() };

  if (!ready) {
    state.seeded = (async () => {
      const started = Date.now();
      console.log("[local-demo] loading demo data…");
      const { seedDemoData } = await import("@/lib/demo/seed");
      const { localSupabaseClients } = await import("./fetch");
      await seedDemoData(localSupabaseClients({ seeding: true }), (m) => console.log(`[local-demo] ${m}`));
      await db.query(`insert into local_demo.meta (key, value) values ('seeded', 'yes') on conflict (key) do update set value = 'yes'`);
      console.log(`[local-demo] demo data ready in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    })();
    state.seeded.catch((e) => console.error("[local-demo] seeding failed — restart the server to retry", e));
  }
  return state;
}

export function getLocalState(): Promise<LocalState> {
  if (!holder.state) {
    holder.state = open();
    holder.state.catch(() => (holder.state = undefined));
  }
  return holder.state;
}

/** Wipe the local database and storage, then rebuild and reseed it. */
export async function resetLocalDemo() {
  if (holder.state) {
    const s = await holder.state.catch(() => null);
    if (s) {
      await s.seeded.catch(() => undefined);
      await s.db.close();
    }
  }
  holder.state = undefined;
  rmSync(DB_DIR, { recursive: true, force: true });
  rmSync(STORAGE_DIR, { recursive: true, force: true });
  const s = await getLocalState();
  await s.seeded;
}

export function localDataExists() {
  return existsSync(path.join(DB_DIR, "PG_VERSION"));
}

// ── Request context ──────────────────────────────────────────────────────────

export type RequestRole = { kind: "service" } | { kind: "anon" } | { kind: "user"; userId: string; email: string };

/** Run `fn` in a transaction as the caller, so RLS policies apply exactly like PostgREST. */
export async function asRole<T>(db: PGlite, role: RequestRole, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    if (role.kind !== "service") {
      const sub = role.kind === "user" ? role.userId : "";
      const pgRole = role.kind === "user" ? "authenticated" : "anon";
      const claims = JSON.stringify(role.kind === "user" ? { sub, email: role.email, role: pgRole, aud: "authenticated" } : { role: pgRole });
      await tx.query(
        `select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true), set_config('request.jwt.claim.role', $3, true)`,
        [sub, claims, pgRole],
      );
      await tx.exec(`set local role ${pgRole}`);
    }
    await tx.exec("set local search_path = public, extensions");
    return fn(tx);
  });
}
