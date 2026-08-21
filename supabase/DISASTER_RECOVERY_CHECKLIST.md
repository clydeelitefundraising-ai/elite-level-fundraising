# Disaster Recovery Checklist — ELF Production

**Date**: 2026-08-21 | **Verdict: PostgreSQL schema is now reconstructable from the repository (see `supabase/baseline/schema.sql`). Several non-schema items below are still manual/external.**

## Security note (discovered during this capture) — FIX APPLIED AND VERIFIED 2026-08-21
The authoritative schema dump surfaced a live, unrestricted RLS policy on `public.donations` (`"public read donations" FOR SELECT USING (true)`, no role restriction) that let the public anon key read every donation row across every team, bypassing all app-level scoping — confirmed exploitable live via a minimal anon-key request. Verified via code audit that no frontend feature depends on it. **Approved 2026-08-21, applied by the user directly via Supabase Dashboard → SQL Editor** (the assistant's linked CLI session lacked DDL ownership on application tables and couldn't apply it directly — confirmed by a failed attempt). Tracked as `supabase/migrations/phase_24_5_remove_public_donations_read_policy.sql`.

**Post-apply verification, same day**: policy count for `donations` in `pg_policies` is now 0; RLS remains enabled on the table; a repeat of the anon-key `id`-only/`limit=1` request now returns HTTP 200 with an empty array (was 1 row before); the production `/api/campaign-stats/[slug]` route (the app's actual service-role donation-read path) still returns full donation data unaffected, confirming zero regression.

**Any fresh environment built from `supabase/baseline/schema.sql` must NOT recreate this policy** — the baseline dump was captured *before* the fix was applied, so it still contains the insecure policy as written at capture time. Apply `phase_24_5_...sql` on top of the baseline for any new environment, exactly as was done for production.

The gap is scoped precisely in `SCHEMA_BASELINE_STATUS.md`: 21 of 51 live tables/views have no `CREATE TABLE` in `supabase/migrations/`. This investigation session documented and quantified that gap but **did not close it** — closing it requires either `supabase login` (interactive) + `supabase db dump --linked --schema-only`, or the Postgres connection string from the Supabase Dashboard, neither of which was available/appropriate to obtain non-interactively this session.

## What IS covered by the repo today
- 30 tables' `CREATE TABLE` + all subsequent `ALTER TABLE` history (idempotent, safe to replay)
- 1 realtime publication: `ALTER PUBLICATION supabase_realtime ADD TABLE notifications` (`phase13_notifications.sql`)
- Application code itself (all business logic, API routes, auth)

## What is NOT in the repo — manual steps required for a full rebuild

1. **Foundational schema (21 tables)** — see `SCHEMA_BASELINE_STATUS.md`. Requires a real `pg_dump`/`supabase db dump` from someone with dashboard/CLI access. **This is the P0.**
2. **Storage buckets (6, none created by any migration)** — must be manually created in Supabase Dashboard → Storage, with matching public/private access settings:
   - `team-files` (private — served only via the app's signed-download proxy, see security audit note on `api/team/[slug]/files/[id]/route.ts`)
   - `athlete-photos` (public)
   - `shop-images` (public)
   - `sponsor-logos` (public)
   - `team-logos` (public)
   - `profile-photos` (public)
   *(public/private inferred from which routes use `.../storage/v1/object/public/...` vs the unsigned proxy path — verify against actual current bucket policies in the dashboard, don't take this as gospel.)*
3. **Realtime enablement** — beyond the one migration-tracked `notifications` table, verify whether any other tables have realtime enabled directly via dashboard toggle (not captured in any migration if so — `TeamRealtimeSync.tsx` subscribes to `notifications` INSERT only, so this is likely complete, but not independently verified this session).
4. **Vercel environment variables** — both `elf-team-app` and `elite-level-fundraising` (marketing) projects, Production environment. `.env.example` is the closest thing to a source of truth but is confirmed (prior audit pass) to be missing `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_PRIVATE_KEY`, `APNS_ENVIRONMENT`, `ELF_PLATFORM_FEE_RATE`, `NEXT_PUBLIC_MARKETING_URL`. A full rebuild needs the *values*, which only exist in Vercel's encrypted store today — no escrowed copy exists anywhere in the repo (correctly — they shouldn't be committed).
5. **Stripe configuration** — webhook endpoint registration (see Part C below) is dashboard-only state, not reconstructable from the repo. No Stripe Products/Prices are used by this app (donations are arbitrary-amount Checkout Sessions), so no catalog to rebuild — one less thing.
6. **Resend configuration** — sending-domain verification (SPF/DKIM/DMARC records) for whatever domain `FROM_EMAIL` uses is entirely external DNS/Resend-dashboard state, not in the repo.
7. **Supabase project settings** — confirm nothing beyond the REST API is relied upon (this app deliberately doesn't use Supabase Auth per existing architecture notes, so that's one less thing to reconstruct), but Project Settings → API (URL, keys) obviously need to be re-plumbed into Vercel env vars for both projects, and CORS/allowed-origins settings if any were customized off the default.
8. **Custom domains** — `app.elitelevelfundraising.com` / `www.elitelevelfundraising.com` DNS + Vercel domain verification, separate from anything Supabase-side.

## Recommended order of operations for a real rebuild (for whoever eventually does this)
1. New Supabase project → apply real baseline migration (once it exists) → apply all subsequent migrations in order
2. Recreate 6 storage buckets with correct public/private settings
3. Re-enable realtime on `notifications`
4. Recreate all Vercel env vars in both projects (Production + Preview) from a secure password-manager copy — **not** from this repo, since secrets are correctly never committed here
5. Re-register Stripe webhook against the new/existing production domain, subscribed to `checkout.session.completed`
6. Re-verify Resend sending domain
7. Re-point DNS/custom domains at the new Vercel deployment
