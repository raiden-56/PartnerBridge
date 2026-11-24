-- ════════════════════════════════════════════════════════════════════════
-- PartnerBridge — Row Level Security
-- Default-deny: RLS is enabled on every table. Tables without a write policy
-- can only be written by SECURITY DEFINER RPCs or by the server-side
-- service-role client after explicit authorization checks in server actions.
-- ════════════════════════════════════════════════════════════════════════

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','industries','partnership_categories','organizations','organization_contacts','organization_members',
    'organization_invitations','organization_verifications','company_services','company_partnership_preferences',
    'company_saved','organization_blocks','partner_recommendations','partnership_opportunities','opportunity_applications',
    'partnership_requests','partnerships','partnership_members','conversations','partnership_messages',
    'message_attachments','conversation_reads','partnership_tasks','task_comments','partnership_milestones',
    'partnership_documents','document_versions','document_access_logs','partnership_agreements','agreement_versions',
    'partnership_deals','referrals','notifications','notification_preferences','push_subscriptions','activity_logs',
    'audit_logs','subscription_plans','subscriptions','payments','webhook_events','reports','platform_settings',
    'announcements','email_templates','contact_messages','rate_limits','data_export_requests']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Definer helpers used by policies to avoid cross-table policy recursion.
create or replace function public.opportunity_org(p_opp uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select organization_id from public.partnership_opportunities where id = p_opp;
$$;
create or replace function public.my_org_applied_to(p_opp uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.opportunity_applications a
                 where a.opportunity_id = p_opp and a.applicant_organization_id in (select public.my_org_ids()));
$$;
create or replace function public.opportunity_open_for(p_opp uuid, p_applicant uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.partnership_opportunities o
                 where o.id = p_opp and o.status = 'published' and o.accepting_applications and o.deleted_at is null
                   and (o.deadline is null or o.deadline >= current_date)
                   and o.organization_id <> p_applicant
                   and (o.visibility <> 'verified_only' or exists (
                        select 1 from public.organizations x where x.id = p_applicant and x.verification_status = 'verified')));
$$;
create or replace function public.has_request_with(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.partnership_requests r
                 where (r.sender_organization_id = p_org and r.status <> 'draft' and r.receiver_organization_id in (select public.my_org_ids()))
                    or (r.receiver_organization_id = p_org and r.sender_organization_id in (select public.my_org_ids())))
      or exists (select 1 from public.opportunity_applications a
                 join public.partnership_opportunities o on o.id = a.opportunity_id
                 where (a.applicant_organization_id = p_org and o.organization_id in (select public.my_org_ids()))
                    or (o.organization_id = p_org and a.applicant_organization_id in (select public.my_org_ids())));
$$;
create or replace function public.document_visible(p_doc uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.partnership_documents d where d.id = p_doc
                 and public.can_access_partnership(d.partnership_id)
                 and (d.access_level = 'shared' or public.is_org_member(d.owner_organization_id)));
$$;

-- ─── profiles ───────────────────────────────────────────────────────────
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_context_with(id) or public.is_platform_staff());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- ─── taxonomy & public catalog ──────────────────────────────────────────
create policy industries_read on public.industries for select to anon, authenticated using (is_active or public.is_platform_staff());
create policy industries_admin on public.industries for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy categories_read on public.partnership_categories for select to anon, authenticated using (is_active or public.is_platform_staff());
create policy categories_admin on public.partnership_categories for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy plans_read on public.subscription_plans for select to anon, authenticated
  using ((is_active and is_public) or public.is_super_admin());
create policy announcements_read on public.announcements for select to anon, authenticated
  using ((is_active and starts_at <= now() and (ends_at is null or ends_at > now())) or public.is_platform_staff());

-- ─── organizations ──────────────────────────────────────────────────────
create policy organizations_read on public.organizations for select to anon, authenticated
  using (
    (profile_status = 'published' and deleted_at is null)
    or public.is_org_member(id)
    or public.is_platform_staff()
    or exists (select 1 from public.my_org_ids() mo where public.are_partner_orgs(mo, id))
    -- counterparties of a request / application can see each other even if a profile is unpublished later
    or public.has_request_with(id)
  );
create policy organizations_update on public.organizations for update to authenticated
  using (public.has_org_permission(id, 'profile.manage') or public.is_platform_staff())
  with check (public.has_org_permission(id, 'profile.manage') or public.is_platform_staff());

create policy org_contacts_read on public.organization_contacts for select to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_staff());
create policy org_contacts_write on public.organization_contacts for update to authenticated
  using (public.has_org_permission(organization_id, 'profile.manage'))
  with check (public.has_org_permission(organization_id, 'profile.manage'));

create policy org_members_read on public.organization_members for select to authenticated
  using (
    public.is_org_member(organization_id)
    or public.is_platform_staff()
    or exists (select 1 from public.my_org_ids() mo where public.are_partner_orgs(mo, organization_id))
  );
-- membership writes: server actions (service role) after team.manage checks.

create policy org_invites_read on public.organization_invitations for select to authenticated
  using (public.has_org_permission(organization_id, 'team.manage'));

create policy org_verif_read on public.organization_verifications for select to authenticated
  using (public.has_org_permission(organization_id, 'verification.manage') or public.is_platform_staff());
create policy org_verif_insert on public.organization_verifications for insert to authenticated
  with check (public.has_org_permission(organization_id, 'verification.manage') and status = 'pending'
              and reviewer_id is null and reviewed_at is null);

create policy services_read on public.company_services for select to anon, authenticated
  using (public.is_published_org(organization_id) or public.is_org_member(organization_id) or public.is_platform_staff());
create policy services_write on public.company_services for all to authenticated
  using (public.has_org_permission(organization_id, 'profile.manage'))
  with check (public.has_org_permission(organization_id, 'profile.manage'));

create policy prefs_read on public.company_partnership_preferences for select to anon, authenticated
  using (public.is_published_org(organization_id) or public.is_org_member(organization_id) or public.is_platform_staff());
create policy prefs_write on public.company_partnership_preferences for all to authenticated
  using (public.has_org_permission(organization_id, 'profile.manage'))
  with check (public.has_org_permission(organization_id, 'profile.manage'));

create policy saved_all on public.company_saved for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id) and saved_by = auth.uid());

create policy blocks_all on public.organization_blocks for all to authenticated
  using (public.has_org_permission(organization_id, 'requests.manage'))
  with check (public.has_org_permission(organization_id, 'requests.manage'));

create policy recs_read on public.partner_recommendations for select to authenticated
  using (public.is_org_member(organization_id));
create policy recs_dismiss on public.partner_recommendations for update to authenticated
  using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

-- ─── opportunities & applications ───────────────────────────────────────
create policy opp_read on public.partnership_opportunities for select to anon, authenticated
  using (
    (status in ('published', 'paused', 'closed') and deleted_at is null and public.is_published_org(organization_id)
      and (visibility = 'public' or auth.uid() is not null))
    or public.is_org_member(organization_id)
    or public.is_platform_staff()
    or public.my_org_applied_to(id)
  );
create policy opp_insert on public.partnership_opportunities for insert to authenticated
  with check (public.has_org_permission(organization_id, 'opportunities.manage') and status in ('draft', 'published'));
create policy opp_update on public.partnership_opportunities for update to authenticated
  using (public.has_org_permission(organization_id, 'opportunities.manage') and status <> 'removed')
  with check (public.has_org_permission(organization_id, 'opportunities.manage') and status <> 'removed');

create policy app_read on public.opportunity_applications for select to authenticated
  using (
    public.is_org_member(applicant_organization_id)
    or public.has_org_permission(public.opportunity_org(opportunity_id), 'applications.manage')
  );
create policy app_insert on public.opportunity_applications for insert to authenticated
  with check (
    public.has_org_permission(applicant_organization_id, 'applications.manage')
    and submitted_by = auth.uid() and status = 'submitted'
    and public.opportunity_open_for(opportunity_id, applicant_organization_id)
  );
-- status transitions happen in server actions (service role) / accept RPC.

-- ─── partnership requests ───────────────────────────────────────────────
create policy req_read on public.partnership_requests for select to authenticated
  using (
    (public.has_org_permission(sender_organization_id, 'requests.manage'))
    or (public.has_org_permission(receiver_organization_id, 'requests.manage') and status <> 'draft')
    or public.is_platform_staff()
  );
create policy req_insert on public.partnership_requests for insert to authenticated
  with check (
    public.has_org_permission(sender_organization_id, 'requests.manage')
    and created_by = auth.uid() and status in ('draft', 'sent') and partnership_id is null
    and public.is_published_org(receiver_organization_id)
    and not exists (select 1 from public.organization_blocks b
                    where b.organization_id = receiver_organization_id and b.blocked_organization_id = sender_organization_id)
  );
create policy req_update_draft on public.partnership_requests for update to authenticated
  using (public.has_org_permission(sender_organization_id, 'requests.manage') and status = 'draft')
  with check (public.has_org_permission(sender_organization_id, 'requests.manage') and status in ('draft', 'sent')
              and partnership_id is null);
create policy req_delete_draft on public.partnership_requests for delete to authenticated
  using (public.has_org_permission(sender_organization_id, 'requests.manage') and status = 'draft');

-- ─── partnerships & workspace ───────────────────────────────────────────
create policy partnerships_read on public.partnerships for select to authenticated
  using (public.can_access_partnership(id)
         or public.has_org_permission(organization_a_id, 'analytics.view')
         or public.has_org_permission(organization_b_id, 'analytics.view'));
create policy partnerships_update on public.partnerships for update to authenticated
  using (public.can_access_partnership(id)) with check (public.can_access_partnership(id));

create policy pmembers_read on public.partnership_members for select to authenticated
  using (public.can_access_partnership(partnership_id));
create policy pmembers_write on public.partnership_members for all to authenticated
  using (public.has_org_permission(organization_id, 'workspaces.all') and public.can_access_partnership(partnership_id))
  with check (public.has_org_permission(organization_id, 'workspaces.all') and public.can_access_partnership(partnership_id));

create policy conv_read on public.conversations for select to authenticated
  using (public.can_access_conversation(id));

create policy msg_read on public.partnership_messages for select to authenticated
  using (public.can_access_conversation(conversation_id));
create policy msg_insert on public.partnership_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.can_access_conversation(conversation_id)
    and public.is_org_member(sender_organization_id)
    and exists (select 1 from public.conversations c where c.id = conversation_id
                and sender_organization_id in (c.organization_a_id, c.organization_b_id)
                and (c.partnership_id is null or partnership_id = c.partnership_id))
  );
create policy msg_update_own on public.partnership_messages for update to authenticated
  using (sender_id = auth.uid()) with check (sender_id = auth.uid());

create policy attach_read on public.message_attachments for select to authenticated
  using (public.can_access_conversation(conversation_id));
create policy attach_insert on public.message_attachments for insert to authenticated
  with check (public.can_access_conversation(conversation_id)
              and exists (select 1 from public.partnership_messages m where m.id = message_id and m.sender_id = auth.uid()));

create policy reads_read on public.conversation_reads for select to authenticated
  using (public.can_access_conversation(conversation_id));
create policy reads_upsert on public.conversation_reads for insert to authenticated
  with check (user_id = auth.uid() and public.can_access_conversation(conversation_id) and public.is_org_member(organization_id));
create policy reads_update on public.conversation_reads for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Generic workspace tables: full CRUD for workspace members.
create policy tasks_all on public.partnership_tasks for all to authenticated
  using (public.can_access_partnership(partnership_id)) with check (public.can_access_partnership(partnership_id));
create policy task_comments_read on public.task_comments for select to authenticated
  using (public.can_access_partnership(partnership_id));
create policy task_comments_insert on public.task_comments for insert to authenticated
  with check (public.can_access_partnership(partnership_id) and author_id = auth.uid()
              and exists (select 1 from public.partnership_tasks t where t.id = task_id and t.partnership_id = partnership_id));
create policy milestones_all on public.partnership_milestones for all to authenticated
  using (public.can_access_partnership(partnership_id)) with check (public.can_access_partnership(partnership_id));

-- Documents: 'internal' documents only visible to the uploading company.
create policy docs_read on public.partnership_documents for select to authenticated
  using (public.can_access_partnership(partnership_id)
         and (access_level = 'shared' or public.is_org_member(owner_organization_id)));
create policy docs_insert on public.partnership_documents for insert to authenticated
  with check (public.can_access_partnership(partnership_id) and public.is_org_member(owner_organization_id)
              and uploaded_by = auth.uid());
create policy docs_update on public.partnership_documents for update to authenticated
  using (public.can_access_partnership(partnership_id) and public.is_org_member(owner_organization_id))
  with check (public.can_access_partnership(partnership_id) and public.is_org_member(owner_organization_id));
create policy docver_read on public.document_versions for select to authenticated
  using (public.document_visible(document_id));
create policy docver_insert on public.document_versions for insert to authenticated
  with check (public.can_access_partnership(partnership_id) and uploaded_by = auth.uid());
create policy doclog_read on public.document_access_logs for select to authenticated
  using (public.document_visible(document_id));

create policy agreements_read on public.partnership_agreements for select to authenticated
  using (public.can_access_partnership(partnership_id));
create policy agreements_insert on public.partnership_agreements for insert to authenticated
  with check (public.can_access_partnership(partnership_id) and created_by = auth.uid()
              and approval_a_at is null and approval_b_at is null);
-- agreement edits & approvals go through server actions (each company can only approve for itself).
create policy agrver_read on public.agreement_versions for select to authenticated
  using (public.can_access_partnership(partnership_id));

create policy deals_read on public.partnership_deals for select to authenticated
  using (public.can_access_partnership(partnership_id));
create policy deals_insert on public.partnership_deals for insert to authenticated
  with check (public.can_access_partnership(partnership_id) and public.is_org_member(owner_organization_id)
              and verified_revenue is null and verified_at is null);
-- deal updates via server actions (revenue verification must come from the counterpart company).

create policy referrals_read on public.referrals for select to authenticated
  using (public.can_access_partnership(partnership_id)
         or public.has_org_permission(from_organization_id, 'analytics.view')
         or public.has_org_permission(to_organization_id, 'analytics.view'));

-- ─── notifications ──────────────────────────────────────────────────────
create policy notif_read on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notif_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notif_delete on public.notifications for delete to authenticated using (user_id = auth.uid());
create policy notif_prefs_all on public.notification_preferences for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_subs_all on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─── activity / audit ───────────────────────────────────────────────────
create policy activity_read on public.activity_logs for select to authenticated
  using ((partnership_id is not null and public.can_access_partnership(partnership_id))
      or (partnership_id is null and organization_id is not null and public.is_org_member(organization_id)));
create policy audit_read on public.audit_logs for select to authenticated using (public.is_super_admin());

-- ─── billing ────────────────────────────────────────────────────────────
create policy subs_read on public.subscriptions for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin());
create policy payments_read on public.payments for select to authenticated
  using (public.has_org_permission(organization_id, 'billing.manage') or public.is_super_admin());

-- ─── moderation ─────────────────────────────────────────────────────────
create policy reports_insert on public.reports for insert to authenticated
  with check (reporter_id = auth.uid());
create policy reports_read on public.reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_platform_staff());
create policy settings_read on public.platform_settings for select to authenticated using (public.is_platform_staff());
create policy templates_read on public.email_templates for select to authenticated using (public.is_super_admin());
create policy contact_read on public.contact_messages for select to authenticated using (public.is_platform_staff());
create policy exports_read on public.data_export_requests for select to authenticated using (user_id = auth.uid());
-- webhook_events, rate_limits: no client access at all.

-- ─── Realtime publication ───────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.partnership_messages, public.notifications, public.conversation_reads;
  end if;
end $$;
