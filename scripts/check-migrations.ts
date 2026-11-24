/**
 * Applies every migration in supabase/migrations to an in-process Postgres
 * (PGlite) with minimal Supabase stubs (auth, storage, roles), then runs a
 * tenant-isolation test suite against the real RLS policies.
 *
 *   npm run db:check
 *
 * This verifies SQL syntax, policy recursion and the core security rules
 * without needing a running Supabase instance.
 */
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const SUPABASE_STUBS = `
create schema extensions;
set search_path = public, extensions;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
grant usage on schema public, auth, storage, extensions to anon, authenticated, service_role;
alter role authenticated set search_path = public, extensions;
alter role anon set search_path = public, extensions;
`;

const GRANTS = `
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema storage to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated;
`;

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}`, detail ?? "");
  }
}

async function main() {
  const db = new PGlite({ extensions: { pgcrypto, pg_trgm } });
  await db.exec(SUPABASE_STUBS);

  const dir = path.join(process.cwd(), "supabase", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    try {
      await db.exec(readFileSync(path.join(dir, f), "utf8"));
      console.log(`✓ applied ${f}`);
    } catch (e) {
      console.error(`✗ failed ${f}:`, (e as Error).message);
      process.exit(1);
    }
  }
  await db.exec(GRANTS);

  // ── helpers ──────────────────────────────────────────────────────────
  const asUser = async <T = Record<string, unknown>>(uid: string | null, sql: string, params: unknown[] = []) => {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false);`);
    await db.exec(uid ? "set role authenticated" : "set role anon");
    try {
      return (await db.query<T>(sql, params)).rows;
    } finally {
      await db.exec("reset role");
    }
  };
  const asAdmin = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    (await db.query<T>(sql, params)).rows;
  const expectError = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      return false;
    } catch {
      return true;
    }
  };

  console.log("\nTenant isolation & workflow tests");
  const [alice] = await asAdmin<{ id: string }>(`insert into auth.users (email, raw_user_meta_data) values ('alice@a.test', '{"full_name":"Alice"}') returning id`);
  const [bob] = await asAdmin<{ id: string }>(`insert into auth.users (email, raw_user_meta_data) values ('bob@b.test', '{"full_name":"Bob"}') returning id`);
  const [carol] = await asAdmin<{ id: string }>(`insert into auth.users (email) values ('carol@c.test') returning id`);
  check("profiles auto-created", (await asAdmin(`select 1 from profiles`)).length === 3);

  const [{ create_organization: orgA }] = await asUser<{ create_organization: string }>(alice.id, `select create_organization('Alpha Ltd', 'alpha')`);
  const [{ create_organization: orgB }] = await asUser<{ create_organization: string }>(bob.id, `select create_organization('Beta Ltd', 'beta')`);
  const [{ create_organization: orgC }] = await asUser<{ create_organization: string }>(carol.id, `select create_organization('Gamma Ltd', 'gamma')`);
  check("owner membership created", (await asAdmin(`select 1 from organization_members where role='owner'`)).length === 3);
  check("free subscription created", (await asAdmin(`select 1 from subscriptions where status='active'`)).length === 3);

  // Draft orgs are private
  check("draft org hidden from other tenants", (await asUser(bob.id, `select id from organizations where id=$1`, [orgA])).length === 0);
  check("draft org hidden from anon", (await asUser(null, `select id from organizations where id=$1`, [orgA])).length === 0);

  // Publish A & B
  await asUser(alice.id, `update organizations set profile_status='published', short_description='Alpha builds web apps', capabilities='{web}' where id=$1`, [orgA]);
  await asUser(bob.id, `update organizations set profile_status='published' where id=$1`, [orgB]);
  check("published org visible to anon", (await asUser(null, `select id from organizations where id=$1`, [orgA])).length === 1);
  check("search finds org", (await asUser(null, `select id from search_organizations(p_query => 'web apps')`)).length === 1);

  // Tenants cannot self-verify or edit another org
  check("cannot self-verify", await expectError(() => asUser(alice.id, `update organizations set verification_status='verified' where id=$1`, [orgA])));
  const hijack = await asUser(bob.id, `update organizations set name='Hacked' where id=$1 returning id`, [orgA]);
  check("cannot update another company's profile", hijack.length === 0);
  check("cannot escalate own platform role", await expectError(() => asUser(alice.id, `update profiles set platform_role='super_admin' where id=$1`, [alice.id])));
  check("cannot insert self into another org", await expectError(() => asUser(bob.id, `insert into organization_members (organization_id, user_id, role) values ($1, $2, 'admin')`, [orgA, bob.id])));

  // Private contacts
  await asUser(alice.id, `update organization_contacts set email='private@alpha.test', phone='+91 99999' where organization_id=$1`, [orgA]);
  check("contacts table hidden from others", (await asUser(bob.id, `select * from organization_contacts where organization_id=$1`, [orgA])).length === 0);
  const [contact] = await asUser<{ email: string | null }>(bob.id, `select * from get_org_contact($1)`, [orgA]);
  check("get_org_contact respects privacy", contact.email === null, contact);

  // Request B → A
  const [req] = await asUser<{ id: string }>(bob.id,
    `insert into partnership_requests (sender_organization_id, receiver_organization_id, category_id, subject, introduction, proposed_collaboration, status, sent_at, created_by)
     values ($1, $2, (select id from partnership_categories where slug='marketing'), 'Co-marketing proposal', 'Hello Alpha', 'Joint webinars', 'sent', now(), $3) returning id`,
    [orgB, orgA, bob.id]);
  check("duplicate open request blocked", await expectError(() => asUser(bob.id,
    `insert into partnership_requests (sender_organization_id, receiver_organization_id, category_id, subject, introduction, proposed_collaboration, status, created_by)
     values ($1, $2, (select id from partnership_categories where slug='marketing'), 'Co-marketing again', 'Hi', 'Again', 'sent', $3)`, [orgB, orgA, bob.id])));
  check("request spoofing another sender blocked", await expectError(() => asUser(carol.id,
    `insert into partnership_requests (sender_organization_id, receiver_organization_id, category_id, subject, introduction, proposed_collaboration, status, created_by)
     values ($1, $2, (select id from partnership_categories where slug='referral'), 'Spoofed request', 'Hi', 'x', 'sent', $3)`, [orgB, orgA, carol.id])));
  check("receiver sees request", (await asUser(alice.id, `select id from partnership_requests where id=$1`, [req.id])).length === 1);
  check("third party cannot see request", (await asUser(carol.id, `select id from partnership_requests where id=$1`, [req.id])).length === 0);
  check("sender cannot accept own request", await expectError(() => asUser(bob.id, `select accept_partnership_request($1)`, [req.id])));

  const [{ accept_partnership_request: pid }] = await asUser<{ accept_partnership_request: string }>(alice.id, `select accept_partnership_request($1)`, [req.id]);
  const [{ accept_partnership_request: pid2 }] = await asUser<{ accept_partnership_request: string }>(alice.id, `select accept_partnership_request($1)`, [req.id]);
  check("accept is idempotent (one partnership)", pid === pid2 && (await asAdmin(`select 1 from partnerships`)).length === 1);

  // Workspace access
  check("both sides access workspace", (await asUser(alice.id, `select can_access_partnership($1) ok`, [pid]))[0].ok === true
    && (await asUser(bob.id, `select can_access_partnership($1) ok`, [pid]))[0].ok === true);
  check("outsider cannot read partnership", (await asUser(carol.id, `select id from partnerships where id=$1`, [pid])).length === 0);

  const [conv] = await asUser<{ id: string }>(alice.id, `select id from conversations where partnership_id=$1`, [pid]);
  await asUser(alice.id, `insert into partnership_messages (conversation_id, partnership_id, sender_id, sender_organization_id, body) values ($1,$2,$3,$4,'Welcome aboard!')`, [conv.id, pid, alice.id, orgA]);
  check("partner reads message", (await asUser(bob.id, `select body from partnership_messages where conversation_id=$1`, [conv.id])).length === 1);
  check("outsider cannot read messages", (await asUser(carol.id, `select body from partnership_messages`)).length === 0);
  check("outsider cannot post message", await expectError(() => asUser(carol.id,
    `insert into partnership_messages (conversation_id, partnership_id, sender_id, sender_organization_id, body) values ($1,$2,$3,$4,'spam')`, [conv.id, pid, carol.id, orgC])));
  check("cannot impersonate sender org", await expectError(() => asUser(bob.id,
    `insert into partnership_messages (conversation_id, partnership_id, sender_id, sender_organization_id, body) values ($1,$2,$3,$4,'fake')`, [conv.id, pid, bob.id, orgA])));
  const [{ unread }] = await asUser<{ unread: number }>(bob.id, `select unread from my_unread_counts() where conversation_id=$1`, [conv.id]);
  check("unread count computed", Number(unread) === 1);

  await asUser(bob.id, `insert into partnership_tasks (partnership_id, title, responsible_organization_id, created_by) values ($1,'Draft campaign brief',$2,$3)`, [pid, orgB, bob.id]);
  check("task visible to partner", (await asUser(alice.id, `select 1 from partnership_tasks where partnership_id=$1`, [pid])).length === 1);
  check("task invisible to outsider", (await asUser(carol.id, `select 1 from partnership_tasks`)).length === 0);
  check("outsider cannot create task", await expectError(() => asUser(carol.id, `insert into partnership_tasks (partnership_id, title) values ($1,'x task')`, [pid])));

  // Internal documents
  await asUser(alice.id, `insert into partnership_documents (partnership_id, owner_organization_id, title, access_level, storage_path, file_name, mime_type, size_bytes, uploaded_by)
    values ($1,$2,'Internal pricing','internal','p/x/a.pdf','a.pdf','application/pdf',10,$3)`, [pid, orgA, alice.id]);
  await asUser(alice.id, `insert into partnership_documents (partnership_id, owner_organization_id, title, access_level, storage_path, file_name, mime_type, size_bytes, uploaded_by)
    values ($1,$2,'Shared deck','shared','p/x/b.pdf','b.pdf','application/pdf',10,$3)`, [pid, orgA, alice.id]);
  check("internal doc hidden from partner", (await asUser(bob.id, `select title from partnership_documents`)).length === 1);

  // Deals: cannot self-verify revenue on insert
  check("deal insert cannot set verified revenue", await expectError(() => asUser(bob.id,
    `insert into partnership_deals (partnership_id, title, customer_name, owner_organization_id, verified_revenue) values ($1,'Deal X','Cust',$2,1000)`, [pid, orgB])));

  // Storage policies
  check("storage upload into own partnership allowed", (await asUser(bob.id,
    `insert into storage.objects (bucket_id, name) values ('partnership-files', $1)`, [`p/${pid}/doc.pdf`]).then(() => true, () => false)));
  check("storage upload into foreign partnership denied", await expectError(() => asUser(carol.id,
    `insert into storage.objects (bucket_id, name) values ('partnership-files', $1)`, [`p/${pid}/evil.pdf`])));
  check("private bucket not directly readable", (await asUser(bob.id, `select 1 from storage.objects where bucket_id='partnership-files'`)).length === 0);

  // Stats & opportunities
  const [{ platform_public_stats: stats }] = await asUser<{ platform_public_stats: { companies: number } }>(null, `select platform_public_stats()`);
  check("public stats from real data", stats.companies === 2, stats);
  await asUser(alice.id, `insert into partnership_opportunities (organization_id, title, description, status, published_at, created_by) values ($1,'Looking for resellers in Karnataka','We need resellers','published',now(),$2)`, [orgA, alice.id]);
  const [opp] = await asAdmin<{ id: string }>(`select id from partnership_opportunities limit 1`);
  check("cannot apply to own opportunity", await expectError(() => asUser(alice.id,
    `insert into opportunity_applications (opportunity_id, applicant_organization_id, proposal, submitted_by) values ($1,$2,'We would love to resell your product line.',$3)`, [opp.id, orgA, alice.id])));
  await asUser(carol.id, `insert into opportunity_applications (opportunity_id, applicant_organization_id, proposal, submitted_by) values ($1,$2,'We would love to resell your product line.',$3)`, [opp.id, orgC, carol.id]);
  check("application counter maintained", (await asAdmin<{ application_count: number }>(`select application_count from partnership_opportunities where id=$1`, [opp.id]))[0].application_count === 1);
  check("bob cannot see carol's application", (await asUser(bob.id, `select 1 from opportunity_applications`)).length === 0);
  const [app] = await asAdmin<{ id: string }>(`select id from opportunity_applications limit 1`);
  check("applicant cannot accept own application", await expectError(() => asUser(carol.id, `select accept_opportunity_application($1)`, [app.id])));
  await asUser(alice.id, `select accept_opportunity_application($1)`, [app.id]);
  check("application acceptance creates partnership", (await asAdmin(`select 1 from partnerships`)).length === 2);

  // Rate limiter not callable by clients
  check("rate limiter not exposed", await expectError(() => asUser(bob.id, `select check_rate_limit('x', 1, 60)`)));

  console.log(failures === 0 ? "\nAll checks passed ✅" : `\n${failures} check(s) failed ❌`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
