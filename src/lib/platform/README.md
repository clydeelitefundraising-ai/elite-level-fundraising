# Platform Services

Introduced in Phase A14B. This directory is where reusable server-side
business logic lives, so admin pages, API routes, the automation rule
engine, and future background jobs all read/write the same way instead of
each re-implementing its own Supabase queries.

## Purpose

Before this phase, every admin page (`Operations`, `Team Health`, `Coach
CRM`, `Automation`) had its own copy of `BASE`/`KEY`/`h()`/`safeFetch()` and
often its own copy of the same aggregation logic (e.g. donation pace, "days
since last activity"). That worked but made drift likely — Operations and
Team Health independently computed "below pace" with two subtly different
formulas. Platform Services is the fix: one implementation per concern,
imported everywhere that concern is needed.

## Responsibilities

| Module              | Owns |
|----------------------|------|
| `_client.ts`         | Low-level Supabase REST fetch helpers (`restList`, `restInsert`, `restUpdate`). Internal — not imported outside `platform/`. |
| `donations.ts`       | Fetching/aggregating donation rows, donation pace math (`calculateDonationPace`). |
| `campaigns.ts`       | Campaign roster (`getCampaignSummary`), single-campaign lookups, upcoming deadlines, pending coach invites. |
| `health.ts`          | Team Health scoring (`calculateHealth`, `calculateCampaignHealth`, `getHealthSummary`, `getCampaignRisk`). |
| `crm.ts`             | Coach CRM contacts/activities/pipeline (`getContacts`, `createActivity`, `updateStatus`, `getPipelineSummary`, `getFollowUps`). |
| `automation.ts`      | Automation event lifecycle (`runRules`, `createEvent`, `resolveEvent`, `acknowledgeEvent`, `getOpenEvents`, `getSummary`). Rule *definitions* stay in `src/lib/automation/rules.ts` — this module orchestrates evaluating them and persisting results. |
| `operations.ts`      | Composes the modules above into what the Operations Dashboard needs (`getNeedsAttention`, `getTodayStats`, `getPlatformStatus`, `getPendingItems`). |
| `audit.ts`           | Read helpers (`getRecentAudit`, `getAuditSince`, `getAuditSummary`) plus a re-export of the existing `logAuditEvent` write path (`logAudit`) so call sites only need one import surface. |
| `notifications.ts`   | Notification outbox (`notification_queue` table). Queues rows (`queueEmail`, `queuePush`, `queueSMS`, `queueInternal`), manages lifecycle (`cancelNotification`, `markSent`, `markFailed`), and reads (`getQueue`, `getQueueSummary`, `getStaleQueued`, `getRecentFailures`). Only queues — never sends. |
| `notificationJobs.ts` | Delivery job that drains `notification_queue` (`processQueue`, `processEmail`, `processPush`, `processSMS`, `processInternal`). Mirrors `jobs.ts`'s relationship to `automation.ts`. Email/SMS intentionally report Not Implemented (no carrier wired up yet); push reuses `lib/push.ts`; internal marks sent immediately. |

## Intended future services

Not built yet, but the pattern is established for:
- Real carriers behind `notificationJobs.ts`'s `processEmail`/`processSMS` (Resend, Twilio) — the queue/lifecycle/job-tracking scaffolding is already in place, only the carrier call needs to be swapped in for each.
- `reports.ts` — scheduled/on-demand exports built from the same `donations`/`campaigns`/`crm` services.
- `integrations.ts` — outbound webhooks or third-party syncs (e.g. accounting, CRM export).
- A cron/worker entrypoint that calls `automation.runRules()` on a schedule instead of the current manual "Run Rules Now" button — no `platform/` changes needed, since `runRules()` already does not assume an HTTP request context.

## Dependency direction

```
app/**/page.tsx, app/api/**/route.ts   (HTTP, auth, request parsing, audit-log call)
              │
              ▼
     src/lib/platform/*.ts             (business logic, aggregation, DB access)
              │
              ▼
     src/lib/platform/_client.ts       (raw Supabase REST calls)
```

Rules:
- Pages and API routes call into `platform/`, never the other way — `platform/` must not import from `src/app/**`.
- Cross-service calls within `platform/` are allowed and expected (e.g. `health.ts` calls `campaigns.ts` and `donations.ts`; `operations.ts` composes nearly all of the others). Keep this a DAG — no circular imports between service modules.
- Auth checks (`verifyToken`), request-level concerns (`ipOf`, parsing `NextRequest`), and audit-log *calls* (not the underlying write) stay in the route/page layer. Services assume the caller has already authorized the request.
- `_client.ts` is private to `platform/`. If a new service needs raw REST access, import `_client.ts` — don't reach for `fetch()` directly in an app-layer file.

## What did *not* move here

Per-request presentation logic (grouping data for a specific dashboard layout, formatting strings for display) stays in the page/view components. Only extract into `platform/` when logic is either already duplicated across ≥2 call sites or is a clear, reusable domain operation (e.g. "what is this campaign's health score" is a service; "how wide should this card be" is not).

`src/lib/supabase.ts`, `src/lib/teamAuth.ts`, `src/lib/memberAuth.ts`, etc. (the public team-facing data/auth layer) were intentionally left alone — they serve a different audience (coach/parent/athlete-facing routes) and refactoring them was out of scope for this admin-focused phase.
