# Marketing Website — Launch Readiness Checklist

Living document. Check items off as they're verified; re-run the relevant section after any change to marketing code, env vars, or DNS. Last full pass: Phase 4 (see project history for date).

## 1. Build & deployment

- [x] `tsc --noEmit` passes clean
- [x] `eslint` passes clean on all marketing files
- [x] `next build` passes clean, both with and without `VAPID_*` env vars set (proves the marketing project's build can't be broken by a Team-App-only dependency)
- [x] Marketing Vercel project (`elite-level-fundraising`) builds successfully from the intended commit
- [x] Team App Vercel project (`elf-team-app`) builds successfully from the same commit (shared codebase — both must pass)
- [x] Production has a known-good rollback point: `www.elitelevelfundraising.com` was serving a healthy build before this phase, and Vercel retains every prior successful deployment for instant rollback via the dashboard or `vercel rollback`
- [ ] **Before merging marketing to `main`**: re-run this entire section against the merge commit, not just the review branch

## 2. Environment variables

See `docs/MARKETING_ENV_SETUP.md` for the full matrix. Quick checks:

- [x] `RESEND_API_KEY`, `FROM_EMAIL`, `DEMO_NOTIFICATION_EMAIL` present on the marketing project, both Preview and Production
- [x] `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` present on the marketing project
- [ ] `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — not confirmed set; demo-form rate limiting is currently inactive (fails open, not broken, just unprotected)
- [x] `NEXT_PUBLIC_APP_URL` is **not** set on the marketing project (verified — this is correct, it's the switch that must stay off for the marketing homepage to render there)

## 3. Database migration

- [ ] `supabase/migrations/phase_a20_marketing_demo_requests.sql` — confirm applied to the production Supabase instance before launch (creates `marketing_demo_requests`, isolated, no FKs into Team App tables)

## 4. Demo form — end to end

- [x] Form submission succeeds (verified live on preview)
- [x] Supabase row created in `marketing_demo_requests` (verified live)
- [x] Prospect confirmation email delivered via Resend (verified live)
- [x] Internal notification email delivered via Resend (verified live)
- [x] Honeypot field present and silently no-ops bot submissions
- [ ] Rate limiting (5 req/hr/IP) — logic verified in code; not load-tested since Upstash isn't configured yet

## 5. Navigation & links

- [x] All internal links across all 12 marketing pages crawled — 21 unique targets, all return HTTP 200
- [x] No dead anchors remain where a real page now exists (homepage module cards repointed from `/#fundraising` etc. to `/fundraising` etc.)
- [x] Nav and footer both link to every new Phase 3 page

## 6. Mobile QA

- [x] No horizontal overflow on homepage or `/product` at 390px
- [x] Mobile nav opens/closes cleanly, all links present
- [x] Real product screenshots scale correctly on mobile without layout shift (CLS = 0 across all Lighthouse runs)

## 7. Accessibility

- [x] Lighthouse Accessibility: **100** on Home, Product, Pricing, Demo, Trust Center (desktop) — see Phase 4 report for the pre-existing heading-order bugs found and fixed
- [x] Skip link, semantic landmarks, visible focus states, accessible mobile menu, labeled form fields with inline errors (Phase 1 foundation, re-verified)
- [ ] Full third-party accessibility audit — not done; `/trust/accessibility` says this explicitly and should keep saying so until one happens

## 8. SEO

- [x] Lighthouse SEO: **100** on all 5 audited pages
- [x] Unique `title`/`description`/canonical on every page
- [x] `sitemap.ts` includes all marketing routes, verified live at `/sitemap.xml`
- [x] `robots.ts` allows marketing paths, disallows app/admin/auth paths
- [ ] Open Graph image is currently the raw logo file (`/ELF.LOGO.png`), not a designed 1200×630 social card — works, but is a missed opportunity before wide launch
- [ ] Submit sitemap to Google Search Console / Bing Webmaster Tools after the marketing site goes live on `www.elitelevelfundraising.com` (not done — can't be done until the new site is actually in production)

## 9. Domain & redirects

- [x] `elitelevelfundraising.com` → 308 → `www.elitelevelfundraising.com` (verified live)
- [x] `www.elitelevelfundraising.com` → 200, serves the marketing project (verified live)
- [x] `app.elitelevelfundraising.com` → 307 → `/login` when unauthenticated, serves the Team App project (verified live)
- [x] HTTPS enforced on all three
- [ ] `NEXT_PUBLIC_APP_URL` missing from the Team App project's **Preview** environment (Production is correctly set) — means Team App preview builds currently render the marketing homepage instead of the Team App. Flagged, not fixed — outside marketing scope, needs your call.

## 10. Legal & trust content status

| Page | Status |
|---|---|
| `/trust`, `/trust/contact`, `/trust/status` | Structurally complete, transparently labeled as partial where facts are missing (no registered entity name/address yet) |
| `/trust/security`, `/trust/privacy`, `/trust/accessibility`, `/trust/compliance`, `/trust/data-protection` | Plain-language summaries live; explicitly marked "being finalized," not final policy |
| `/legal/terms`, `/legal/cookies`, `/legal/acceptable-use` | Same — placeholder-labeled, not final |

**None of these pages claim to be finished, certified, or legally binding.** Recommended minimum for an initial controlled launch: keep them exactly as they are now (honest, clearly in-progress) rather than delaying launch on legal copy — but **do not publish any of them as final, and do not remove the in-progress notices, until a qualified attorney has reviewed them.** This is not a substitute for legal review.

## 11. Analytics & monitoring

- [x] Audited: **no analytics or monitoring vendor is currently installed** (confirmed via full-repo search — no GA4, Clarity, Meta Pixel, Sentry, Plausible, PostHog, or Vercel Analytics/Speed Insights)
- [ ] Nothing installed yet — see Phase 4 report for the recommended minimal starting stack and why each piece was chosen. **Do not install anything without separate explicit approval**, per instruction.

## 12. Rollback procedure

1. Vercel keeps every previous successful deployment indefinitely. To roll back: Vercel dashboard → the `elite-level-fundraising` project → Deployments → find the last known-good Production deployment → **Promote to Production**. No code revert needed for a bad deploy; this is instant.
2. If a bad deploy was already promoted and you need to revert the *code*, `git revert` the merge commit on `main` and push — this triggers a fresh, clean build.
3. If the issue is an environment variable (wrong value, not a build break), fix the value in Vercel → redeploy (env changes don't apply retroactively to a running deployment).
4. Database migrations in this project are additive-only so far (`CREATE TABLE IF NOT EXISTS`) — no rollback migration has been needed or written. If a future migration is destructive, write and test its down-migration before applying it.
