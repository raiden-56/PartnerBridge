import "server-only";
import { startOfMonth } from "date-fns";
import { createAdminClient } from "@/lib/supabase/admin";
import { UserFacingError } from "@/lib/actions";
import { limitValue, withinLimit, isUnlimited, type LimitKey, type PlanLimits } from "./limits";

export interface Entitlement {
  planCode: string;
  planName: string;
  status: string;
  limits: PlanLimits;
  periodEnd: string | null;
  cycle: string | null;
  subscriptionId: string | null;
}

/** Resolve an organization's effective plan. Expired/cancelled subscriptions fall back to Free. */
export async function getEntitlement(orgId: string): Promise<Entitlement> {
  const admin = createAdminClient();
  const { data: sub } = await admin
    .from("subscriptions")
    .select("id, status, billing_cycle, current_period_end, trial_ends_at, plan:subscription_plans(code, name, limits)")
    .eq("organization_id", orgId)
    .in("status", ["trialing", "active", "past_due"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const plan = sub?.plan as unknown as { code: string; name: string; limits: PlanLimits } | null;
  const end = sub?.status === "trialing" ? sub?.trial_ends_at : sub?.current_period_end;
  const lapsed = end ? new Date(end).getTime() < Date.now() - 3 * 86400_000 : false; // 3-day grace period
  if (sub && plan && !lapsed) {
    return {
      planCode: plan.code,
      planName: plan.name,
      status: sub.status,
      limits: plan.limits ?? {},
      periodEnd: end ?? null,
      cycle: sub.billing_cycle,
      subscriptionId: sub.id,
    };
  }
  const { data: free } = await admin.from("subscription_plans").select("code, name, limits").eq("code", "free").maybeSingle();
  return {
    planCode: "free",
    planName: free?.name ?? "Free Explorer",
    status: "active",
    limits: (free?.limits as PlanLimits) ?? {},
    periodEnd: null,
    cycle: null,
    subscriptionId: null,
  };
}

/** Current usage for count-type limits. */
export async function getUsage(orgId: string, key: LimitKey): Promise<number> {
  const admin = createAdminClient();
  const monthStart = startOfMonth(new Date()).toISOString();
  switch (key) {
    case "partnership_requests_per_month": {
      const { count } = await admin
        .from("partnership_requests")
        .select("id", { count: "exact", head: true })
        .eq("sender_organization_id", orgId)
        .neq("status", "draft")
        .gte("sent_at", monthStart);
      return count ?? 0;
    }
    case "applications_per_month": {
      const { count } = await admin
        .from("opportunity_applications")
        .select("id", { count: "exact", head: true })
        .eq("applicant_organization_id", orgId)
        .gte("created_at", monthStart);
      return count ?? 0;
    }
    case "active_opportunities": {
      const { count } = await admin
        .from("partnership_opportunities")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .in("status", ["published", "paused"])
        .is("deleted_at", null);
      return count ?? 0;
    }
    case "team_members": {
      const [{ count: members }, { count: invites }] = await Promise.all([
        admin.from("organization_members").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
        admin
          .from("organization_invitations")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .is("accepted_at", null)
          .is("revoked_at", null)
          .gt("expires_at", new Date().toISOString()),
      ]);
      return (members ?? 0) + (invites ?? 0);
    }
    case "active_workspaces": {
      const { count } = await admin
        .from("partnerships")
        .select("id", { count: "exact", head: true })
        .or(`organization_a_id.eq.${orgId},organization_b_id.eq.${orgId}`)
        .eq("status", "active");
      return count ?? 0;
    }
    case "storage_mb": {
      const { data } = await admin.from("partnership_documents").select("size_bytes, partnership:partnerships!inner(organization_a_id, organization_b_id)").eq("owner_organization_id", orgId).is("deleted_at", null);
      const bytes = (data ?? []).reduce((s, d) => s + Number(d.size_bytes), 0);
      return Math.ceil(bytes / (1024 * 1024));
    }
    default:
      return 0;
  }
}

const LIMIT_MESSAGES: Partial<Record<LimitKey, string>> = {
  partnership_requests_per_month: "You've reached your plan's monthly partnership request limit.",
  applications_per_month: "You've reached your plan's monthly application limit.",
  active_opportunities: "You've reached your plan's active opportunity limit.",
  team_members: "Your plan's team member limit has been reached.",
  active_workspaces: "Your plan's active workspace limit has been reached.",
  storage_mb: "Your plan's document storage limit has been reached.",
};

/** Throw a user-facing error if the action would exceed the plan limit. */
export async function assertWithinLimit(orgId: string, key: LimitKey, increment = 1) {
  const ent = await getEntitlement(orgId);
  const limit = limitValue(ent.limits, key);
  if (isUnlimited(limit)) return ent;
  const used = await getUsage(orgId, key);
  if (!withinLimit(used + increment - 1, limit)) {
    throw new UserFacingError(`${LIMIT_MESSAGES[key] ?? "Plan limit reached."} Upgrade in Billing to continue.`);
  }
  return ent;
}

export async function hasFeature(orgId: string, key: LimitKey) {
  const ent = await getEntitlement(orgId);
  return limitValue(ent.limits, key) !== 0;
}
