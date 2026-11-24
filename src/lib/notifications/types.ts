export const NOTIFICATION_TYPES = {
  request_received: { label: "New partnership requests", group: "Partnerships" },
  request_accepted: { label: "Accepted requests", group: "Partnerships" },
  request_rejected: { label: "Rejected or withdrawn requests", group: "Partnerships" },
  message: { label: "New messages", group: "Messaging" },
  application_received: { label: "Opportunity applications", group: "Opportunities" },
  application_status: { label: "Application status changes", group: "Opportunities" },
  task_assigned: { label: "Task assignments", group: "Workspace" },
  milestone_due: { label: "Upcoming milestones", group: "Workspace" },
  agreement: { label: "Agreement approvals & expiry", group: "Workspace" },
  deal: { label: "Deals and referrals", group: "Workspace" },
  verification: { label: "Verification updates", group: "Account" },
  team: { label: "Team invitations & changes", group: "Account" },
  billing: { label: "Subscription & renewals", group: "Account" },
  announcement: { label: "Platform announcements", group: "Account" },
} as const;

export type NotificationType = keyof typeof NOTIFICATION_TYPES;

export interface ChannelPrefs {
  in_app: boolean;
  email: boolean;
  push: boolean;
}

/** Defaults: in-app always on, email for important events, push opt-in (requires browser permission). */
export function defaultPrefs(type: NotificationType): ChannelPrefs {
  const emailDefault = !["message", "deal", "announcement"].includes(type);
  return { in_app: true, email: emailDefault, push: true };
}
