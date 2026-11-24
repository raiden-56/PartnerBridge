/** Plan limit keys stored in subscription_plans.limits (jsonb). -1 = unlimited, 0/1 for boolean features. */
export const LIMIT_KEYS = {
  partnership_requests_per_month: { label: "Partnership requests / month", kind: "count" },
  applications_per_month: { label: "Opportunity applications / month", kind: "count" },
  active_opportunities: { label: "Active opportunities", kind: "count" },
  team_members: { label: "Team members", kind: "count" },
  active_workspaces: { label: "Active partnership workspaces", kind: "count" },
  storage_mb: { label: "Document storage (MB)", kind: "count" },
  recommendations: { label: "Smart recommendations shown", kind: "count" },
  advanced_filters: { label: "Advanced discovery filters", kind: "flag" },
  advanced_analytics: { label: "Advanced analytics", kind: "flag" },
  exports: { label: "PDF / CSV / Excel exports", kind: "flag" },
  enhanced_visibility: { label: "Enhanced visibility in discovery", kind: "flag" },
} as const;

export type LimitKey = keyof typeof LIMIT_KEYS;
export type PlanLimits = Partial<Record<LimitKey, number>>;

export const FREE_FALLBACK_LIMITS: Required<PlanLimits> = {
  partnership_requests_per_month: 5,
  applications_per_month: 3,
  active_opportunities: 1,
  team_members: 2,
  active_workspaces: 2,
  storage_mb: 100,
  recommendations: 3,
  advanced_filters: 0,
  advanced_analytics: 0,
  exports: 0,
  enhanced_visibility: 0,
};

export function limitValue(limits: PlanLimits, key: LimitKey) {
  const v = limits[key];
  return typeof v === "number" ? v : FREE_FALLBACK_LIMITS[key];
}

export function isUnlimited(v: number) {
  return v < 0;
}

export function withinLimit(used: number, limit: number) {
  return isUnlimited(limit) || used < limit;
}
