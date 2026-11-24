// Serves out-pages/ the way GitHub Pages does (sub-path, folder → index.html,
// 404.html for missing files, query strings ignored) to check the static preview locally.
// Usage: npm run pages:serve   → http://localhost:4173/partnerbridge/
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve("out-pages");
const BASE = (process.env.PAGES_BASE_PATH ?? "/partnerbridge").replace(/\/+$/, "");
const PORT = Number(process.env.PORT ?? 4173);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
};

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  let p = decodeURIComponent(url.pathname);
  if (BASE && p === BASE) return redirect(res, `${BASE}/`);
  if (BASE && !p.startsWith(`${BASE}/`)) return notFound(res);
  p = p.slice(BASE.length);
  let file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) return notFound(res);
  if (existsSync(file) && statSync(file).isDirectory()) {
    if (!p.endsWith("/")) return redirect(res, `${BASE}${p}/`);
    file = path.join(file, "index.html");
  }
  if (!existsSync(file) && existsSync(`${file}.html`)) file = `${file}.html`;
  if (!existsSync(file)) return notFound(res);
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
}).listen(PORT, () => console.log(`Static preview: http://localhost:${PORT}${BASE}/`));

function redirect(res, to) {
  res.writeHead(301, { location: to });
  res.end();
}
function notFound(res) {
  const page = path.join(ROOT, "404.html");
  res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
  res.end(existsSync(page) ? readFileSync(page) : "Not found");
}
