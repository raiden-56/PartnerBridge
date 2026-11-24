-- ════════════════════════════════════════════════════════════════════════
-- PartnerBridge — core schema
-- Multi-tenant B2B partnership platform. Tenancy unit = organizations.
-- ════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ─── Enums ──────────────────────────────────────────────────────────────
create type public.platform_role as enum ('user', 'moderator', 'super_admin');
create type public.org_role as enum ('owner', 'admin', 'partnership_manager', 'member');
create type public.company_size as enum ('1-10', '11-50', '51-200', '201-500', '501-1000', '1000+');
create type public.verification_status as enum ('not_submitted', 'pending', 'verified', 'rejected', 'info_required');
create type public.profile_status as enum ('draft', 'published', 'suspended');
create type public.preference_direction as enum ('offered', 'wanted');
create type public.opportunity_status as enum ('draft', 'published', 'paused', 'closed', 'removed');
create type public.opportunity_visibility as enum ('public', 'members', 'verified_only');
create type public.application_status as enum ('submitted', 'under_review', 'shortlisted', 'discussion', 'accepted', 'rejected', 'withdrawn');
create type public.request_status as enum ('draft', 'sent', 'viewed', 'accepted', 'rejected', 'negotiation', 'cancelled', 'expired');
create type public.partnership_status as enum ('active', 'paused', 'ended');
create type public.task_status as enum ('todo', 'in_progress', 'blocked', 'done');
create type public.priority_level as enum ('low', 'medium', 'high', 'urgent');
create type public.milestone_status as enum ('planned', 'in_progress', 'completed', 'missed');
create type public.agreement_status as enum ('draft', 'under_review', 'approved', 'active', 'expired', 'terminated');
create type public.deal_stage as enum ('lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'cancelled', 'expired', 'pending');
create type public.billing_cycle as enum ('monthly', 'yearly');
create type public.payment_status as enum ('created', 'authorized', 'paid', 'failed', 'refunded');
create type public.report_status as enum ('open', 'reviewing', 'resolved', 'dismissed');

-- ─── Utility: updated_at trigger ────────────────────────────────────────
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ─── Profiles (1:1 with auth.users) ─────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  designation text,
  phone text,
  avatar_url text,
  platform_role public.platform_role not null default 'user',
  active_organization_id uuid,
  onboarding_completed boolean not null default false,
  is_demo boolean not null default false,
  is_suspended boolean not null default false,
  last_seen_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_email_idx on public.profiles (lower(email));
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ─── Taxonomy ───────────────────────────────────────────────────────────
create table public.industries (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.industries (id) on delete cascade,
  name text not null,
  slug text not null unique,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index industries_parent_idx on public.industries (parent_id);
create trigger industries_updated_at before update on public.industries
  for each row execute function public.set_updated_at();

create table public.partnership_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  icon text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger partnership_categories_updated_at before update on public.partnership_categories
  for each row execute function public.set_updated_at();

-- ─── Organizations (companies) ──────────────────────────────────────────
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null check (char_length(name) between 2 and 120),
  logo_url text,
  cover_url text,
  website text,
  year_established int check (year_established between 1800 and 2100),
  company_size public.company_size,
  industry_id uuid references public.industries (id) on delete set null,
  sub_industry_id uuid references public.industries (id) on delete set null,
  registration_country text,
  country text,
  state text,
  city text,
  short_description text check (char_length(short_description) <= 280),
  overview text,
  mission text,
  capabilities text[] not null default '{}',
  target_customers text,
  target_markets text[] not null default '{}',
  locations_served text[] not null default '{}',
  industries_served text[] not null default '{}',
  social_links jsonb not null default '{}'::jsonb,
  partnership_goals text[] not null default '{}',
  open_to_partnership boolean not null default true,
  -- privacy: { show_email, show_phone, show_activity, show_documents }
  privacy jsonb not null default '{"show_email": false, "show_phone": false, "show_activity": true}'::jsonb,
  verification_status public.verification_status not null default 'not_submitted',
  verified_at timestamptz,
  profile_status public.profile_status not null default 'draft',
  published_at timestamptz,
  onboarding_step int not null default 1,
  is_featured boolean not null default false,
  is_demo boolean not null default false,
  activity_score int not null default 0,
  last_active_at timestamptz not null default now(),
  search_document tsvector,
  created_by uuid references public.profiles (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index organizations_industry_idx on public.organizations (industry_id);
create index organizations_country_idx on public.organizations (country, state, city);
create index organizations_status_idx on public.organizations (profile_status, verification_status) where deleted_at is null;
create index organizations_search_idx on public.organizations using gin (search_document);
create index organizations_name_trgm_idx on public.organizations using gin (name gin_trgm_ops);
create index organizations_capabilities_idx on public.organizations using gin (capabilities);
create index organizations_markets_idx on public.organizations using gin (target_markets);
create trigger organizations_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();

alter table public.profiles
  add constraint profiles_active_org_fk foreign key (active_organization_id)
  references public.organizations (id) on delete set null;

-- Private contact details (separate table so RLS protects them independently of the public profile).
create table public.organization_contacts (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  email text,
  phone text,
  address text,
  postal_code text,
  updated_at timestamptz not null default now()
);
create trigger organization_contacts_updated_at before update on public.organization_contacts
  for each row execute function public.set_updated_at();

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.org_role not null default 'member',
  -- granular grants for role=member, e.g. {'requests.manage','opportunities.manage','workspace.access'}
  permissions text[] not null default '{}',
  invited_by uuid references public.profiles (id) on delete set null,
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id);
create unique index organization_one_owner_idx on public.organization_members (organization_id) where role = 'owner';
create trigger organization_members_updated_at before update on public.organization_members
  for each row execute function public.set_updated_at();

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null,
  role public.org_role not null default 'member' check (role <> 'owner'),
  permissions text[] not null default '{}',
  token_hash text not null unique,
  invited_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index organization_invitations_org_idx on public.organization_invitations (organization_id);
create unique index organization_invitations_pending_idx on public.organization_invitations (organization_id, lower(email))
  where accepted_at is null and revoked_at is null;

create table public.organization_verifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  status public.verification_status not null default 'pending',
  registration_country text,
  registration_type text,
  registration_number text,
  tax_id text,
  domain text,
  domain_verification_token text not null default encode(gen_random_bytes(16), 'hex'),
  domain_verified_at timestamptz,
  representative_name text,
  representative_designation text,
  representative_email text,
  representative_phone text,
  -- [{path, name, size, type}] stored in private bucket "verification-docs"
  documents jsonb not null default '[]'::jsonb,
  submitted_by uuid references public.profiles (id) on delete set null,
  submitted_at timestamptz,
  reviewer_id uuid references public.profiles (id) on delete set null,
  reviewer_notes text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index organization_verifications_org_idx on public.organization_verifications (organization_id, created_at desc);
create index organization_verifications_status_idx on public.organization_verifications (status);
create trigger organization_verifications_updated_at before update on public.organization_verifications
  for each row execute function public.set_updated_at();

create table public.company_services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null default 'service' check (kind in ('product', 'service')),
  name text not null check (char_length(name) between 2 and 120),
  description text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index company_services_org_idx on public.company_services (organization_id);

create table public.company_partnership_preferences (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  category_id uuid not null references public.partnership_categories (id) on delete cascade,
  direction public.preference_direction not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, category_id, direction)
);
create index company_partnership_preferences_cat_idx on public.company_partnership_preferences (category_id, direction);

create table public.company_saved (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  saved_organization_id uuid not null references public.organizations (id) on delete cascade,
  saved_by uuid references public.profiles (id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  primary key (organization_id, saved_organization_id),
  check (organization_id <> saved_organization_id)
);

create table public.organization_blocks (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  blocked_organization_id uuid not null references public.organizations (id) on delete cascade,
  blocked_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (organization_id, blocked_organization_id)
);

create table public.partner_recommendations (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  recommended_organization_id uuid not null references public.organizations (id) on delete cascade,
  score numeric(5, 2) not null,
  breakdown jsonb not null default '{}'::jsonb,
  reasons text[] not null default '{}',
  suggested_collaborations text[] not null default '{}',
  dismissed boolean not null default false,
  computed_at timestamptz not null default now(),
  primary key (organization_id, recommended_organization_id)
);
create index partner_recommendations_score_idx on public.partner_recommendations (organization_id, score desc);

-- ─── Opportunities ──────────────────────────────────────────────────────
create table public.partnership_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  category_id uuid references public.partnership_categories (id) on delete set null,
  title text not null check (char_length(title) between 5 and 160),
  description text not null,
  required_capabilities text[] not null default '{}',
  preferred_industry_ids uuid[] not null default '{}',
  target_locations text[] not null default '{}',
  expected_partner_size public.company_size,
  commercial_model text,
  duration text,
  requirements text,
  benefits text,
  deadline date,
  visibility public.opportunity_visibility not null default 'public',
  status public.opportunity_status not null default 'draft',
  accepting_applications boolean not null default true,
  application_count int not null default 0,
  is_demo boolean not null default false,
  published_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index partnership_opportunities_org_idx on public.partnership_opportunities (organization_id);
create index partnership_opportunities_status_idx on public.partnership_opportunities (status, published_at desc) where deleted_at is null;
create index partnership_opportunities_cat_idx on public.partnership_opportunities (category_id);
create index partnership_opportunities_fts_idx on public.partnership_opportunities
  using gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '')));
create trigger partnership_opportunities_updated_at before update on public.partnership_opportunities
  for each row execute function public.set_updated_at();

create table public.opportunity_applications (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.partnership_opportunities (id) on delete cascade,
  applicant_organization_id uuid not null references public.organizations (id) on delete cascade,
  proposal text not null check (char_length(proposal) >= 20),
  capabilities text,
  attachments jsonb not null default '[]'::jsonb,
  status public.application_status not null default 'submitted',
  owner_notes text,
  submitted_by uuid references public.profiles (id) on delete set null,
  reviewed_by uuid references public.profiles (id) on delete set null,
  status_changed_at timestamptz not null default now(),
  partnership_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (opportunity_id, applicant_organization_id)
);
create index opportunity_applications_applicant_idx on public.opportunity_applications (applicant_organization_id);
create trigger opportunity_applications_updated_at before update on public.opportunity_applications
  for each row execute function public.set_updated_at();

-- ─── Partnership requests ───────────────────────────────────────────────
create table public.partnership_requests (
  id uuid primary key default gen_random_uuid(),
  sender_organization_id uuid not null references public.organizations (id) on delete cascade,
  receiver_organization_id uuid not null references public.organizations (id) on delete cascade,
  category_id uuid not null references public.partnership_categories (id),
  subject text not null check (char_length(subject) between 5 and 160),
  introduction text not null,
  proposed_collaboration text not null,
  expected_benefits text,
  commercial_model text,
  attachments jsonb not null default '[]'::jsonb,
  status public.request_status not null default 'draft',
  response_message text,
  sent_at timestamptz,
  viewed_at timestamptz,
  responded_at timestamptz,
  expires_at timestamptz,
  last_activity_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  partnership_id uuid,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sender_organization_id <> receiver_organization_id)
);
create index partnership_requests_sender_idx on public.partnership_requests (sender_organization_id, created_at desc);
create index partnership_requests_receiver_idx on public.partnership_requests (receiver_organization_id, created_at desc);
-- Prevent duplicate *open* requests between the same pair for the same category.
create unique index partnership_requests_open_unique on public.partnership_requests
  (sender_organization_id, receiver_organization_id, category_id)
  where status in ('draft', 'sent', 'viewed', 'negotiation');
create trigger partnership_requests_updated_at before update on public.partnership_requests
  for each row execute function public.set_updated_at();

-- ─── Partnerships ───────────────────────────────────────────────────────
create table public.partnerships (
  id uuid primary key default gen_random_uuid(),
  organization_a_id uuid not null references public.organizations (id) on delete cascade,
  organization_b_id uuid not null references public.organizations (id) on delete cascade,
  category_id uuid references public.partnership_categories (id) on delete set null,
  title text not null,
  objectives text,
  status public.partnership_status not null default 'active',
  request_id uuid unique references public.partnership_requests (id) on delete set null,
  application_id uuid unique references public.opportunity_applications (id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (organization_a_id <> organization_b_id)
);
create index partnerships_a_idx on public.partnerships (organization_a_id);
create index partnerships_b_idx on public.partnerships (organization_b_id);
create trigger partnerships_updated_at before update on public.partnerships
  for each row execute function public.set_updated_at();

alter table public.partnership_requests
  add constraint partnership_requests_partnership_fk foreign key (partnership_id) references public.partnerships (id) on delete set null;
alter table public.opportunity_applications
  add constraint opportunity_applications_partnership_fk foreign key (partnership_id) references public.partnerships (id) on delete set null;

-- Members explicitly assigned to a workspace (owners/admins/managers always have access).
create table public.partnership_members (
  partnership_id uuid not null references public.partnerships (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  is_primary_contact boolean not null default false,
  added_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (partnership_id, user_id)
);
create unique index partnership_members_primary_idx on public.partnership_members (partnership_id, organization_id)
  where is_primary_contact;

-- ─── Messaging ──────────────────────────────────────────────────────────
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('direct', 'partnership')),
  organization_a_id uuid not null references public.organizations (id) on delete cascade,
  organization_b_id uuid not null references public.organizations (id) on delete cascade,
  partnership_id uuid unique references public.partnerships (id) on delete cascade,
  subject text,
  last_message_at timestamptz,
  last_message_preview text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (organization_a_id <> organization_b_id)
);
create unique index conversations_direct_pair_idx on public.conversations
  (least(organization_a_id, organization_b_id), greatest(organization_a_id, organization_b_id))
  where kind = 'direct';
create index conversations_a_idx on public.conversations (organization_a_id, last_message_at desc);
create index conversations_b_idx on public.conversations (organization_b_id, last_message_at desc);

create table public.partnership_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  partnership_id uuid references public.partnerships (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete set null,
  sender_organization_id uuid not null references public.organizations (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 8000),
  client_id text,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index partnership_messages_conv_idx on public.partnership_messages (conversation_id, created_at desc);
create unique index partnership_messages_client_idx on public.partnership_messages (sender_id, client_id) where client_id is not null;
create index partnership_messages_fts_idx on public.partnership_messages using gin (to_tsvector('simple', body));

create table public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.partnership_messages (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  created_at timestamptz not null default now()
);
create index message_attachments_msg_idx on public.message_attachments (message_id);

create table public.conversation_reads (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

-- ─── Workspace: tasks, milestones ───────────────────────────────────────
create table public.partnership_tasks (
  id uuid primary key default gen_random_uuid(),
  partnership_id uuid not null references public.partnerships (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 200),
  description text,
  responsible_organization_id uuid references public.organizations (id) on delete set null,
  assignee_id uuid references public.profiles (id) on delete set null,
  due_date date,
  priority public.priority_level not null default 'medium',
  status public.task_status not null default 'todo',
  completed_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index partnership_tasks_p_idx on public.partnership_tasks (partnership_id, status);
create index partnership_tasks_assignee_idx on public.partnership_tasks (assignee_id) where deleted_at is null;
create trigger partnership_tasks_updated_at before update on public.partnership_tasks
  for each row execute function public.set_updated_at();

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.partnership_tasks (id) on delete cascade,
  partnership_id uuid not null references public.partnerships (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index task_comments_task_idx on public.task_comments (task_id, created_at);

create table public.partnership_milestones (
  id uuid primary key default gen_random_uuid(),
  partnership_id uuid not null references public.partnerships (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 200),
  description text,
  target_date date,
  progress int not null default 0 check (progress between 0 and 100),
  status public.milestone_status not null default 'planned',
  completed_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index partnership_milestones_p_idx on public.partnership_milestones (partnership_id, target_date);
create trigger partnership_milestones_updated_at before update on public.partnership_milestones
  for each row execute function public.set_updated_at();

-- ─── Documents (versioned) ──────────────────────────────────────────────
create table public.partnership_documents (
  id uuid primary key default gen_random_uuid(),
  partnership_id uuid not null references public.partnerships (id) on delete cascade,
  owner_organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null,
  category text not null default 'general'
    check (category in ('general', 'legal', 'commercial', 'marketing', 'technical', 'financial', 'operations')),
  -- 'shared' = both companies; 'internal' = only the uploading company
  access_level text not null default 'shared' check (access_level in ('shared', 'internal')),
  current_version int not null default 1,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  uploaded_by uuid references public.profiles (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index partnership_documents_p_idx on public.partnership_documents (partnership_id) where deleted_at is null;
create trigger partnership_documents_updated_at before update on public.partnership_documents
  for each row execute function public.set_updated_at();

create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.partnership_documents (id) on delete cascade,
  partnership_id uuid not null references public.partnerships (id) on delete cascade,
  version int not null,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  change_note text,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (document_id, version)
);

create table public.document_access_logs (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.partnership_documents (id) on delete cascade,
  partnership_id uuid not null references public.partnerships (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  organization_id uuid references public.organizations (id) on delete set null,
  action text not null check (action in ('upload', 'new_version', 'download', 'delete', 'access_change')),
  version int,
  created_at timestamptz not null default now()
);
create index document_access_logs_doc_idx on public.document_access_logs (document_id, created_at desc);

-- ─── Agreements ─────────────────────────────────────────────────────────
create table public.partnership_agreements (
  id uuid primary key default gen_random_uuid(),
  partnership_id uuid not null references public.partnerships (id) on delete cascade,
  title text not null,
  agreement_type text not null default 'partnership',
  status public.agreement_status not null default 'draft',
  commercial_terms text,
  effective_date date,
  expiration_date date,
  renewal_date date,
  current_version int not null default 1,
  storage_path text,
  file_name text,
  -- Internal approval records. NOT a legal e-signature.
  approval_a_by uuid references public.profiles (id) on delete set null,
  approval_a_at timestamptz,
  approval_b_by uuid references public.profiles (id) on delete set null,
  approval_b_at timestamptz,
  esign_provider text,
  esign_envelope_id text,
  esign_status text,
  expiry_notified_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expiration_date is null or effective_date is null or expiration_date >= effective_date)
);
create index partnership_agreements_p_idx on public.partnership_agreements (partnership_id);
create index partnership_agreements_exp_idx on public.partnership_agreements (expiration_date) where deleted_at is null;
create trigger partnership_agreements_updated_at before update on public.partnership_agreements
  for each row execute function public.set_updated_at();

create table public.agreement_versions (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.partnership_agreements (id) on delete cascade,
  partnership_id uuid not null references public.partnerships (id) on delete cascade,
  version int not null,
  commercial_terms text,
  storage_path text,
  file_name text,
  change_note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (agreement_id, version)
);

-- ─── Deals & referrals ──────────────────────────────────────────────────
create table public.partnership_deals (
  id uuid primary key default gen_random_uuid(),
  partnership_id uuid not null references public.partnerships (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 200),
  customer_name text not null,
  customer_company text,
  customer_email text,
  owner_organization_id uuid not null references public.organizations (id) on delete cascade,
  owner_user_id uuid references public.profiles (id) on delete set null,
  referral_source_organization_id uuid references public.organizations (id) on delete set null,
  stage public.deal_stage not null default 'lead',
  currency text not null default 'INR',
  -- estimated opportunity value (pipeline), attributed revenue (claimed by owner),
  -- verified revenue (confirmed by the counterpart company).
  expected_value numeric(14, 2) not null default 0 check (expected_value >= 0),
  attributed_revenue numeric(14, 2) check (attributed_revenue >= 0),
  verified_revenue numeric(14, 2) check (verified_revenue >= 0),
  verified_by uuid references public.profiles (id) on delete set null,
  verified_at timestamptz,
  expected_close_date date,
  closed_at timestamptz,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index partnership_deals_p_idx on public.partnership_deals (partnership_id, stage);
create trigger partnership_deals_updated_at before update on public.partnership_deals
  for each row execute function public.set_updated_at();

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  partnership_id uuid not null references public.partnerships (id) on delete cascade,
  deal_id uuid references public.partnership_deals (id) on delete set null,
  from_organization_id uuid not null references public.organizations (id) on delete cascade,
  to_organization_id uuid not null references public.organizations (id) on delete cascade,
  lead_name text not null,
  status text not null default 'open' check (status in ('open', 'converted', 'lost')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index referrals_to_idx on public.referrals (to_organization_id, created_at desc);
create index referrals_from_idx on public.referrals (from_organization_id, created_at desc);

-- ─── Notifications ──────────────────────────────────────────────────────
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

create table public.notification_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- { "<type>": { "in_app": bool, "email": bool, "push": bool } }
  preferences jsonb not null default '{}'::jsonb,
  email_digest boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- ─── Activity & audit ───────────────────────────────────────────────────
create table public.activity_logs (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations (id) on delete cascade,
  partnership_id uuid references public.partnerships (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_logs_org_idx on public.activity_logs (organization_id, created_at desc);
create index activity_logs_partnership_idx on public.activity_logs (partnership_id, created_at desc);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_target_idx on public.audit_logs (target_type, target_id);

-- ─── Billing ────────────────────────────────────────────────────────────
create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  tagline text,
  price_monthly numeric(10, 2) not null default 0,
  price_yearly numeric(10, 2) not null default 0,
  currency text not null default 'INR',
  is_custom_pricing boolean not null default false,
  trial_days int not null default 0,
  -- numeric limits; -1 = unlimited. Keys documented in src/lib/billing/limits.ts
  limits jsonb not null default '{}'::jsonb,
  features text[] not null default '{}',
  is_active boolean not null default true,
  is_public boolean not null default true,
  sort_order int not null default 0,
  provider_plan_ids jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger subscription_plans_updated_at before update on public.subscription_plans
  for each row execute function public.set_updated_at();

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  plan_id uuid not null references public.subscription_plans (id),
  status public.subscription_status not null default 'pending',
  billing_cycle public.billing_cycle not null default 'monthly',
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  provider text,
  provider_subscription_id text,
  renewal_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscriptions_org_idx on public.subscriptions (organization_id, created_at desc);
create unique index subscriptions_one_live_idx on public.subscriptions (organization_id)
  where status in ('trialing', 'active', 'past_due');
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  plan_id uuid references public.subscription_plans (id) on delete set null,
  billing_cycle public.billing_cycle,
  provider text not null default 'razorpay',
  provider_order_id text unique,
  provider_payment_id text unique,
  amount numeric(12, 2) not null,
  currency text not null default 'INR',
  status public.payment_status not null default 'created',
  invoice_number text unique,
  failure_reason text,
  raw jsonb not null default '{}'::jsonb,
  initiated_by uuid references public.profiles (id) on delete set null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_org_idx on public.payments (organization_id, created_at desc);
create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

create sequence public.invoice_number_seq start 1001;

create table public.webhook_events (
  id text primary key, -- provider event id, for idempotency
  provider text not null,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz not null default now()
);

-- ─── Moderation & platform ──────────────────────────────────────────────
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles (id) on delete set null,
  reporter_organization_id uuid references public.organizations (id) on delete set null,
  target_type text not null check (target_type in ('organization', 'opportunity', 'request', 'message', 'user')),
  target_id uuid not null,
  reason text not null check (reason in ('spam', 'fraud', 'impersonation', 'inappropriate', 'misleading', 'harassment', 'other')),
  details text,
  status public.report_status not null default 'open',
  resolved_by uuid references public.profiles (id) on delete set null,
  resolution_notes text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index reports_status_idx on public.reports (status, created_at desc);

create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  level text not null default 'info' check (level in ('info', 'warning', 'success')),
  audience text not null default 'all' check (audience in ('all', 'public', 'members')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.email_templates (
  key text primary key,
  subject text not null,
  body text not null,
  description text,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  company text,
  message text not null,
  status text not null default 'new' check (status in ('new', 'handled')),
  created_at timestamptz not null default now()
);

create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);

create table public.data_export_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('export', 'deletion')),
  status text not null default 'completed',
  created_at timestamptz not null default now()
);
