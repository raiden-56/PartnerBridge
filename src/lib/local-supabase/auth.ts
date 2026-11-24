import "server-only";
import crypto from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { json, error } from "./http";
import type { RequestRole } from "./db";

/**
 * Minimal stand-in for Supabase Auth (GoTrue) covering the endpoints the app
 * and supabase-js use: password sign-in/up, refresh, user get/update, logout,
 * recovery via one-time token, and the admin user API (service role only).
 * Emails are not sent — links are printed to the server console.
 */

const ACCESS_TTL = 60 * 60; // seconds

// ── JWT (HS256) ──────────────────────────────────────────────────────────────

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export function signJwt(secret: string, payload: Record<string, unknown>) {
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

export function verifyJwt(secret: string, token: string): { sub: string; email: string; exp: number } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const expected = crypto.createHmac("sha256", secret).update(`${parts[0]}.${parts[1]}`).digest();
  const given = Buffer.from(parts[2]!, "base64url");
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8"));
    if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// ── Passwords ────────────────────────────────────────────────────────────────

function hashPassword(password: string) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

function checkPassword(password: string, stored: string | null) {
  if (!stored) return false;
  const [, saltHex, hashHex] = stored.split("$");
  if (!saltHex || !hashHex) return false;
  const hash = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), 32);
  return crypto.timingSafeEqual(hash, Buffer.from(hashHex, "hex"));
}

// ── Users & sessions ─────────────────────────────────────────────────────────

type UserRow = {
  id: string;
  email: string;
  encrypted_password: string | null;
  email_confirmed_at: string | null;
  raw_user_meta_data: Record<string, unknown>;
  raw_app_meta_data: Record<string, unknown>;
  banned_until: string | null;
  last_sign_in_at: string | null;
  created_at: string;
  updated_at: string;
};

const iso = (v: string | Date | null) => (v ? new Date(v).toISOString() : null);

function toUser(u: UserRow) {
  return {
    id: u.id,
    aud: "authenticated",
    role: "authenticated",
    email: u.email,
    email_confirmed_at: iso(u.email_confirmed_at),
    confirmed_at: iso(u.email_confirmed_at),
    phone: "",
    last_sign_in_at: iso(u.last_sign_in_at),
    app_metadata: u.raw_app_meta_data ?? { provider: "email", providers: ["email"] },
    user_metadata: u.raw_user_meta_data ?? {},
    identities: [],
    created_at: iso(u.created_at),
    updated_at: iso(u.updated_at),
    is_anonymous: false,
  };
}

async function findUser(db: PGlite, where: "id" | "email", value: string) {
  const { rows } = await db.query<UserRow>(`select * from auth.users where ${where === "id" ? "id = $1::uuid" : "lower(email) = lower($1)"}`, [value]);
  return rows[0] ?? null;
}

async function issueSession(db: PGlite, secret: string, user: UserRow, refreshToken?: string) {
  const now = Math.floor(Date.now() / 1000);
  const access_token = signJwt(secret, {
    sub: user.id,
    email: user.email,
    role: "authenticated",
    aud: "authenticated",
    iat: now,
    exp: now + ACCESS_TTL,
    session_id: crypto.randomUUID(),
    app_metadata: user.raw_app_meta_data,
    user_metadata: user.raw_user_meta_data,
  });
  let refresh_token = refreshToken;
  if (!refresh_token) {
    refresh_token = crypto.randomBytes(24).toString("base64url");
    await db.query(`insert into auth.refresh_tokens (token, user_id) values ($1, $2)`, [refresh_token, user.id]);
  }
  return { access_token, token_type: "bearer", expires_in: ACCESS_TTL, expires_at: now + ACCESS_TTL, refresh_token, user: toUser(user) };
}

function isBanned(u: UserRow) {
  return !!u.banned_until && new Date(u.banned_until).getTime() > Date.now();
}

/** Resolves the caller from an Authorization bearer JWT. */
export async function userFromToken(db: PGlite, secret: string, token: string | null) {
  if (!token) return null;
  const claims = verifyJwt(secret, token);
  if (!claims) return null;
  const user = await findUser(db, "id", claims.sub);
  return user && !isBanned(user) ? user : null;
}

const authError = (status: number, code: string, msg: string) => json({ code: status, error_code: code, msg, message: msg }, status);

async function body(req: Request) {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function parseDuration(s: string) {
  if (!s || s === "none") return null;
  const m = /^(\d+)h$/.exec(s);
  return m ? new Date(Date.now() + Number(m[1]) * 3600_000).toISOString() : new Date(Date.now() + 876000 * 3600_000).toISOString();
}

export async function handleAuth(req: Request, sub: string, db: PGlite, secret: string, role: RequestRole, bearer: string | null): Promise<Response> {
  const url = new URL(req.url);
  const method = req.method.toUpperCase();

  // ── Public endpoints ──
  if (sub === "/settings" && method === "GET") {
    return json({ external: { email: true, google: false, azure: false }, disable_signup: false, mailer_autoconfirm: true });
  }

  if (sub === "/token" && method === "POST") {
    const grant = url.searchParams.get("grant_type");
    const b = await body(req);
    if (grant === "password") {
      const user = await findUser(db, "email", String(b.email ?? ""));
      if (!user || !checkPassword(String(b.password ?? ""), user.encrypted_password)) return authError(400, "invalid_credentials", "Invalid login credentials");
      if (!user.email_confirmed_at) return authError(400, "email_not_confirmed", "Email not confirmed");
      if (isBanned(user)) return authError(400, "user_banned", "User is banned");
      await db.query(`update auth.users set last_sign_in_at = now() where id = $1`, [user.id]);
      return json(await issueSession(db, secret, user));
    }
    if (grant === "refresh_token") {
      const { rows } = await db.query<{ user_id: string }>(`select user_id from auth.refresh_tokens where token = $1 and not revoked`, [String(b.refresh_token ?? "")]);
      const user = rows[0] ? await findUser(db, "id", rows[0].user_id) : null;
      if (!user || isBanned(user)) return authError(400, "refresh_token_not_found", "Invalid Refresh Token: Refresh Token Not Found");
      // Refresh tokens are not rotated locally, so parallel refreshes (proxy + page) never race.
      return json(await issueSession(db, secret, user, String(b.refresh_token)));
    }
    return authError(400, "unsupported_grant_type", "This sign-in method is not available in local demo mode.");
  }

  if (sub === "/signup" && method === "POST") {
    const b = await body(req);
    const email = String(b.email ?? "").trim().toLowerCase();
    const password = String(b.password ?? "");
    if (!email || !/^[^@\s]+@[^@\s]+$/.test(email)) return authError(400, "validation_failed", "Unable to validate email address: invalid format");
    if (password.length < 6) return authError(422, "weak_password", "Password should be at least 6 characters.");
    if (await findUser(db, "email", email)) return authError(422, "user_already_exists", "User already registered");
    // Email confirmation is skipped locally (no mail server), like Supabase's "autoconfirm".
    const { rows } = await db.query<UserRow>(
      `insert into auth.users (email, encrypted_password, email_confirmed_at, raw_user_meta_data, last_sign_in_at) values ($1, $2, now(), $3::jsonb, now()) returning *`,
      [email, hashPassword(password), JSON.stringify(b.data ?? {})],
    );
    return json(await issueSession(db, secret, rows[0]!));
  }

  if (sub === "/recover" && method === "POST") {
    const b = await body(req);
    const user = await findUser(db, "email", String(b.email ?? ""));
    if (user) {
      const token = crypto.randomBytes(24).toString("base64url");
      await db.query(`insert into auth.one_time_tokens (token_hash, user_id, type) values ($1, $2, 'recovery')`, [token, user.id]);
      const redirect = url.searchParams.get("redirect_to");
      const origin = redirect ? new URL(redirect).origin : "http://localhost:3000";
      console.log(`\n[local-demo] Password reset link for ${user.email}:\n  ${origin}/auth/confirm?token_hash=${token}&type=recovery&next=/reset-password\n`);
    }
    return json({});
  }

  if (sub === "/verify" && method === "POST") {
    const b = await body(req);
    const { rows } = await db.query<{ user_id: string }>(
      `delete from auth.one_time_tokens where token_hash = $1 and created_at > now() - interval '1 hour' returning user_id`,
      [String(b.token_hash ?? b.token ?? "")],
    );
    const user = rows[0] ? await findUser(db, "id", rows[0].user_id) : null;
    if (!user) return authError(403, "otp_expired", "Email link is invalid or has expired");
    await db.query(`update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = $1`, [user.id]);
    return json(await issueSession(db, secret, user));
  }

  if (sub === "/resend" && method === "POST") return json({});
  if (sub === "/otp" && method === "POST") return authError(400, "otp_disabled", "Magic links are not available in local demo mode.");

  if (sub === "/authorize") {
    const back = new URL(url.searchParams.get("redirect_to") ?? "http://localhost:3000/login");
    return Response.redirect(`${back.origin}/login?error=${encodeURIComponent("Social sign-in isn't available in local demo mode.")}`, 302);
  }

  // ── Authenticated user endpoints ──
  if (sub === "/user") {
    const user = await userFromToken(db, secret, bearer);
    if (!user) return authError(401, "bad_jwt", "invalid JWT: unable to parse or verify signature");
    if (method === "GET") return json(toUser(user));
    if (method === "PUT") {
      const b = await body(req);
      if (typeof b.password === "string") {
        if (b.password.length < 6) return authError(422, "weak_password", "Password should be at least 6 characters.");
        await db.query(`update auth.users set encrypted_password = $1, updated_at = now() where id = $2`, [hashPassword(b.password), user.id]);
      }
      if (b.data && typeof b.data === "object") await db.query(`update auth.users set raw_user_meta_data = raw_user_meta_data || $1::jsonb, updated_at = now() where id = $2`, [JSON.stringify(b.data), user.id]);
      if (typeof b.email === "string" && b.email) await db.query(`update auth.users set email = lower($1), updated_at = now() where id = $2`, [b.email, user.id]);
      return json(toUser((await findUser(db, "id", user.id))!));
    }
  }

  if (sub === "/logout" && method === "POST") {
    const user = await userFromToken(db, secret, bearer);
    if (user && url.searchParams.get("scope") !== "others") await db.query(`update auth.refresh_tokens set revoked = true where user_id = $1`, [user.id]);
    return new Response(null, { status: 204 });
  }

  // ── Admin API (service role only) ──
  if (sub.startsWith("/admin/")) {
    if (role.kind !== "service") return authError(403, "not_admin", "User not allowed");
    const m = /^\/admin\/users(?:\/([0-9a-f-]{36}))?$/.exec(sub);
    if (!m) return authError(404, "not_found", "Not found");
    const id = m[1];
    const b = method === "GET" || method === "DELETE" ? {} : await body(req);

    if (!id && method === "POST") {
      const email = String(b.email ?? "").trim().toLowerCase();
      if (await findUser(db, "email", email)) return authError(422, "email_exists", "A user with this email address has already been registered");
      const { rows } = await db.query<UserRow>(
        `insert into auth.users (email, encrypted_password, email_confirmed_at, raw_user_meta_data, raw_app_meta_data)
         values ($1, $2, case when $3 then now() end, $4::jsonb, $5::jsonb) returning *`,
        [
          email,
          b.password ? hashPassword(String(b.password)) : null,
          !!b.email_confirm,
          JSON.stringify(b.user_metadata ?? {}),
          JSON.stringify({ provider: "email", providers: ["email"], ...((b.app_metadata as object) ?? {}) }),
        ],
      );
      return json(toUser(rows[0]!));
    }
    if (!id && method === "GET") {
      const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
      const perPage = Math.min(1000, Math.max(1, Number(url.searchParams.get("per_page") ?? 50)));
      const [{ rows }, { rows: total }] = await Promise.all([
        db.query<UserRow>(`select * from auth.users order by created_at limit $1 offset $2`, [perPage, (page - 1) * perPage]),
        db.query<{ n: number }>(`select count(*)::int as n from auth.users`),
      ]);
      return json({ users: rows.map(toUser), aud: "authenticated" }, 200, { "x-total-count": String(total[0]!.n) });
    }
    if (id) {
      const user = await findUser(db, "id", id);
      if (!user) return authError(404, "user_not_found", "User not found");
      if (method === "GET") return json(toUser(user));
      if (method === "DELETE") {
        await db.query(`delete from auth.users where id = $1`, [id]);
        return json(toUser(user));
      }
      if (method === "PUT") {
        if (typeof b.password === "string") await db.query(`update auth.users set encrypted_password = $1 where id = $2`, [hashPassword(b.password), id]);
        if (typeof b.email === "string") await db.query(`update auth.users set email = lower($1) where id = $2`, [b.email, id]);
        if (b.user_metadata) await db.query(`update auth.users set raw_user_meta_data = raw_user_meta_data || $1::jsonb where id = $2`, [JSON.stringify(b.user_metadata), id]);
        if (b.email_confirm) await db.query(`update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = $1`, [id]);
        if (typeof b.ban_duration === "string") {
          await db.query(`update auth.users set banned_until = $1 where id = $2`, [parseDuration(b.ban_duration), id]);
          await db.query(`update auth.refresh_tokens set revoked = true where user_id = $1 and $2::text is not null`, [id, parseDuration(b.ban_duration)]);
        }
        await db.query(`update auth.users set updated_at = now() where id = $1`, [id]);
        return json(toUser((await findUser(db, "id", id))!));
      }
    }
  }

  return error(404, "not_found", `Local auth endpoint not implemented: ${method} ${sub}`);
}
