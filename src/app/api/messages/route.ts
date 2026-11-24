import { NextResponse } from "next/server";
import { messageSchema } from "@/lib/validation/schemas";
import { postMessage } from "@/lib/messaging";
import { AuthError } from "@/lib/auth/session";
import { UserFacingError } from "@/lib/actions";

/**
 * JSON endpoint used by the service worker's background-sync outbox to deliver
 * messages typed while offline. Same validation, auth and RLS as the server action;
 * `clientId` makes retries idempotent.
 */
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
    const input = messageSchema.parse(await request.json());
    const res = await postMessage(input);
    return NextResponse.json({ ok: true, id: res.id, duplicate: res.duplicate });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof UserFacingError) return NextResponse.json({ error: e.message }, { status: 400 });
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
