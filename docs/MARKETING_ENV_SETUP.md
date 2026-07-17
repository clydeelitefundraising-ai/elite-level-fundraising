# Marketing Site — Environment Variable Setup

No secret values appear in this document. It documents which variables exist, where, and why — not their contents.

This repository deploys to **two separate Vercel projects** from the same codebase:

- **`elite-level-fundraising`** — the public marketing site (`www.elitelevelfundraising.com`)
- **`elf-team-app`** — the authenticated Team App (`app.elitelevelfundraising.com`)

Each project has its own independent environment variable store in Vercel, scoped separately for **Preview** and **Production**. Adding a variable to one project does not add it to the other, and adding it to Production does not add it to Preview — both must be set explicitly.

## Variable matrix

| Variable | Marketing project | Team App project | Secret? | Required? | Failure behavior if missing |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ Preview+Prod | ✅ Preview+Prod | No (public) | Required | Any Supabase REST call fails |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ Preview+Prod | ✅ Preview+Prod | **Yes** | Required | Any Supabase write/admin read fails |
| `RESEND_API_KEY` | ✅ Preview+Prod | ✅ Preview+Prod | **Yes** | Required for any email | Throws at send time only (lazy) — caught, logged, doesn't crash the request |
| `FROM_EMAIL` | ✅ Preview+Prod | ✅ Preview+Prod | No | Optional | Falls back to a hardcoded default sender |
| `DEMO_NOTIFICATION_EMAIL` | ✅ Preview+Prod | ⚠️ Preview+Prod (unnecessary here — see below) | No | Recommended | Notification email is skipped; prospect confirmation still sends |
| `STRIPE_SECRET_KEY` | ✅ Preview+Prod | ✅ Preview+Prod | **Yes** | Required for checkout | Checkout API fails |
| `STRIPE_WEBHOOK_SECRET` | ✅ Preview+Prod | ✅ Preview+Prod | **Yes** | Required for webhook | Webhook signature verification fails |
| `ADMIN_PASSWORD` | ✅ Preview+Prod | ✅ Preview+Prod | **Yes** | Required for `/admin` | Admin login fails |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | ❌ Not set | ❌ Not set (unconfirmed) | **Yes** | Optional | Rate limiting fails open (logged, requests still succeed) |
| `VAPID_SUBJECT` / `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | ❌ Not set (not needed) | ✅ Preview+Prod | Private key is secret | Required for push notifications only | Lazy-configured (fixed this phase) — only affects an actual push send, never breaks a build |
| `NEXT_PUBLIC_APP_URL` | ❌ Not set (must stay unset — this is the marketing/Team-App build switch) | ✅ **Production only** | No | Required for Team App | If unset, the build renders the marketing homepage instead of the Team App at that domain |
| `ELF_ACCOUNT_PEPPER` / `TEAM_COACH_PEPPER` / `TEAM_MEMBER_PEPPER` / `ADMIN_PEPPER` | ❌ Not set (not needed — marketing site has no login) | ✅ Preview+Prod | **Yes** | Required for Team App auth | Lazy-read inside auth functions — never breaks a build, only fails an actual login attempt |
| `CRON_SECRET` | ❌ Not set | ✅ Preview+Prod | **Yes** | Required for scheduled jobs | Scheduled job endpoint returns 500 with a clear message |

## Findings from this audit

1. **`NEXT_PUBLIC_APP_URL` is Production-only on the Team App project, not set for Preview.** This means any Preview deployment of `elf-team-app` currently renders the **marketing homepage**, not the Team App, since that's the exact switch `src/app/page.tsx` reads (`IS_APP = Boolean(process.env.NEXT_PUBLIC_APP_URL)`). If Team App preview builds are expected to show the Team App, this needs to be added to Preview too. Not fixed in this phase — flagging for your decision, since it's a Team-App-project config change outside marketing scope.
2. **`DEMO_NOTIFICATION_EMAIL` exists on both projects.** It's only read by `src/app/api/marketing/demo-request/route.ts`, which has no reason to be hit on the Team App domain. Harmless if left, safe to remove from `elf-team-app` — not required.
3. **No eager (module-load-time) reads of secret env vars remain anywhere in the codebase**, confirmed by a full-repo grep for the `const X = process.env.Y!` pattern. The only prior instance of this (`src/lib/push.ts`) was fixed last phase. All auth pepper reads (`teamAuth.ts`, `memberAuth.ts`, `adminAuth.ts`, `accountAuth.ts`) are lazy — called from inside functions, not at import time — so a missing pepper can never break a build, only fail an individual auth attempt at runtime.
4. **Upstash rate-limiting variables are not confirmed set on either project.** The code fails open (requests succeed, rate limiting is simply inactive) — not a launch blocker, but worth setting before real traffic if you want the 5-requests/hour/IP protection on the demo form to actually do anything.

## Adding a variable

```
npx vercel env add VARIABLE_NAME preview
npx vercel env add VARIABLE_NAME production
```

Run from within the correct project's linked directory (or pass `--project <name>` if using a scratch link). Vercel prompts for the value — never paste secrets into chat, commit messages, or this file.

**A new/changed env var does not apply to an already-built deployment.** A fresh deploy (push or `vercel deploy`) is required to pick it up — this bit us twice already this project (see the Resend and VAPID incidents in project history).
