# Integrations

## Razorpay (subscriptions)
1. Create API keys (Dashboard → Settings → API Keys). Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `NEXT_PUBLIC_RAZORPAY_KEY_ID` (same key id).
2. Add a webhook → URL `https://<app>/api/webhooks/razorpay`, events `payment.captured`, `order.paid`, `payment.failed`, secret → `RAZORPAY_WEBHOOK_SECRET`.
3. Flow: *Billing → Upgrade* → server creates an Order (amount from DB plan) → Razorpay Checkout → browser posts `order_id/payment_id/signature` → server verifies HMAC → subscription activated. The webhook performs the same activation independently (idempotent), so a closed tab never loses a payment.
4. Renewals use one-time Orders per period with reminder emails 7 days before expiry and a 3-day grace period (cron). To move to Razorpay Subscriptions (auto-debit), implement `createSubscription` in `src/lib/billing/provider.ts` and map `subscription.charged` webhook events to `markPaymentPaid`.
5. Other providers: implement the `PaymentProvider` interface and return it from `getPaymentProvider()`.

## Email (Resend)
Set `RESEND_API_KEY` and `EMAIL_FROM` (verified domain). Templates are editable in **Admin → Email templates** (`{{placeholders}}`). Without a key, emails are logged to the server console and nothing is sent. Supabase Auth emails (verification, reset) are sent by Supabase — configure SMTP in the Supabase dashboard for production.

## Web Push
`npm run vapid` → set `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Users enable push per device in **Settings → Notifications**; permission is requested only on that click. Expired subscriptions are removed automatically (404/410). iOS requires the app to be installed to the Home Screen (iOS 16.4+).

## Google / Microsoft sign-in
Enable the provider in Supabase (Auth → Providers) with your OAuth client, add `<SUPABASE_URL>/auth/v1/callback` as the redirect URI in Google/Azure, then set `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true` / `NEXT_PUBLIC_AUTH_AZURE_ENABLED=true`.

## E-signature (optional)
Workspace approvals are **internal acceptance records, not legal e-signatures**, and the UI says so. To add legally valid signing (e.g. Leegality, Zoho Sign, DocuSign):
1. Implement `ESignProvider` in `src/lib/esign.ts` (`createEnvelope`, `verifyWebhook`).
2. Set `ESIGN_PROVIDER`, `ESIGN_API_KEY`, `ESIGN_WEBHOOK_SECRET`.
3. Add a "Send for signature" action that calls `createEnvelope` with a signed URL of the agreement PDF and stores `esign_envelope_id/esign_status` on `partnership_agreements`; add a webhook route that verifies the signature and updates status.
Obtain legal advice on the IT Act 2000 requirements for the chosen provider.

## Google Calendar
Milestones include "Add to Google Calendar" links (calendar template URLs) — no credentials needed. A two-way sync would require a Google OAuth app with the Calendar scope; not included.

## Scheduled jobs
`GET /api/cron/daily` with `Authorization: Bearer $CRON_SECRET`. `vercel.json` schedules it daily at 02:30 UTC on Vercel; elsewhere use any scheduler (Supabase `pg_cron` + `pg_net`, GitHub Actions, cron).
