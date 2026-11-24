# Security, privacy & reliability

## Authorization layers
1. **Proxy** (`src/proxy.ts`) refreshes the session and redirects anonymous users away from `/dashboard`, `/admin`, `/onboarding`.
2. **Server actions / route handlers** re-authenticate and authorize every call (`requireUser`, `requireOrg(permission)`, `requirePartnershipAccess`, `requireStaff`). The UI hiding a button is never the only control.
3. **Row Level Security** is enabled on every table (`20261123000003_rls.sql`). Policies use SECURITY DEFINER helpers with fixed `search_path` to avoid recursion.
4. **Column-protection triggers** stop tenants from changing `verification_status`, `is_featured`, suspension, `platform_role`, etc. even through direct PostgREST calls with their own JWT.

## Tenant isolation — verified
`npm run db:check` applies all migrations to an embedded Postgres with Supabase role stubs and asserts, as real `authenticated` users:
- draft companies, private contacts, requests, partnerships, messages, tasks and documents are invisible to other tenants;
- users cannot self-verify, escalate their platform role, join another company, spoof the sender company of a request or a message, or post into a workspace they don't belong to;
- "internal" documents are hidden from the partner company;
- deal revenue cannot be self-verified on insert;
- storage uploads into another company's partnership folder are rejected and private buckets are not directly readable;
- request acceptance is idempotent (exactly one partnership);
- applicants cannot accept their own application; owners cannot apply to their own opportunity;
- the rate-limit function is not callable by clients.

Changing IDs in URLs therefore yields 404s (pages call `notFound()` when RLS returns nothing) rather than data.

## Files
- Buckets: `public-assets` (logos/covers/avatars, public), `partnership-files`, `verification-docs`, `application-files` (private).
- Uploads go through server actions with the **user's** session so storage RLS applies; type & size validated (`lib/storage.ts`).
- Private files are only served via **60–120 s signed URLs** generated after an authorization check; workspace document downloads are written to `document_access_logs`.

## Secrets
- `SUPABASE_SERVICE_ROLE_KEY`, Razorpay secrets, VAPID private key and `CRON_SECRET` are read only via `serverEnv()` inside `server-only` modules. Nothing secret is prefixed `NEXT_PUBLIC_`.

## Payments
- Amount is computed server-side from the plan; the client cannot set it.
- Checkout callback signatures (`order_id|payment_id`) and webhook signatures (raw body) are verified with HMAC-SHA256 using timing-safe comparison.
- `markPaymentPaid` is idempotent; webhook events are de-duplicated in `webhook_events`.

## Abuse prevention
- DB-backed rate limits (`check_rate_limit`) on auth, requests, applications, messages, reports and the contact form (limits editable in Admin → Settings).
- Honeypot field on the public contact form; open-redirect protection on all `next` parameters; CSV export neutralises formula injection.
- Report & block workflows; admin request-abuse monitoring (volume & rejection rate); moderators can cancel requests, remove opportunities and suspend companies/users. All admin actions are written to `audit_logs`.
- Moderators do **not** get access to private partnership workspaces or documents.

## PWA caching rules
- Static assets: cache-first. Public marketing pages: network-first with offline copy, **never** when rendered for a signed-in user (`x-pb-public: 0`).
- `/dashboard`, `/admin`, `/api`, `/auth`, `/onboarding`, `/invite` are never cached.
- No tokens or agreements are put in localStorage/IndexedDB. The only IndexedDB use is the offline message outbox (text typed by the user, per device) which is deleted on sign-out together with runtime caches.

## Privacy (DPDP-oriented)
- Explicit consent at sign-up; per-channel notification preferences; push only after an explicit click.
- Contact details private by default with per-field visibility toggles.
- Self-service **data export** (`/api/account/export`) and **account deletion** (anonymises profile, removes memberships, deletes auth user; blocks if the user owns a company with other members).
- Legal review of the privacy policy, terms, retention periods and Grievance Officer details is required before launch.

## Backups & reliability
See `DEPLOYMENT.md#backups`.
