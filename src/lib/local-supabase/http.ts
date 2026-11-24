export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });
}

/** PostgREST-style error body. */
export function error(status: number, code: string, message: string, details: string | null = null, hint: string | null = null) {
  return json({ code, message, details, hint }, status);
}

/** Maps a Postgres error to the HTTP status PostgREST would use. */
export function pgErrorResponse(e: unknown) {
  const err = e as { code?: string; message?: string; detail?: string; hint?: string };
  const code = err.code ?? "XX000";
  const status =
    code === "42501" ? 403
    : code === "23505" || code === "23503" || code === "23P01" ? 409
    : code === "PGRST116" ? 406
    : code.startsWith("PGRST") ? 400
    : code.startsWith("22") || code.startsWith("23") || code === "P0001" || code.startsWith("42") ? 400
    : 500;
  return error(status, code, err.message ?? "Database error", err.detail ?? null, err.hint ?? null);
}
