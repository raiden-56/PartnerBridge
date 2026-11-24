import "server-only";
import { z } from "zod";
import { AuthError } from "@/lib/auth/session";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export class UserFacingError extends Error {}

export function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Wraps a server action body: maps auth/validation/DB errors to a safe, user-facing result. */
export async function runAction<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof z.ZodError) {
      return { ok: false, error: "Please correct the highlighted fields.", fieldErrors: fieldErrorsFrom(e) };
    }
    if (e instanceof AuthError || e instanceof UserFacingError) return { ok: false, error: e.message };
    // Re-throw Next.js control-flow errors (redirect / notFound).
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: string }).digest).startsWith("NEXT_")) throw e;
    console.error("[action error]", e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/** Convert Postgres / PostgREST errors into friendly messages. */
export function dbError(error: { code?: string; message: string } | null, fallback = "Database error"): never {
  if (!error) throw new UserFacingError(fallback);
  if (error.code === "23505") throw new UserFacingError("That record already exists.");
  if (error.code === "42501") throw new UserFacingError("You do not have permission to do that.");
  if (error.code === "P0001") throw new UserFacingError(error.message);
  if (error.code === "23514") throw new UserFacingError("Some values are not allowed. Please review the form.");
  console.error("[db error]", error);
  throw new UserFacingError(fallback);
}

export function formToObject(fd: FormData) {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (v instanceof File) continue;
    if (k.endsWith("[]")) {
      const key = k.slice(0, -2);
      ((obj[key] as unknown[]) ??= []).push(v);
    } else obj[k] = v;
  }
  return obj;
}
