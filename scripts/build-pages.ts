/**
 * Builds a static, read-only snapshot of PartnerBridge for GitHub Pages.
 *
 * GitHub Pages can only serve files, so this script:
 *   1. builds the app in local demo mode under a sub-path (e.g. /partnerbridge) with
 *      NEXT_PUBLIC_STATIC_PREVIEW=1 (read-only UI, no service worker);
 *   2. starts it against a fresh copy of the fictional demo data;
 *   3. crawls every reachable page as an anonymous visitor, the demo company owner
 *      (/dashboard) and the platform admin (/admin), saving each page as
 *      <path>/index.html plus the files it references;
 *   4. copies the JS/CSS bundles and public files next to them.
 *
 * Usage:  npm run pages:build                 (output in out-pages/)
 *         PAGES_BASE_PATH=/my-repo npm run pages:build
 *         npm run pages:build -- --skip-build (reuse the last preview build)
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createServerClient } from "@supabase/ssr";
import { demoPassword, GUEST_PERSONAS, LOCAL_ANON_KEY, LOCAL_BASE_PATH, LOCAL_COOKIE_NAME } from "../src/lib/local-supabase/config";

const ROOT = process.cwd();
const BASE = normalizeBase(process.env.PAGES_BASE_PATH ?? "/partnerbridge");
const PUBLIC_URL = (process.env.PAGES_PUBLIC_URL ?? "").replace(/\/$/, "");
const PORT = Number(process.env.PAGES_PORT ?? 3123);
const ORIGIN = `http://localhost:${PORT}`;
const OUT = path.join(ROOT, "out-pages");
const DATA_DIR = path.join(ROOT, ".local-data-pages");
const DIST_DIR = path.join(ROOT, ".next-pages");
const MAX_PAGES = 1500;
const skipBuild = process.argv.includes("--skip-build");

function normalizeBase(b: string) {
  const t = b.trim().replace(/\/+$/, "");
  if (!t) return "";
  return t.startsWith("/") ? t : `/${t}`;
}

const env: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: "production",
  NEXT_PUBLIC_LOCAL_DEMO: "1",
  NEXT_PUBLIC_STATIC_PREVIEW: "1",
  NEXT_PUBLIC_BASE_PATH: BASE,
  NEXT_PUBLIC_APP_URL: PUBLIC_URL || `${ORIGIN}${BASE}`,
  LOCAL_DEMO_DATA_DIR: DATA_DIR,
  NEXT_TELEMETRY_DISABLED: "1",
};
// A real Supabase project would switch local demo mode off; the snapshot never uses one.
delete env.NEXT_PUBLIC_SUPABASE_URL;

const nextBin = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");

function log(msg: string) {
  console.log(`[pages] ${msg}`);
}

async function main() {
  if (!skipBuild) {
    log(`Building read-only preview under base path "${BASE || "/"}"…`);
    const r = spawnSync(process.execPath, [nextBin, "build"], { env, stdio: "inherit" });
    if (r.status !== 0) throw new Error("next build failed");
  }

  rmSync(DATA_DIR, { recursive: true, force: true });
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  log(`Starting the app on ${ORIGIN}${BASE} with fresh demo data…`);
  const server = spawn(process.execPath, [nextBin, "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout?.on("data", (d) => process.env.PAGES_VERBOSE && process.stdout.write(d));
  server.stderr?.on("data", (d) => process.stderr.write(d));
  try {
    await waitForServer(server);
    const cookies = {
      anon: "",
      owner: await signIn("owner"),
      admin: await signIn("admin"),
    };
    await crawl(cookies);
  } finally {
    server.kill();
  }

  log("Copying bundles and public files…");
  cpSync(path.join(DIST_DIR, "static"), path.join(OUT, "_next", "static"), { recursive: true });
  cpSync(path.join(ROOT, "public"), OUT, {
    recursive: true,
    // No service worker on the preview: it would cache pages under the wrong scope.
    filter: (src) => !src.endsWith(`${path.sep}sw.js`),
  });
  writeFileSync(path.join(OUT, ".nojekyll"), ""); // let GitHub Pages serve the _next/ folder
  writeFileSync(path.join(OUT, "404.html"), notFoundPage());
  rmSync(DATA_DIR, { recursive: true, force: true });
  log(`Done: ${OUT}`);
}

async function waitForServer(server: ChildProcess) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error("next start exited early");
    try {
      // The first request also waits for the demo data to be seeded.
      const res = await fetch(`${ORIGIN}${BASE}/`, { redirect: "manual" });
      if (res.status === 200) return;
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Timed out waiting for the app to start");
}

/** Signs in a demo persona through the local auth API and returns its Cookie header. */
async function signIn(key: "owner" | "admin") {
  const persona = GUEST_PERSONAS.find((p) => p.key === key)!;
  const jar = new Map<string, string>();
  const supabase = createServerClient(`${ORIGIN}${BASE}${LOCAL_BASE_PATH}`, LOCAL_ANON_KEY, {
    cookieOptions: { name: LOCAL_COOKIE_NAME },
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  });
  const { error } = await supabase.auth.signInWithPassword({ email: persona.email, password: demoPassword() });
  if (error) throw new Error(`Sign-in as ${key} failed: ${error.message}`);
  return [...jar].map(([n, v]) => `${n}=${v}`).join("; ");
}

type Who = "anon" | "owner" | "admin";

function whoFor(p: string): Who {
  if (p.startsWith("/admin/")) return "admin";
  if (p.startsWith("/dashboard/") || p.startsWith("/onboarding/")) return "owner";
  return "anon";
}

const SKIP = [/^\/api\//, /^\/auth\//, /^\/_next\//, /^\/invite\//, /sign-?out|logout/i];

/** App path (without base path) for a URL found in a page, or null if it isn't ours. */
function toAppPath(raw: string, from: string): { path: string; search: string } | null {
  if (!raw || raw.startsWith("#") || /^(mailto|tel|javascript|data|blob):/i.test(raw)) return null;
  let u: URL;
  try {
    u = new URL(raw.replace(/&amp;/g, "&"), `${ORIGIN}${BASE}${from}`);
  } catch {
    return null;
  }
  if (u.origin !== ORIGIN) return null;
  let p = decodeURI(u.pathname);
  // Root-relative links that miss the base path (plain <a href="/…">) are rewritten later.
  if (BASE && (p === BASE || p.startsWith(`${BASE}/`))) p = p.slice(BASE.length) || "/";
  return { path: p, search: u.search };
}

const isAssetPath = (p: string) => /\.[a-z0-9]{2,12}$/i.test(p.split("/").pop() ?? "");

async function crawl(cookies: Record<Who, string>) {
  const seen = new Set<string>();
  const queue: { path: string; search: string }[] = [];
  const enqueue = (t: { path: string; search: string }) => {
    let p = t.path;
    if (SKIP.some((r) => r.test(p))) return;
    const storage = p.startsWith(`${LOCAL_BASE_PATH}/storage/v1/object/`);
    if (p.startsWith(`${LOCAL_BASE_PATH}/`) && !storage) return;
    if (!storage && !isAssetPath(p) && !p.endsWith("/")) p += "/";
    if (seen.has(p)) return;
    seen.add(p);
    // Query strings are dropped for pages (GitHub Pages ignores them); storage links keep their signature.
    queue.push({ path: p, search: storage ? t.search : "" });
  };
  ["/", "/login/", "/register/", "/forgot-password/", "/dashboard/", "/admin/", "/manifest.webmanifest", "/robots.txt", "/sitemap.xml"].forEach((p) =>
    enqueue({ path: p, search: "" }),
  );

  let pages = 0;
  let files = 0;
  const failures: string[] = [];

  const worker = async () => {
    while (queue.length) {
      const item = queue.shift()!;
      if (pages + files > MAX_PAGES) return;
      const who = whoFor(item.path);
      const url = `${ORIGIN}${BASE}${item.path}${item.search}`;
      let res: Response;
      try {
        res = await fetch(url, { redirect: "manual", headers: cookies[who] ? { cookie: cookies[who] } : {} });
      } catch (e) {
        failures.push(`${item.path} (${(e as Error).message})`);
        continue;
      }
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        const target = loc ? toAppPath(loc, item.path) : null;
        if (target) {
          enqueue(target);
          const dest = `${BASE}${target.path.endsWith("/") || isAssetPath(target.path) ? target.path : `${target.path}/`}`;
          if (!isAssetPath(item.path)) save(item.path, redirectPage(dest));
        }
        continue;
      }
      if (process.env.PAGES_VERBOSE) log(`${res.status} ${item.path}`);
      if (res.status !== 200) {
        if (res.status !== 404 || !["/robots.txt", "/sitemap.xml"].includes(item.path)) failures.push(`${item.path} → ${res.status}`);
        continue;
      }
      const type = res.headers.get("content-type") ?? "";
      if (type.includes("text/html")) {
        const html = await res.text();
        for (const m of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
          const t = toAppPath(m[1]!, item.path);
          if (t) enqueue(t);
        }
        save(item.path, rewriteHtml(html));
        pages++;
      } else {
        const buf = Buffer.from(await res.arrayBuffer());
        save(item.path, type.includes("text/") || type.includes("json") || type.includes("xml") ? rewriteText(buf.toString("utf8")) : buf);
        files++;
      }
      if ((pages + files) % 25 === 0) log(`…${pages} pages, ${files} files`);
    }
  };
  // Small pool: the embedded database handles one statement at a time anyway.
  while (queue.length) await Promise.all(Array.from({ length: 4 }, worker));

  log(`Saved ${pages} pages and ${files} files.`);
  if (failures.length) log(`Skipped ${failures.length}:\n  ${failures.slice(0, 40).join("\n  ")}`);
}

function save(appPath: string, body: string | Buffer) {
  const rel = appPath.endsWith("/") ? `${appPath}index.html` : appPath;
  const file = path.join(OUT, ...rel.split("/").filter(Boolean));
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, body);
}

/** Point root-relative links at the base path and replace the local origin. */
function rewriteHtml(html: string) {
  let out = rewriteText(html);
  if (BASE) {
    const esc = BASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`(\\s(?:href|src|srcset|action)=")\\/(?!\\/)(?!${esc.slice(1)}(?:\\/|"))`, "g"), `$1${BASE}/`);
  }
  return out;
}

function rewriteText(text: string) {
  const target = PUBLIC_URL || BASE;
  return text.split(`${ORIGIN}${BASE}`).join(target).split(ORIGIN).join(PUBLIC_URL ? new URL(PUBLIC_URL).origin : "");
}

function redirectPage(to: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url=${to}"><title>Redirecting…</title><script>location.replace(${JSON.stringify(to)})</script></head><body><a href="${to}">Continue</a></body></html>`;
}

function notFoundPage() {
  const home = `${BASE}/`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Not in the preview · PartnerBridge</title>
<style>:root{color-scheme:light}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f8fafc;color:#0f172a;font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;padding:16px}main{max-width:440px;text-align:center}h1{font-size:22px;margin:0 0 8px}p{color:#475569;margin:0 0 20px}a{display:inline-block;background:#172554;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600}</style></head>
<body><main><h1>Not part of the read-only preview</h1><p>This page needs the running app (for example a filtered search, a download or a page created after the snapshot). Run PartnerBridge locally to try everything.</p><a href="${home}">Back to PartnerBridge</a></main></body></html>`;
}

main().catch((e) => {
  console.error(`[pages] ${(e as Error).message}`);
  process.exit(1);
});
