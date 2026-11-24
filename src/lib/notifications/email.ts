import "server-only";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

/** Provider-agnostic email interface. Add new providers by implementing `send`. */
interface EmailProvider {
  name: string;
  send(msg: EmailMessage): Promise<{ ok: boolean; id?: string; error?: string }>;
}

const resend: EmailProvider = {
  name: "resend",
  async send(msg) {
    const { resendApiKey, emailFrom } = serverEnv();
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: emailFrom, to: [msg.to], subject: msg.subject, text: msg.text }),
    });
    if (!res.ok) return { ok: false, error: `${res.status} ${await res.text()}` };
    const json = (await res.json()) as { id?: string };
    return { ok: true, id: json.id };
  },
};

/** Development fallback: logs instead of sending. Clearly NOT a delivery. */
const consoleProvider: EmailProvider = {
  name: "console",
  async send(msg) {
    console.info(`[email:not-sent — RESEND_API_KEY missing] to=${msg.to} subject="${msg.subject}"\n${msg.text}`);
    return { ok: true, id: "console" };
  },
};

export function emailProvider(): EmailProvider {
  return serverEnv().resendApiKey ? resend : consoleProvider;
}

function render(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? "");
}

/** Send an email using an admin-editable template from `email_templates`. */
export async function sendTemplatedEmail(key: string, to: string, vars: Record<string, string>) {
  try {
    const { data } = await createAdminClient().from("email_templates").select("subject, body").eq("key", key).maybeSingle();
    const subject = render(data?.subject ?? vars.title ?? "PartnerBridge notification", vars);
    const text = render(data?.body ?? "{{body}}\n\n{{link}}", vars);
    const result = await emailProvider().send({ to, subject, text });
    if (!result.ok) console.error("[email] failed", result.error);
    return result.ok;
  } catch (e) {
    console.error("[email] error", e);
    return false;
  }
}
