import "server-only";
import crypto from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { asRole, STORAGE_DIR, type RequestRole } from "./db";
import { json } from "./http";

/**
 * Stand-in for Supabase Storage. Files live under .local-data/storage. Object
 * rows go into storage.objects as the caller, so the real storage RLS policies
 * decide who may upload. Private files are only served with a signed token.
 */

const storageError = (status: number, error: string, message: string) => json({ statusCode: String(status), error, message }, status);

function safeObjectPath(bucket: string, name: string) {
  if (!/^[a-z0-9-]+$/.test(bucket)) return null;
  const clean = name.split("/").filter(Boolean);
  if (!clean.length || clean.some((s) => s === ".." || s === "." || s.includes("\\") || s.includes("\0"))) return null;
  const full = path.join(STORAGE_DIR, bucket, ...clean);
  return full.startsWith(path.join(STORAGE_DIR, bucket) + path.sep) ? { full, name: clean.join("/") } : null;
}

function sign(secret: string, bucket: string, name: string, exp: number) {
  return crypto.createHmac("sha256", secret).update(`${bucket}/${name}:${exp}`).digest("base64url");
}

async function serveFile(db: PGlite, bucket: string, name: string, download: string | null) {
  const p = safeObjectPath(bucket, name);
  if (!p || !existsSync(p.full)) return storageError(404, "not_found", "Object not found");
  const { rows } = await db.query<{ metadata: { mimetype?: string } | null }>(`select metadata from storage.objects where bucket_id = $1 and name = $2`, [bucket, p.name]);
  const type = rows[0]?.metadata?.mimetype ?? "application/octet-stream";
  const headers: Record<string, string> = {
    "content-type": type,
    "cache-control": "private, max-age=60",
    "x-content-type-options": "nosniff",
    // Uploaded SVGs may contain scripts; never let them run as documents.
    "content-security-policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
  };
  if (download !== null) headers["content-disposition"] = `attachment; filename="${(download || p.name.split("/").pop()!).replace(/["\r\n]/g, "")}"`;
  return new Response(readFileSync(p.full), { status: 200, headers });
}

export async function handleStorage(req: Request, sub: string, db: PGlite, secret: string, role: RequestRole): Promise<Response> {
  const url = new URL(req.url);
  const method = req.method.toUpperCase();
  const parts = sub.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] !== "object") return storageError(404, "not_found", `Not implemented in local demo mode: ${sub}`);

  // Public bucket download: /object/public/{bucket}/{path}
  if (parts[1] === "public" && (method === "GET" || method === "HEAD")) {
    const [bucket, ...rest] = parts.slice(2);
    const { rows } = await db.query<{ public: boolean }>(`select public from storage.buckets where id = $1`, [bucket]);
    if (!rows[0]?.public) return storageError(400, "not_found", "Bucket not found");
    return serveFile(db, bucket!, rest.join("/"), url.searchParams.get("download"));
  }

  // Signed URL: POST creates, GET serves.
  if (parts[1] === "sign") {
    const [bucket, ...rest] = parts.slice(2);
    const name = rest.join("/");
    if (method === "POST") {
      const b = (await req.json().catch(() => ({}))) as { expiresIn?: number };
      // The caller must be able to read the object under RLS (service role always can).
      const visible = await asRole(db, role, (tx) => tx.query(`select 1 from storage.objects where bucket_id = $1 and name = $2`, [bucket, name]));
      if (!visible.rows.length && role.kind !== "service") return storageError(404, "not_found", "Object not found");
      const exp = Math.floor(Date.now() / 1000) + Math.max(1, Math.min(Number(b.expiresIn ?? 60), 7 * 24 * 3600));
      const token = `${exp}.${sign(secret, bucket!, name, exp)}`;
      return json({ signedURL: `/object/sign/${bucket}/${rest.map(encodeURIComponent).join("/")}?token=${token}` });
    }
    if (method === "GET" || method === "HEAD") {
      const [expStr, sig] = (url.searchParams.get("token") ?? "").split(".");
      const exp = Number(expStr);
      const expected = Number.isFinite(exp) ? sign(secret, bucket!, name, exp) : "";
      const ok = !!sig && sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) && exp * 1000 > Date.now();
      if (!ok) return storageError(400, "InvalidJWT", "Invalid or expired signature");
      return serveFile(db, bucket!, name, url.searchParams.get("download"));
    }
  }

  // Authenticated download: /object/authenticated/{bucket}/{path}
  if (parts[1] === "authenticated" && method === "GET") {
    const [bucket, ...rest] = parts.slice(2);
    const visible = await asRole(db, role, (tx) => tx.query(`select 1 from storage.objects where bucket_id = $1 and name = $2`, [bucket, rest.join("/")]));
    if (!visible.rows.length) return storageError(404, "not_found", "Object not found");
    return serveFile(db, bucket!, rest.join("/"), url.searchParams.get("download"));
  }

  // Remove: DELETE /object/{bucket}  { prefixes: [...] }
  if (method === "DELETE" && parts.length === 2) {
    const bucket = parts[1]!;
    const b = (await req.json().catch(() => ({}))) as { prefixes?: string[] };
    const removed = await asRole(db, role, (tx) => tx.query<{ name: string }>(`delete from storage.objects where bucket_id = $1 and name = any($2::text[]) returning name`, [bucket, b.prefixes ?? []]));
    for (const r of removed.rows) {
      const p = safeObjectPath(bucket, r.name);
      if (p) rmSync(p.full, { force: true });
    }
    return json(removed.rows.map((r) => ({ name: r.name, bucket_id: bucket })));
  }

  // Upload: POST/PUT /object/{bucket}/{path}
  if ((method === "POST" || method === "PUT") && parts.length >= 3) {
    const bucket = parts[1]!;
    const p = safeObjectPath(bucket, parts.slice(2).join("/"));
    if (!p) return storageError(400, "InvalidKey", "Invalid object path");
    const { rows: buckets } = await db.query<{ file_size_limit: number | null; allowed_mime_types: string[] | null }>(`select file_size_limit, allowed_mime_types from storage.buckets where id = $1`, [bucket]);
    if (!buckets[0]) return storageError(404, "Bucket not found", "Bucket not found");

    let bytes: Buffer;
    let type = req.headers.get("content-type") ?? "application/octet-stream";
    if (type.startsWith("multipart/form-data")) {
      const form = await req.formData();
      const file = [...form.values()].find((v): v is File => typeof v !== "string");
      if (!file) return storageError(400, "InvalidRequest", "No file in upload");
      bytes = Buffer.from(await file.arrayBuffer());
      type = file.type || "application/octet-stream";
    } else {
      bytes = Buffer.from(await req.arrayBuffer());
    }
    type = type.split(";")[0]!.trim();
    const limit = buckets[0].file_size_limit;
    if (limit && bytes.length > Number(limit)) return storageError(413, "Payload too large", "The object exceeded the maximum allowed size");
    const allowed = buckets[0].allowed_mime_types;
    if (allowed?.length && !allowed.includes(type)) return storageError(415, "invalid_mime_type", `mime type ${type} is not supported`);

    const upsert = req.headers.get("x-upsert") === "true" || method === "PUT";
    const owner = role.kind === "user" ? role.userId : null;
    // No RETURNING: private buckets have insert-only policies, exactly like on Supabase.
    const id = crypto.randomUUID();
    try {
      await asRole(db, role, (tx) =>
        tx.query(
          `insert into storage.objects (id, bucket_id, name, owner, metadata) values ($1, $2, $3, $4, $5::jsonb)
           ${upsert ? "on conflict (bucket_id, name) do update set metadata = excluded.metadata, updated_at = now()" : ""}`,
          [id, bucket, p.name, owner, JSON.stringify({ mimetype: type, size: bytes.length })],
        ),
      );
      mkdirSync(path.dirname(p.full), { recursive: true });
      writeFileSync(p.full, bytes);
      return json({ Key: `${bucket}/${p.name}`, Id: id });
    } catch (e) {
      const err = e as { code?: string; message?: string };
      if (err.code === "23505") return storageError(409, "Duplicate", "The resource already exists");
      if (err.code === "42501") return storageError(403, "Unauthorized", "new row violates row-level security policy");
      return storageError(400, "InvalidRequest", err.message ?? "Upload failed");
    }
  }

  return storageError(404, "not_found", `Not implemented in local demo mode: ${method} ${sub}`);
}
