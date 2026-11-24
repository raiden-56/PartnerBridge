-- ════════════════════════════════════════════════════════════════════════
-- PartnerBridge — Storage buckets & policies
-- Private buckets are never readable directly by clients; the server issues
-- short-lived signed URLs only after an authorization check (and logs downloads).
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.try_uuid(p text) returns uuid
language plpgsql immutable as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('public-assets', 'public-assets', true, 5242880,
    array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']),
  ('partnership-files', 'partnership-files', false, 26214400, null),
  ('verification-docs', 'verification-docs', false, 10485760,
    array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']),
  ('application-files', 'application-files', false, 10485760, null)
on conflict (id) do nothing;

-- public-assets: orgs/{org_id}/... (profile managers) and users/{user_id}/... (self)
create policy "public assets read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'public-assets');
create policy "public assets write" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'public-assets' and (
      ((storage.foldername(name))[1] = 'orgs'
        and public.has_org_permission(public.try_uuid((storage.foldername(name))[2]), 'profile.manage'))
      or ((storage.foldername(name))[1] = 'users' and (storage.foldername(name))[2] = auth.uid()::text)
    ));
create policy "public assets update" on storage.objects for update to authenticated
  using (
    bucket_id = 'public-assets' and (
      ((storage.foldername(name))[1] = 'orgs'
        and public.has_org_permission(public.try_uuid((storage.foldername(name))[2]), 'profile.manage'))
      or ((storage.foldername(name))[1] = 'users' and (storage.foldername(name))[2] = auth.uid()::text)
    ));
create policy "public assets delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'public-assets' and (
      ((storage.foldername(name))[1] = 'orgs'
        and public.has_org_permission(public.try_uuid((storage.foldername(name))[2]), 'profile.manage'))
      or ((storage.foldername(name))[1] = 'users' and (storage.foldername(name))[2] = auth.uid()::text)
    ));

-- partnership-files: p/{partnership_id}/... and c/{conversation_id}/...  (upload only)
create policy "partnership files upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'partnership-files' and (
      ((storage.foldername(name))[1] = 'p'
        and public.can_access_partnership(public.try_uuid((storage.foldername(name))[2])))
      or ((storage.foldername(name))[1] = 'c'
        and public.can_access_conversation(public.try_uuid((storage.foldername(name))[2])))
    ));

-- verification-docs: {org_id}/...  (upload only; staff review via signed URLs)
create policy "verification docs upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'verification-docs'
    and public.has_org_permission(public.try_uuid((storage.foldername(name))[1]), 'verification.manage'));

-- application-files: {applicant_org_id}/...
create policy "application files upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'application-files'
    and public.has_org_permission(public.try_uuid((storage.foldername(name))[1]), 'applications.manage'));
