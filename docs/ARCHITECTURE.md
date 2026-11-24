# Architecture

## Tenancy model
- **Tenant = organization (company).** Users (`profiles`, 1:1 with `auth.users`) join organizations through `organization_members` with a role (`owner`, `admin`, `partnership_manager`, `member`) and optional granular `permissions[]`.
- One user can belong to many companies; the *active* company is `profiles.active_organization_id` (switcher in the sidebar). Server code that acts for a non-active company re-checks membership (`requireOrg(perm, orgId)`).
- Platform roles live on `profiles.platform_role` (`user`, `moderator`, `super_admin`).

## Permission model
Defined once in TypeScript (`src/lib/auth/permissions.ts`) and mirrored in SQL (`public.role_has_permission`). Server actions check permissions with `requireOrg("…")`; the database enforces the same rules through RLS helper functions (`has_org_permission`, `can_access_partnership`, …). A unit test pins the TS matrix; `npm run db:check` exercises the SQL side.

| Permission | Owner | Admin | Partnership manager | Member |
|---|---|---|---|---|
| profile.manage, team.manage, billing.manage, verification.manage, opportunities.manage | ✓ | ✓ | grantable | grantable |
| requests.manage, applications.manage, workspaces.all, analytics.view, messages.direct | ✓ | ✓ | ✓ | grantable |
| ownership.transfer, org.delete | ✓ | — | — | — |

Workspace access = member of a participating company **and** (`workspaces.all` **or** explicitly added to `partnership_members`).

## Request lifecycle
```
draft → sent → viewed → (negotiation) → accepted → partnership + workspace
                    ↘ rejected | cancelled (sender) | expired (cron)
```
- Partial unique index prevents duplicate *open* requests per (sender, receiver, category).
- `accept_partnership_request()` locks the row (`FOR UPDATE`) and is idempotent: a second call returns the same partnership id. The partnership row also has `request_id UNIQUE`.
- Accepting an opportunity application uses `accept_opportunity_application()` with the same guarantees.

## Data access pattern
| Operation | Client |
|---|---|
| Reads in pages / actions | Session client (`lib/supabase/server.ts`) → RLS applies |
| Tenant writes (tasks, milestones, documents, messages, prefs, profile) | Session client → RLS write policies |
| Workflow transitions (accept) | SECURITY DEFINER RPCs that check `auth.uid()` permissions inside the transaction |
| Cross-tenant side effects (notifications, activity log, status changes the other side shouldn't be able to forge, admin actions) | Service-role client **after** explicit server-side authorization |
| Protected columns (verification status, featured, suspension, platform role) | Guarded by triggers; only service role/staff may change |

## Key modules
```
src/
  actions/          server actions (one file per domain)
  app/              routes: (marketing), (auth), onboarding, dashboard, admin, api
  components/       ui primitives, shared, feature components
  lib/
    auth/           session helpers, permission matrix, admin guards
    billing/        limits, entitlements, provider abstraction, payment service
    matching/       transparent scoring engine + recommendation loader
    notifications/  notify (fan-out), email, push, types
    analytics/      KPI & chart computation from live rows
    queries/        shared read queries
supabase/migrations 0001 schema · 0002 functions/triggers/RPCs · 0003 RLS · 0004 storage · 0005 reference data · 0006 billing helpers
scripts/            check-migrations (PGlite RLS tests), seed, icons
```

## Matching engine
`score = Σ weight_i × factor_i`, factors ∈ [0,1]: partnership-type reciprocity (what they offer vs what you want, and vice-versa), complementary industries (curated pair table), same sub-industry/industry, shared goals, geography, size proximity, target-market overlap, capability overlap. Weights live in `platform_settings.matching_weights` and are normalised to 100. Every result stores its breakdown and human-readable reasons; the UI shows both.

## Realtime
Supabase Realtime `postgres_changes` on `partnership_messages`, `notifications` and `conversation_reads`. Realtime respects RLS, so subscribers only receive rows they could `SELECT`.

## Analytics integrity
All analytics are computed from database rows at request time. Revenue is reported in three separate buckets that are never summed together:
- **Estimated pipeline** — `expected_value` of open deals (forecast)
- **Attributed revenue** — self-reported by the deal owner on won deals
- **Verified revenue** — confirmed by the *other* company (enforced server-side)
