# Deployment

## Recommended: Vercel + Supabase (Mumbai region `ap-south-1` for Indian data residency)
1. Create the Supabase project; apply `supabase/migrations/*` in order (`supabase db push`).
2. Supabase → Auth: Site URL = production URL; redirect URLs include `https://<domain>/auth/callback`; enable email confirmations; configure SMTP.
3. Create a Vercel project from this repo and add every variable from `.env.example` (production values). `NEXT_PUBLIC_APP_URL` must be the public URL (used for email links and OAuth redirects).
4. Deploy. `vercel.json` registers the daily cron (`/api/cron/daily`); set `CRON_SECRET` — Vercel sends it as a Bearer token automatically when the env var is named `CRON_SECRET`.
5. Configure the Razorpay webhook (see `INTEGRATIONS.md`).
6. Promote your own account to super admin once:
   ```sql
   update public.profiles set platform_role = 'super_admin' where email = 'you@company.com';
   ```
7. Do **not** run the demo seed in production (or remove demo data with `npm run db:seed -- --reset` followed by deleting the admin/moderator demo users).

## Pre-launch checklist
- [ ] `npm run typecheck && npm test && npm run db:check && npm run build` pass
- [ ] Legal review: privacy policy, terms, DPDP notice, Grievance Officer, GST details on invoices
- [ ] Email domain verified (SPF/DKIM), Supabase SMTP configured
- [ ] Razorpay live keys + webhook, a ₹1 test plan purchase and refund
- [ ] VAPID keys set; test push on Android Chrome and installed iOS PWA
- [ ] Lighthouse PWA/accessibility checks on mobile
- [ ] Rate limits reviewed in Admin → Settings
- [ ] Error monitoring (e.g. Sentry) and uptime checks configured

## Backups
- **Database:** Supabase Pro daily backups + Point-in-Time Recovery (recommended: PITR 7 days). Additionally run a weekly logical dump to separate storage:
  `pg_dump "$DATABASE_URL" -Fc -f partnerbridge-$(date +%F).dump` (encrypt and store in a different provider/region; retain 30–90 days).
- **Storage buckets:** schedule a weekly sync of `partnership-files`, `verification-docs`, `application-files` to an encrypted bucket (e.g. `rclone` with the S3-compatible Supabase storage endpoint).
- **Restore drill:** restore the latest dump into a staging project quarterly and run `npm run db:check`-style smoke tests.
- Migrations are forward-only and versioned; never edit an applied migration — add a new one.

## Scaling notes
- Discovery uses a GIN full-text index plus trigram name search; partner recommendations are cached in `partner_recommendations`.
- Large analytics windows can be moved to materialised views refreshed by the daily cron.
- Realtime channels are per-conversation and per-user.
