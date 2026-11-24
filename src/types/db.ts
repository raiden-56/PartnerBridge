import type { OrgRole, PlatformRole } from "@/lib/auth/permissions";

export type CompanySize = "1-10" | "11-50" | "51-200" | "201-500" | "501-1000" | "1000+";
export type VerificationStatus = "not_submitted" | "pending" | "verified" | "rejected" | "info_required";
export type RequestStatus = "draft" | "sent" | "viewed" | "accepted" | "rejected" | "negotiation" | "cancelled" | "expired";
export type ApplicationStatus = "submitted" | "under_review" | "shortlisted" | "discussion" | "accepted" | "rejected" | "withdrawn";
export type OpportunityStatus = "draft" | "published" | "paused" | "closed" | "removed";
export type TaskStatus = "todo" | "in_progress" | "blocked" | "done";
export type Priority = "low" | "medium" | "high" | "urgent";
export type MilestoneStatus = "planned" | "in_progress" | "completed" | "missed";
export type AgreementStatus = "draft" | "under_review" | "approved" | "active" | "expired" | "terminated";
export type DealStage = "lead" | "qualified" | "proposal" | "negotiation" | "won" | "lost";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  designation: string | null;
  phone: string | null;
  avatar_url: string | null;
  platform_role: PlatformRole;
  active_organization_id: string | null;
  onboarding_completed: boolean;
  is_demo: boolean;
  is_suspended: boolean;
  created_at: string;
}

export interface Industry {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  is_active: boolean;
  sort_order: number;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface Organization {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  cover_url: string | null;
  website: string | null;
  year_established: number | null;
  company_size: CompanySize | null;
  industry_id: string | null;
  sub_industry_id: string | null;
  registration_country: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  short_description: string | null;
  overview: string | null;
  mission: string | null;
  capabilities: string[];
  target_customers: string | null;
  target_markets: string[];
  locations_served: string[];
  industries_served: string[];
  social_links: Record<string, string>;
  partnership_goals: string[];
  open_to_partnership: boolean;
  privacy: { show_email?: boolean; show_phone?: boolean; show_activity?: boolean };
  verification_status: VerificationStatus;
  verified_at: string | null;
  profile_status: "draft" | "published" | "suspended";
  published_at: string | null;
  onboarding_step: number;
  is_featured: boolean;
  is_demo: boolean;
  activity_score: number;
  last_active_at: string;
  created_at: string;
  industry?: Pick<Industry, "id" | "name" | "slug"> | null;
  sub_industry?: Pick<Industry, "id" | "name" | "slug"> | null;
}

export interface OrgPreference {
  organization_id: string;
  category_id: string;
  direction: "offered" | "wanted";
}

export interface CompanyService {
  id: string;
  organization_id: string;
  kind: "product" | "service";
  name: string;
  description: string | null;
}

export interface Membership {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrgRole;
  permissions: string[];
  joined_at: string;
  organization: Pick<
    Organization,
    "id" | "name" | "slug" | "logo_url" | "verification_status" | "profile_status" | "onboarding_step" | "is_demo"
  >;
}

export interface Opportunity {
  id: string;
  organization_id: string;
  category_id: string | null;
  title: string;
  description: string;
  required_capabilities: string[];
  preferred_industry_ids: string[];
  target_locations: string[];
  expected_partner_size: CompanySize | null;
  commercial_model: string | null;
  duration: string | null;
  requirements: string | null;
  benefits: string | null;
  deadline: string | null;
  visibility: "public" | "members" | "verified_only";
  status: OpportunityStatus;
  accepting_applications: boolean;
  application_count: number;
  is_demo: boolean;
  published_at: string | null;
  created_at: string;
  organization?: Pick<Organization, "id" | "name" | "slug" | "logo_url" | "verification_status" | "city" | "country">;
  category?: Pick<Category, "id" | "name" | "slug"> | null;
}

export interface Application {
  id: string;
  opportunity_id: string;
  applicant_organization_id: string;
  proposal: string;
  capabilities: string | null;
  attachments: FileRef[];
  status: ApplicationStatus;
  owner_notes: string | null;
  partnership_id: string | null;
  status_changed_at: string;
  created_at: string;
}

export interface FileRef {
  path: string;
  name: string;
  size: number;
  type: string;
}

export interface PartnershipRequest {
  id: string;
  sender_organization_id: string;
  receiver_organization_id: string;
  category_id: string;
  subject: string;
  introduction: string;
  proposed_collaboration: string;
  expected_benefits: string | null;
  commercial_model: string | null;
  attachments: FileRef[];
  status: RequestStatus;
  response_message: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  responded_at: string | null;
  expires_at: string | null;
  last_activity_at: string;
  partnership_id: string | null;
  is_demo: boolean;
  created_at: string;
}

export interface Partnership {
  id: string;
  organization_a_id: string;
  organization_b_id: string;
  category_id: string | null;
  title: string;
  objectives: string | null;
  status: "active" | "paused" | "ended";
  request_id: string | null;
  application_id: string | null;
  started_at: string;
  ended_at: string | null;
  is_demo: boolean;
  created_at: string;
}

export type OrgSummary = Pick<Organization, "id" | "name" | "slug" | "logo_url" | "verification_status" | "city" | "country">;
