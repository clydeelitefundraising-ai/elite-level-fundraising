# Complete Season — production release

Branch `feature/complete-season-preprod-hardening` (Complete Season Phases 1–5D
on top of `main` at `ce85b8e`). Nothing here is applied, merged or deployed
until the release owner approves each step.

## 1. Feature flags (independent, both off by default)

| `COMPLETE_SEASON_PREVIEW` | `COMPLETE_SEASON_EXECUTE` | Head Coach / platform admin sees |
|---|---|---|
| off | off | Nothing. No To-Do card; preview page, preview API and completion API all 404. |
| `true` | off | To-Do card + read-only preview ("Preview only"). No confirmation form; completion API 404. |
| `true` | `true` | Preview + typed confirmation + completion, subject to role checks, a fresh preview fingerprint, blockers, the typed address and phrase, payment verification (fails closed) and the database's own checks. |
| off | `true` | Same as both off: EXECUTE alone exposes nothing (404 before any database or Stripe call). |

Only the exact value `true` turns a flag on. Covered by the "rollout matrix"
tests in `season/complete/route.test.ts`, `season/preview/route.test.ts` and
`complete-season/seasonCompleteUi.test.ts`.

## 2. Database

Four new migrations, applied in this order, each in its own transaction and
safe to re-run:

1. `supabase/migrations/phase_s1_complete_season.sql`
2. `supabase/migrations/phase_s2_completed_season_read_only.sql`
3. `supabase/migrations/phase_s3_season_preview_access.sql`
4. `supabase/migrations/phase_s4_season_complete_access.sql`

They need everything already on `main`, in particular
`phase_t5_attendance_drafts.sql` (phase_s1 refuses to run without it). Each
later step refuses to run before the one it depends on.

What they change on existing data: phase_s1 adds lineage columns to
`campaign_settings` and `athletes`, backfills `program_id = team_id`, and
creates the `team_season_transitions` audit table. phase_s2 adds read-only
triggers that refuse writes only for a *completed* season (none exist until
the first completion). phase_s3/s4 grant `service_role` EXECUTE on the
preview and on `team_season_complete_checked` only. No API role can call the
raw transition.

The app is safe to run before the migrations: with the flags off nothing
calls the new functions, and the season checks fail open when the columns
are missing. Applying the migrations first is still the recommended order.

**Check (read-only, one SELECT — paste the whole file into the SQL editor):** `scripts/release/complete_season_production_check.sql`
— run it in the production SQL editor before the migrations (expect no
`prerequisite_missing` rows and every step `not applied`) and after (every
step `applied`, 0 completed seasons, 0 transitions, `YES` only for
service_role on the preview and `team_season_complete_checked`).

No new npm dependencies.

## 3. Production environment (Vercel project `elf-team-app`)

| Variable | Release | Preview rollout | Completion rollout |
|---|---|---|---|
| `COMPLETE_SEASON_PREVIEW` | unset | `true` | `true` |
| `COMPLETE_SEASON_EXECUTE` | unset | unset | `true` |
| `STRIPE_SECRET_KEY` | live key (as today) | same | same — must be able to list Checkout Sessions, or completion is refused (503 `payments_unverified`) |
| `ELF_QA_ALLOW_UNVERIFIED_CHECKOUTS` | never set | never set | never set (the build refuses it outside QA) |
| `ELF_DEPLOYMENT`, `ELF_QA_SUPABASE_REF`, `ELF_QA_ALLOW_OUTBOUND` | never set | never set | never set |

A Vercel environment change takes effect on the next deployment.

## 4. Release order

1. Run the check script on production (read-only).
2. Apply phase_s1 → s4 in the production SQL editor; re-run the check.
3. Merge to `main`; production deploys with both flags unset. Smoke: a team's
   To-Do shows no Complete Season card; `/team/<slug>/team/complete-season`
   is 404; `POST /api/team/<slug>/season/complete` is 404.
4. Later, preview rollout: `COMPLETE_SEASON_PREVIEW=true`, redeploy.
5. Later, completion rollout: `COMPLETE_SEASON_EXECUTE=true`, redeploy.

## 5. Rollback

- **Stop completions now:** remove `COMPLETE_SEASON_EXECUTE` (and
  `COMPLETE_SEASON_PREVIEW` to hide the preview) and redeploy, or use
  Vercel Instant Rollback to the last deployment before the merge (no build).
- **Remove the code:** `git revert -m 1 <merge commit>` on `main`, push,
  deploy. The previous app runs unchanged with the new schema present.
- **Database:** leave the migrations in place. They are additive and dormant
  until a season is completed. There is no down-migration; dropping the
  read-only triggers or the audit table needs its own reviewed migration.
- **A season completed in production cannot be undone from the app.** See
  `docs/COMPLETE_SEASON_REVERSAL.md` (manual, reviewed migration; the audit
  row is permanent and a reversed season can't be completed again without a
  schema change).

## 6. Known minor risks

- Some layout and permission checks are tested by reading the source, not by
  rendering the real page (entry card, page gate, panel gate).
- JSX whitespace: the production build dropped a space the test renderer
  kept (fixed in 568c4fc). Similar build-only spacing slips are possible
  elsewhere.
- The phase_s2 triggers add a small lookup to writes on team tables
  (measured fine on realistically large QA teams in `large.sh`).
- Payment verification depends on the Stripe API. A Stripe outage refuses
  completion (fail closed) rather than risking a donation landing on an
  archived season.
- An open checkout blocks completion for up to 24 hours.
- Production schema drift: the check script compares production with the QA
  schema. Columns added only in production by hand are not a problem; a
  missing one must be fixed before phase_s1.
