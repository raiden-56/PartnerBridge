# End-to-end acceptance walkthrough

Use two browsers (or a normal + private window). Steps map to the acceptance criteria.

| # | Criterion | How to verify |
|---|---|---|
| 1 | New user registers | `/register` → verification email (Supabase) → link lands on `/onboarding` |
| 2 | User creates a company | Onboarding step 2 calls `create_organization()`; user becomes owner on the Free plan |
| 3 | Completes onboarding | Steps 1–7, each saved as a draft; verification optional |
| 4 | Publishes profile | Step 7 "Publish" → visible at `/companies/<slug>` |
| 5 | Another company discovers it | Sign in as `bluepeak@partnerbridge.demo` → Discover → search by name/industry |
| 6 | Sends a partnership request | "Request" → `/dashboard/requests/new?to=<slug>` → Send |
| 7 | First company is notified | Bell updates in real time; email logged/sent; push if enabled |
| 8 | Reviews and accepts | Requests → Incoming → open (marked *viewed*) → Accept |
| 9 | Partnership created | Redirect to `/dashboard/partnerships/<id>`; accepting again returns the same partnership |
| 10 | Both access workspace | Second company sees it under Partnerships |
| 11 | Exchange messages | Workspace → Messages (realtime, read receipts, attachments) |
| 12 | Tasks & milestones | Tasks board (drag between columns, comments), Milestones (progress, calendar link) |
| 13 | Documents | Upload, new version, internal vs shared, download history |
| 14 | Agreement record | Agreements → New → approve from both companies → Mark active |
| 15 | Register & track a deal | Deals → Register → move stage → partner verifies revenue |
| 16 | Correct status for both | Partnership status/pause/end reflects on both sides |
| 17 | Team management | Team → invite (link logged in console without email config) → accept at `/invite/<token>` → change role/permissions → transfer ownership |
| 18 | Admin verification & moderation | `admin@partnerbridge.demo` → `/admin/verification` approve UrbanNest; companies/opportunities/reports/requests modules |
| 19 | Plan limits enforced | As BluePeak (Free): send >5 requests in a month, post a 2nd opportunity, or invite a 3rd member → blocked with upgrade message; exports locked on Analytics |
| 20 | Installable PWA | `npm run build && npm start` → browser install prompt / custom banner; go offline → `/offline`; public pages cached |

Automated coverage: `npm run db:check` (tenant isolation, workflow invariants) and `npm test` (matching, permissions, limits).
