import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientIp } from "@/lib/rate-limit";

interface ActivityInput {
  organizationId?: string | null;
  partnershipId?: string | null;
  actorId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
}

/** Append-only activity log (partnership timeline + company activity). Never throws. */
export async function logActivity(input: ActivityInput | ActivityInput[]) {
  const rows = (Array.isArray(input) ? input : [input]).map((a) => ({
    organization_id: a.organizationId ?? null,
    partnership_id: a.partnershipId ?? null,
    actor_id: a.actorId ?? null,
    action: a.action,
    entity_type: a.entityType ?? null,
    entity_id: a.entityId ?? null,
    summary: a.summary,
    metadata: a.metadata ?? {},
  }));
  try {
    await createAdminClient().from("activity_logs").insert(rows);
  } catch (e) {
    console.error("[activity] failed", e);
  }
}

/** Platform audit trail for privileged/admin actions. */
export async function audit(actorId: string | null, action: string, targetType: string, targetId: string | null, metadata: Record<string, unknown> = {}) {
  try {
    await createAdminClient()
      .from("audit_logs")
      .insert({ actor_id: actorId, action, target_type: targetType, target_id: targetId, metadata, ip_address: await clientIp() });
  } catch (e) {
    console.error("[audit] failed", e);
  }
}
