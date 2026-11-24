-- ════════════════════════════════════════════════════════════════════════
-- PartnerBridge — authorization helpers, triggers and workflow RPCs
-- Helper functions are SECURITY DEFINER with a fixed search_path so they can
-- be used inside RLS policies without recursive policy evaluation.
-- ════════════════════════════════════════════════════════════════════════

-- ─── Platform role helpers ──────────────────────────────────────────────
create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and platform_role = 'super_admin' and not is_suspended
  );
$$;

create or replace function public.is_platform_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and platform_role in ('super_admin', 'moderator') and not is_suspended
  );
$$;

-- ─── Organization role / permission helpers ────────────────────────────
create or replace function public.is_org_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members m
    join public.profiles p on p.id = m.user_id
    where m.organization_id = p_org and m.user_id = auth.uid() and not p.is_suspended
  );
$$;

create or replace function public.org_role_of(p_org uuid, p_user uuid default auth.uid())
returns public.org_role
language sql stable security definer set search_path = public as $$
  select role from public.organization_members where organization_id = p_org and user_id = p_user;
$$;

-- Mirrors src/lib/auth/permissions.ts — keep both in sync.
create or replace function public.role_has_permission(p_role public.org_role, p_grants text[], p_perm text)
returns boolean language sql immutable as $$
  select case
    when p_role = 'owner' then true
    when p_role = 'admin' then p_perm not in ('ownership.transfer', 'org.delete')
    when p_role = 'partnership_manager' then
      p_perm in ('requests.manage', 'applications.manage', 'workspaces.all', 'analytics.view', 'messages.direct')
      or p_perm = any (coalesce(p_grants, '{}'))
    else p_perm = any (coalesce(p_grants, '{}'))
  end;
$$;

create or replace function public.has_org_permission(p_org uuid, p_perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members m
    join public.profiles p on p.id = m.user_id
    where m.organization_id = p_org and m.user_id = auth.uid() and not p.is_suspended
      and public.role_has_permission(m.role, m.permissions, p_perm)
  );
$$;

-- Organizations the current user belongs to.
create or replace function public.my_org_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select organization_id from public.organization_members where user_id = auth.uid();
$$;

-- ─── Partnership access ─────────────────────────────────────────────────
-- A user can enter a workspace if they belong to a participating company AND
-- either hold the "workspaces.all" permission or were added to the workspace.
create or replace function public.can_access_partnership(p_partnership uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.partnerships pt
    join public.organization_members m
      on m.organization_id in (pt.organization_a_id, pt.organization_b_id) and m.user_id = auth.uid()
    join public.profiles p on p.id = m.user_id and not p.is_suspended
    where pt.id = p_partnership
      and (
        public.role_has_permission(m.role, m.permissions, 'workspaces.all')
        or exists (select 1 from public.partnership_members pm
                   where pm.partnership_id = pt.id and pm.user_id = auth.uid())
      )
  );
$$;

-- The organization through which the current user participates in a partnership.
create or replace function public.my_side_of_partnership(p_partnership uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select m.organization_id
  from public.partnerships pt
  join public.organization_members m
    on m.organization_id in (pt.organization_a_id, pt.organization_b_id) and m.user_id = auth.uid()
  where pt.id = p_partnership
  order by (m.organization_id = (select active_organization_id from public.profiles where id = auth.uid())) desc
  limit 1;
$$;

create or replace function public.are_partner_orgs(p_org_a uuid, p_org_b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.partnerships
    where status <> 'ended'
      and ((organization_a_id = p_org_a and organization_b_id = p_org_b)
        or (organization_a_id = p_org_b and organization_b_id = p_org_a))
  );
$$;

-- Do the current user and p_user share an organization or an active partnership?
create or replace function public.shares_context_with(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members a
    join public.organization_members b on b.organization_id = a.organization_id
    where a.user_id = auth.uid() and b.user_id = p_user
  ) or exists (
    select 1 from public.organization_members a
    join public.partnerships pt on a.organization_id in (pt.organization_a_id, pt.organization_b_id)
    join public.organization_members b
      on b.organization_id in (pt.organization_a_id, pt.organization_b_id)
    where a.user_id = auth.uid() and b.user_id = p_user
  );
$$;

create or replace function public.can_access_conversation(p_conversation uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.conversations c
    where c.id = p_conversation
      and (
        (c.kind = 'partnership' and public.can_access_partnership(c.partnership_id))
        or (c.kind = 'direct' and (
              public.has_org_permission(c.organization_a_id, 'messages.direct')
           or public.has_org_permission(c.organization_b_id, 'messages.direct')))
      )
  );
$$;

create or replace function public.is_published_org(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organizations
    where id = p_org and profile_status = 'published' and deleted_at is null
  );
$$;

-- ─── New auth user → profile ────────────────────────────────────────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  insert into public.notification_preferences (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Column protection triggers ─────────────────────────────────────────
-- service_role (server-side admin client) and platform staff may change these;
-- regular tenants may not, even through direct API calls.
-- Must be called from SECURITY INVOKER code: current_user is then the API role
-- ('anon' / 'authenticated' for end users, 'service_role' / 'postgres' for trusted server code).
create or replace function public.is_privileged_session() returns boolean
language sql stable as $$
  select current_user not in ('anon', 'authenticated');
$$;

create or replace function public.protect_profile_columns() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if public.is_privileged_session() or public.is_super_admin() then
    return new;
  end if;
  if new.platform_role is distinct from old.platform_role
     or new.is_suspended is distinct from old.is_suspended
     or new.is_demo is distinct from old.is_demo
     or new.email is distinct from old.email then
    raise exception 'Not allowed to modify protected profile fields' using errcode = '42501';
  end if;
  if new.active_organization_id is not null
     and new.active_organization_id is distinct from old.active_organization_id
     and not public.is_org_member(new.active_organization_id) then
    raise exception 'Not a member of that organization' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_columns();

create or replace function public.protect_org_columns() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if public.is_privileged_session() or public.is_platform_staff() then
    return new;
  end if;
  if new.verification_status is distinct from old.verification_status
     or new.verified_at is distinct from old.verified_at
     or new.is_featured is distinct from old.is_featured
     or new.is_demo is distinct from old.is_demo
     or new.activity_score is distinct from old.activity_score
     or new.deleted_at is distinct from old.deleted_at
     or new.created_by is distinct from old.created_by
     or new.slug is distinct from old.slug
     or (old.profile_status = 'suspended' and new.profile_status <> 'suspended')
     or (new.profile_status = 'suspended' and old.profile_status <> 'suspended') then
    raise exception 'Not allowed to modify protected organization fields' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger organizations_protect before update on public.organizations
  for each row execute function public.protect_org_columns();

-- ─── Search document maintenance ────────────────────────────────────────
create or replace function public.organizations_search_refresh() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_industry text;
  v_services text;
begin
  select string_agg(name, ' ') into v_industry
  from public.industries where id in (new.industry_id, new.sub_industry_id);

  select string_agg(name || ' ' || coalesce(description, ''), ' ') into v_services
  from public.company_services where organization_id = new.id;

  new.search_document :=
      setweight(to_tsvector('english', coalesce(new.name, '')), 'A')
   || setweight(to_tsvector('english', coalesce(v_industry, '') || ' ' || array_to_string(new.capabilities, ' ')), 'B')
   || setweight(to_tsvector('english', coalesce(new.short_description, '') || ' ' || coalesce(v_services, '')), 'B')
   || setweight(to_tsvector('english',
        coalesce(new.city, '') || ' ' || coalesce(new.state, '') || ' ' || coalesce(new.country, '') || ' ' ||
        array_to_string(new.target_markets, ' ') || ' ' || array_to_string(new.locations_served, ' ')), 'C')
   || setweight(to_tsvector('english', coalesce(new.overview, '') || ' ' || coalesce(new.target_customers, '')), 'D');
  return new;
end $$;
create trigger organizations_search before insert or update on public.organizations
  for each row execute function public.organizations_search_refresh();

create or replace function public.touch_org_from_child() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.organizations set updated_at = now()
  where id = coalesce(new.organization_id, old.organization_id);
  return null;
end $$;
create trigger company_services_touch after insert or update or delete on public.company_services
  for each row execute function public.touch_org_from_child();

-- ─── Activity score ─────────────────────────────────────────────────────
create or replace function public.bump_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.organization_id is not null then
    update public.organizations
       set activity_score = activity_score + 1, last_active_at = now()
     where id = new.organization_id;
  end if;
  return null;
end $$;
create trigger activity_logs_bump after insert on public.activity_logs
  for each row execute function public.bump_activity();

-- ─── Application counter ────────────────────────────────────────────────
create or replace function public.refresh_application_count() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_opp uuid := coalesce(new.opportunity_id, old.opportunity_id);
begin
  update public.partnership_opportunities
     set application_count = (
       select count(*) from public.opportunity_applications
       where opportunity_id = v_opp and status <> 'withdrawn')
   where id = v_opp;
  return null;
end $$;
create trigger opportunity_applications_count after insert or update of status or delete on public.opportunity_applications
  for each row execute function public.refresh_application_count();

-- ─── Conversation last message ──────────────────────────────────────────
create or replace function public.on_message_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.conversations
     set last_message_at = new.created_at,
         last_message_preview = left(new.body, 140)
   where id = new.conversation_id;
  return null;
end $$;
create trigger partnership_messages_after_insert after insert on public.partnership_messages
  for each row execute function public.on_message_insert();

-- ─── Rate limiting (fixed window) ───────────────────────────────────────
create or replace function public.check_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count int;
begin
  insert into public.rate_limits (key, window_start, count) values (p_key, v_window, 1)
  on conflict (key, window_start) do update set count = public.rate_limits.count + 1
  returning count into v_count;
  delete from public.rate_limits where window_start < now() - interval '1 day';
  return v_count <= p_limit;
end $$;
revoke all on function public.check_rate_limit(text, int, int) from public, anon, authenticated;

-- ─── RPC: create organization (caller becomes owner) ───────────────────
create or replace function public.create_organization(p_name text, p_slug text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if (select count(*) from public.organization_members where user_id = auth.uid() and role = 'owner') >= 10 then
    raise exception 'Organization limit reached' using errcode = 'P0001';
  end if;
  insert into public.organizations (name, slug, created_by)
  values (p_name, p_slug, auth.uid()) returning id into v_org;
  insert into public.organization_members (organization_id, user_id, role) values (v_org, auth.uid(), 'owner');
  insert into public.organization_contacts (organization_id) values (v_org);
  update public.profiles set active_organization_id = v_org where id = auth.uid();
  insert into public.subscriptions (organization_id, plan_id, status, current_period_start)
  select v_org, id, 'active', now() from public.subscription_plans where code = 'free' limit 1;
  insert into public.activity_logs (organization_id, actor_id, action, entity_type, entity_id, summary)
  values (v_org, auth.uid(), 'organization.created', 'organization', v_org, 'Company created');
  return v_org;
end $$;
revoke all on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;

-- ─── RPC: accept partnership request (idempotent, creates partnership once) ─
create or replace function public.accept_partnership_request(p_request uuid, p_message text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  r public.partnership_requests;
  v_partnership uuid;
  v_title text;
begin
  select * into r from public.partnership_requests where id = p_request for update;
  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  if not public.has_org_permission(r.receiver_organization_id, 'requests.manage') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if r.status = 'accepted' and r.partnership_id is not null then
    return r.partnership_id; -- idempotent
  end if;
  if r.status not in ('sent', 'viewed', 'negotiation') then
    raise exception 'Request cannot be accepted in status %', r.status using errcode = 'P0001';
  end if;

  select s.name || ' × ' || rc.name into v_title
  from public.organizations s, public.organizations rc
  where s.id = r.sender_organization_id and rc.id = r.receiver_organization_id;

  insert into public.partnerships (organization_a_id, organization_b_id, category_id, title, objectives, request_id, is_demo)
  values (r.sender_organization_id, r.receiver_organization_id, r.category_id, v_title, r.proposed_collaboration, r.id, r.is_demo)
  returning id into v_partnership;

  update public.partnership_requests
     set status = 'accepted', responded_at = now(), last_activity_at = now(),
         response_message = coalesce(p_message, response_message), partnership_id = v_partnership
   where id = r.id;

  -- Partnership conversation + primary contacts (request creator and acceptor).
  insert into public.conversations (kind, organization_a_id, organization_b_id, partnership_id, subject, created_by)
  values ('partnership', r.sender_organization_id, r.receiver_organization_id, v_partnership, v_title, auth.uid());

  insert into public.partnership_members (partnership_id, organization_id, user_id, is_primary_contact, added_by)
  values (v_partnership, r.receiver_organization_id, auth.uid(), true, auth.uid())
  on conflict do nothing;
  if r.created_by is not null and exists (
      select 1 from public.organization_members where organization_id = r.sender_organization_id and user_id = r.created_by) then
    insert into public.partnership_members (partnership_id, organization_id, user_id, is_primary_contact, added_by)
    values (v_partnership, r.sender_organization_id, r.created_by, true, auth.uid())
    on conflict do nothing;
  end if;

  insert into public.activity_logs (organization_id, partnership_id, actor_id, action, entity_type, entity_id, summary)
  values
    (r.receiver_organization_id, v_partnership, auth.uid(), 'request.accepted', 'partnership_request', r.id, 'Partnership request accepted'),
    (r.sender_organization_id, v_partnership, auth.uid(), 'partnership.created', 'partnership', v_partnership, 'Partnership established');

  return v_partnership;
end $$;
revoke all on function public.accept_partnership_request(uuid, text) from public, anon;
grant execute on function public.accept_partnership_request(uuid, text) to authenticated;

-- ─── RPC: accept opportunity application → partnership ─────────────────
create or replace function public.accept_opportunity_application(p_application uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  a public.opportunity_applications;
  o public.partnership_opportunities;
  v_partnership uuid;
  v_title text;
begin
  select * into a from public.opportunity_applications where id = p_application for update;
  if not found then raise exception 'Application not found' using errcode = 'P0002'; end if;
  select * into o from public.partnership_opportunities where id = a.opportunity_id;
  if not public.has_org_permission(o.organization_id, 'applications.manage') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if a.status = 'accepted' and a.partnership_id is not null then return a.partnership_id; end if;
  if a.status in ('withdrawn', 'rejected') then
    raise exception 'Application cannot be accepted in status %', a.status using errcode = 'P0001';
  end if;

  -- Reuse an existing active partnership for the same pair & category.
  select id into v_partnership from public.partnerships
  where status = 'active' and category_id is not distinct from o.category_id
    and ((organization_a_id = o.organization_id and organization_b_id = a.applicant_organization_id)
      or (organization_b_id = o.organization_id and organization_a_id = a.applicant_organization_id))
  limit 1;

  if v_partnership is null then
    select s.name || ' × ' || rc.name into v_title
    from public.organizations s, public.organizations rc
    where s.id = o.organization_id and rc.id = a.applicant_organization_id;

    insert into public.partnerships (organization_a_id, organization_b_id, category_id, title, objectives, application_id, is_demo)
    values (o.organization_id, a.applicant_organization_id, o.category_id, v_title, o.title, a.id, o.is_demo)
    returning id into v_partnership;

    insert into public.conversations (kind, organization_a_id, organization_b_id, partnership_id, subject, created_by)
    values ('partnership', o.organization_id, a.applicant_organization_id, v_partnership, v_title, auth.uid());

    insert into public.partnership_members (partnership_id, organization_id, user_id, is_primary_contact, added_by)
    values (v_partnership, o.organization_id, auth.uid(), true, auth.uid()) on conflict do nothing;
    if a.submitted_by is not null then
      insert into public.partnership_members (partnership_id, organization_id, user_id, is_primary_contact, added_by)
      values (v_partnership, a.applicant_organization_id, a.submitted_by, true, auth.uid()) on conflict do nothing;
    end if;
  end if;

  update public.opportunity_applications
     set status = 'accepted', partnership_id = v_partnership, reviewed_by = auth.uid(), status_changed_at = now()
   where id = a.id;

  insert into public.activity_logs (organization_id, partnership_id, actor_id, action, entity_type, entity_id, summary)
  values (o.organization_id, v_partnership, auth.uid(), 'application.accepted', 'opportunity_application', a.id,
          'Application accepted for "' || o.title || '"');
  return v_partnership;
end $$;
revoke all on function public.accept_opportunity_application(uuid) from public, anon;
grant execute on function public.accept_opportunity_application(uuid) to authenticated;

-- ─── RPC: get organization contact (respects privacy settings) ─────────
create or replace function public.get_org_contact(p_org uuid)
returns table (email text, phone text, address text)
language sql stable security definer set search_path = public as $$
  select
    case when public.is_org_member(o.id) or public.is_platform_staff() or (o.privacy ->> 'show_email')::boolean
           or exists (select 1 from public.my_org_ids() mo where public.are_partner_orgs(mo, o.id))
         then c.email end,
    case when public.is_org_member(o.id) or public.is_platform_staff() or (o.privacy ->> 'show_phone')::boolean
           or exists (select 1 from public.my_org_ids() mo where public.are_partner_orgs(mo, o.id))
         then c.phone end,
    case when public.is_org_member(o.id) or public.is_platform_staff()
           or exists (select 1 from public.my_org_ids() mo where public.are_partner_orgs(mo, o.id))
         then c.address end
  from public.organizations o
  left join public.organization_contacts c on c.organization_id = o.id
  where o.id = p_org
    and (o.profile_status = 'published' or public.is_org_member(o.id) or public.is_platform_staff());
$$;
grant execute on function public.get_org_contact(uuid) to anon, authenticated;

-- ─── RPC: marketplace search (SECURITY INVOKER → RLS applies) ──────────
create or replace function public.search_organizations(
  p_query text default null,
  p_industry_ids uuid[] default null,
  p_country text default null,
  p_state text default null,
  p_city text default null,
  p_sizes public.company_size[] default null,
  p_founded_from int default null,
  p_founded_to int default null,
  p_verified_only boolean default false,
  p_offered uuid[] default null,
  p_wanted uuid[] default null,
  p_capabilities text[] default null,
  p_markets text[] default null,
  p_open_only boolean default false,
  p_exclude_org uuid default null,
  p_sort text default 'relevance',
  p_limit int default 12,
  p_offset int default 0
)
returns table (id uuid, total_count bigint, rank real)
language sql stable security invoker set search_path = public, extensions as $$
  with q as (
    select case when nullif(trim(p_query), '') is null then null
                else websearch_to_tsquery('english', p_query) end as tsq
  ),
  base as (
    select o.id, o.name, o.created_at, o.activity_score, o.verification_status, o.is_featured,
           case when q.tsq is null then 0
                else ts_rank_cd(o.search_document, q.tsq) + similarity(o.name, p_query) end::real as rank
    from public.organizations o, q
    where o.profile_status = 'published' and o.deleted_at is null
      and (p_exclude_org is null or o.id <> p_exclude_org)
      and (q.tsq is null or o.search_document @@ q.tsq or o.name ilike '%' || p_query || '%')
      and (p_industry_ids is null or o.industry_id = any (p_industry_ids) or o.sub_industry_id = any (p_industry_ids))
      and (p_country is null or o.country ilike p_country)
      and (p_state is null or o.state ilike p_state)
      and (p_city is null or o.city ilike p_city)
      and (p_sizes is null or o.company_size = any (p_sizes))
      and (p_founded_from is null or o.year_established >= p_founded_from)
      and (p_founded_to is null or o.year_established <= p_founded_to)
      and (not p_verified_only or o.verification_status = 'verified')
      and (not p_open_only or o.open_to_partnership)
      and (p_capabilities is null or o.capabilities && p_capabilities)
      and (p_markets is null or o.target_markets && p_markets)
      and (p_offered is null or exists (
            select 1 from public.company_partnership_preferences cp
            where cp.organization_id = o.id and cp.direction = 'offered' and cp.category_id = any (p_offered)))
      and (p_wanted is null or exists (
            select 1 from public.company_partnership_preferences cp
            where cp.organization_id = o.id and cp.direction = 'wanted' and cp.category_id = any (p_wanted)))
  )
  select b.id, count(*) over () as total_count, b.rank
  from base b
  order by
    case when p_sort = 'verified' then (b.verification_status = 'verified')::int end desc nulls last,
    case when p_sort = 'recent' then b.created_at end desc nulls last,
    case when p_sort = 'active' then b.activity_score end desc nulls last,
    case when p_sort = 'relevance' then b.rank end desc nulls last,
    b.is_featured desc, b.activity_score desc, b.name asc
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0);
$$;
grant execute on function public.search_organizations to anon, authenticated;

-- ─── RPC: public platform statistics (counts only, no private data) ────
create or replace function public.platform_public_stats()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'companies', (select count(*) from public.organizations where profile_status = 'published' and deleted_at is null),
    'verified_companies', (select count(*) from public.organizations where profile_status = 'published' and verification_status = 'verified' and deleted_at is null),
    'open_opportunities', (select count(*) from public.partnership_opportunities where status = 'published' and deleted_at is null),
    'partnerships', (select count(*) from public.partnerships where status <> 'ended'),
    'industries', (select count(distinct industry_id) from public.organizations where profile_status = 'published' and deleted_at is null),
    'countries', (select count(distinct country) from public.organizations where profile_status = 'published' and deleted_at is null),
    'demo_companies', (select count(*) from public.organizations where profile_status = 'published' and is_demo and deleted_at is null)
  );
$$;
grant execute on function public.platform_public_stats() to anon, authenticated;

-- ─── Unread message counts for the current user ────────────────────────
create or replace function public.my_unread_counts()
returns table (conversation_id uuid, unread bigint)
language sql stable security definer set search_path = public as $$
  select c.id, count(m.id)
  from public.conversations c
  join public.partnership_messages m on m.conversation_id = c.id
  left join public.conversation_reads r on r.conversation_id = c.id and r.user_id = auth.uid()
  where public.can_access_conversation(c.id)
    and m.sender_id is distinct from auth.uid()
    and m.deleted_at is null
    and m.created_at > coalesce(r.last_read_at, 'epoch'::timestamptz)
  group by c.id;
$$;
grant execute on function public.my_unread_counts() to authenticated;
