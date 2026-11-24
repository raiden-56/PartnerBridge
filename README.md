# PartnerBridge

**B2B partnership discovery, networking and collaboration platform.**
*Discover → Connect → Negotiate → Establish → Collaborate → Grow.*

PartnerBridge is an open, multi-company marketplace where businesses discover one another, publish partnership opportunities, send structured partnership requests, and — once a partnership is established — collaborate in a private shared workspace with messaging, tasks, milestones, versioned documents, agreements and deal tracking.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, shadcn-style UI on Radix, Lucide, Framer Motion, Recharts |
| Backend | Next.js server actions + route handlers, Supabase (PostgreSQL, Auth, Storage, Realtime, RLS) |
| Validation | Zod (every server action and route) |
| Payments | Razorpay Orders + Checkout, server-side HMAC verification, signed webhooks (provider abstraction in `src/lib/billing/provider.ts`) |
| Email | Resend (falls back to console logging when not configured) |
| Push | Web Push (VAPID) with explicit, user-initiated permission |
| PWA | Web manifest, hand-written service worker (`public/sw.js`), offline page, background sync outbox, install prompt, update toast |
| Exports | CSV, Excel (exceljs), PDF (pdf-lib) |

---

## Fastest start: local demo mode (no Supabase, no setup)

```bash
npm install
echo NEXT_PUBLIC_LOCAL_DEMO=1 > .env.local
npm run dev        # or: npm run build && npm start
```

Open http://localhost:3000/login and pick a **Guest mode** persona (company owner, partnership manager, platform admin or moderator). No account needed.

How it works:
- The app runs an **embedded Postgres** (PGlite) inside the Next.js server. It applies the real migrations, including every RLS policy, so local permissions behave like production.
- A built-in stand-in for the Supabase APIs (`src/lib/local-supabase/`) answers the app's database, sign-in and file-storage calls, served at `/local-sb`.
- On first start it loads the same **fictional demo data** as `npm run db:seed` (about 10 seconds). Data is saved in `.local-data/` (git-ignored) and survives restarts.
- A yellow **Local demo** bar on every page lets you switch guest persona or **Reset data** back to the original demo data.
- Sign-up works without email verification. Emails, including password-reset links, are printed to the server console.
- **Checkout is simulated:** you choose whether the demo payment succeeds or fails. No money moves and Razorpay is never contacted.
- Chat and the notification bell check for updates every few seconds instead of using Supabase Realtime.
- Google/Microsoft sign-in and Web Push are not available in this mode.
- Run one server at a time. Two servers (for example `dev` and `start`) must not share `.local-data/` at the same time. To start completely fresh, stop the server and delete `.local-data/`.

Local demo mode is for development and demos only. It switches off automatically when `NEXT_PUBLIC_SUPABASE_URL` is set, and the guest sign-in and demo payment actions refuse to run outside it.

### Read-only preview on GitHub Pages

GitHub Pages can only serve files, so it can't run the app itself. `npm run pages:build` starts the app in local demo mode, saves every page as a guest would see it (public site, company owner dashboard, platform admin console) and writes a static site to `out-pages/`.
- The workflow in `.github/workflows/pages.yml` does this on every push to `main`. One-time setup: **Settings → Pages → Source: GitHub Actions**.
- Visitors browse the fictional demo data with guest mode. Buttons and forms show a "read-only preview" message; filters, search, exports and anything that saves need the running app.
- Check it locally with `npm run pages:build`, then `npm run pages:serve` and open http://localhost:4173/partnerbridge/.
- The default base path is `/partnerbridge`; set `PAGES_BASE_PATH` for another repository name (the workflow does this automatically).

---

## Quick start with Supabase

### 1. Prerequisites
- Node.js ≥ 20.9
- A Supabase project (free tier is fine) — or the Supabase CLI with Docker for local development

### 2. Install
```bash
npm install
cp .env.example .env.local   # then fill in the Supabase values
```

### 3. Create the database
Apply the migrations in `supabase/migrations/` **in order**. Either:

- **Supabase CLI:** `supabase link --project-ref <ref>` then `supabase db push`
- **Dashboard:** paste each file (`…0001` → `…0006`) into the SQL editor and run it.

Then in the Supabase dashboard:
- **Auth → URL configuration:** set Site URL to `NEXT_PUBLIC_APP_URL` and add `<APP_URL>/auth/callback` to redirect URLs.
- **Realtime:** the migration adds `partnership_messages`, `notifications`, `conversation_reads` to the `supabase_realtime` publication (verify under Database → Replication).

You can validate the SQL and the tenant-isolation rules without Supabase:
```bash
npm run db:check     # applies all migrations to an in-memory Postgres (PGlite) and runs 40+ RLS tests
```

### 4. Seed demo data (optional but recommended)
```bash
npm run db:seed            # creates fictional demo companies, users, partnerships…
npm run db:seed -- --reset # wipe and recreate demo data
```

### 5. Run
```bash
npm run dev     # http://localhost:3000
npm run build && npm start
```

### Test accounts (after seeding)
Password for all: value of `SEED_DEMO_PASSWORD` (default `Demo@PartnerBridge2026`).

| Role | Email |
|---|---|
| Super admin | `admin@partnerbridge.demo` |
| Moderator | `moderator@partnerbridge.demo` |
| Owner — Northstar Digital Solutions (Business plan) | `northstar@partnerbridge.demo` |
| Partnership manager — Northstar | `manager@partnerbridge.demo` |
| Member — Northstar (access to one workspace) | `member@partnerbridge.demo` |
| Owner — BrightWave Marketing (Growth) | `brightwave@partnerbridge.demo` |
| Owner — GreenLeaf Foods (Growth) | `greenleaf@partnerbridge.demo` |
| Owner — BluePeak Distributors (Free) | `bluepeak@partnerbridge.demo` |
| Owners — Apex, NovaTech, UrbanNest, Horizon | `apex@…`, `novatech@…`, `urbannest@…`, `horizon@…` |

All seeded companies are **fictional** and flagged `is_demo`; the UI labels them "Demo".

---

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` | TypeScript |
| `npm test` | Unit tests (matching engine, permission model, limits, redirects) |
| `npm run db:check` | Apply migrations to PGlite + tenant-isolation / workflow tests |
| `npm run db:seed` | Demo data |
| `npm run icons` | Regenerate PWA icons |
| `npm run vapid` | Generate Web Push VAPID keys |

---

## Feature map

| Area | Where |
|---|---|
| Marketing site (hero, live stats, featured companies, categories, opportunities, pricing, FAQ, contact) | `src/app/(marketing)` |
| Auth: email/password, verification, reset, Google/Microsoft OAuth (optional) | `src/app/(auth)`, `src/actions/auth.ts`, `src/app/auth/*` |
| Onboarding wizard (7 steps, saved per step) | `src/app/onboarding`, `src/components/onboarding` |
| Company discovery (full-text search, 12 filters, grid/list, sorting, pagination) | `search_organizations()` RPC, `src/components/company/company-directory.tsx` |
| Company profile (privacy-aware contacts, report/block/share/save/contact) | `src/app/(marketing)/companies/[slug]` |
| Smart matching (transparent rule-based score + breakdown, admin-configurable weights) | `src/lib/matching` |
| Opportunities & applications (publish/pause/close, shortlist/reject/accept → workspace) | `src/actions/opportunities.ts` |
| Partnership requests (draft/sent/viewed/negotiation/accepted/rejected/cancelled/expired; duplicate prevention; idempotent accept) | `src/actions/requests.ts`, `accept_partnership_request()` |
| Workspace: overview, realtime chat with read receipts & attachments, kanban tasks + comments, milestones (+ Google Calendar links), versioned documents with access log, agreements with versions & dual approvals, deals/referrals with estimated vs attributed vs verified revenue, activity timeline, workspace team | `src/app/dashboard/partnerships/[id]` |
| Messaging inbox (direct + partnership), unread counts, search | `src/app/dashboard/messages` |
| Notifications: in-app (realtime), email, push, per-type preferences | `src/lib/notifications` |
| Analytics (KPIs, 6 charts, partner performance, CSV/Excel/PDF export) | `src/app/dashboard/analytics`, `src/app/api/analytics/export` |
| Team: invites (hashed tokens), roles, granular permissions, removal, ownership transfer | `src/actions/team.ts` |
| Billing: plans, trials, Razorpay checkout, webhook, cancellation, invoices, usage limits | `src/actions/billing.ts`, `src/lib/billing` |
| Admin console (15 modules, moderator vs super-admin scopes, audit logged) | `src/app/admin` |
| PWA | `src/app/manifest.ts`, `public/sw.js`, `src/components/pwa` |
| Daily jobs (expire requests, reminders, lapsed subscriptions) | `src/app/api/cron/daily` |

More detail: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/SECURITY.md`](docs/SECURITY.md) · [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md) · [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) · [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md)

---

## What needs credentials

These are fully implemented but need configuration to work for real:

| Integration | Without config | Configure |
|---|---|---|
| Razorpay | Checkout buttons disabled, banner explains it; admins can assign plans manually | `RAZORPAY_*` + webhook |
| Email (Resend) | Emails are logged to the server console | `RESEND_API_KEY`, `EMAIL_FROM` |
| Web Push | "Enable push" disabled with explanation | `npm run vapid` → `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` |
| Google / Microsoft sign-in | Buttons hidden | Enable provider in Supabase, set `NEXT_PUBLIC_AUTH_*_ENABLED=true` |
| E-signature | Clear notice that approvals ≠ legal signatures | Implement an adapter in `src/lib/esign.ts` |
| Google Calendar | "Add to calendar" template links work without credentials | — |

Proposed prices (₹999 Growth, ₹2,499 Business) are launch placeholders, editable in **Admin → Plans & limits**. Privacy policy and terms are templates that require legal review (DPDP Act 2023) before launch.
