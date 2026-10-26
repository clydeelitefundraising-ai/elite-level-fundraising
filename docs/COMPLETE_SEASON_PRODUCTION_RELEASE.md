# Complete Season — production release runbook

Branch `feature/complete-season-preprod-hardening` (Complete Season Phases
1–5D on top of `main` at `ce85b8e`). Every production step below is run by
the release owner, one stage at a time, after explicit approval.

Production: Supabase `nggabucgcoaffpppchsp`, Vercel `elf-team-app`.
Never QA (`mzsvbxosoidwhntpjdkf` / `elf-team-qa`) by mistake — check the
project ref in the dashboard URL before every SQL step.

## 1. Feature flags (independent, both off by default)

| `COMPLETE_SEASON_PREVIEW` | `COMPLETE_SEASON_EXECUTE` | Head Coach / platform admin sees |
|---|---|---|
| off | off | Nothing. No To-Do card; preview page, preview API and completion API all 404. |
| `true` | off | To-Do card + read-only preview ("Preview only"). No confirmation form; completion API 404. |
| `true` | `true` | Preview for every team. Typed confirmation + completion **only for the teams listed in `COMPLETE_SEASON_EXECUTE_TEAMS`**, subject to role checks, a fresh preview fingerprint, blockers, the typed address and phrase, payment verification (fails closed) and the database's own checks. Every other team sees exactly the preview-only screen, and its completion API returns 404. |
| off | `true` | Same as both off: EXECUTE alone exposes nothing (404 before any database or Stripe call). |

Only the exact value `true` turns a flag on.

`COMPLETE_SEASON_EXECUTE_TEAMS` (Stage F) is a comma-separated list of team
addresses (campaign slugs), matched exactly, with spaces around commas
ignored. Unset or empty means **no team**: turning EXECUTE on by itself
completes nothing. There is no wildcard. A listed team that has already been
completed can still replay its receipt.

Covered by the "rollout matrix" and "allowlist" tests in
`season/complete/route.test.ts`, `season/preview/route.test.ts` and
`complete-season/seasonCompleteUi.test.ts`.

## 2. Release scripts (`scripts/release/`)

| File | What it does |
|---|---|
| `complete_season_production_check.sql` | One read-only SELECT: missing prerequisites, which of the four migrations are applied, object counts, completed seasons, transitions, function grants. |
| `complete_season_uninstall.sql` | Emergency removal of exactly what phase_s1–s4 add. One transaction. Refuses once any season has been completed or linked. |
| `test-local.sh` | Tests both on a disposable local PostgreSQL (install → uninstall → schema, privileges and data identical to before → reinstall → refusals). Never contacts Supabase. |

Pre-release production check (2026-10-24): 69 public tables, prerequisites
OK, 0 of 4 Complete Season migrations applied.

## 3. Stage A — backup (before any production change)

1. Supabase dashboard → production project → **Database → Backups**: note
   the newest backup's time (and whether point-in-time recovery is on).
2. Logical backup on your machine (asks for the database password; nothing
   is printed). Use the **Session pooler** connection string from
   Dashboard → Connect (port 5432):

   ```bash
   mkdir -p ~/elf-backups && cd ~/elf-backups
   pg_dump "postgresql://postgres.nggabucgcoaffpppchsp@<session-pooler-host>:5432/postgres" \
     -Fc --no-owner -f elf-prod-before-complete-season-$(date +%Y%m%d-%H%M).dump
   pg_dump "postgresql://postgres.nggabucgcoaffpppchsp@<session-pooler-host>:5432/postgres" \
     --schema-only --schema=public --no-owner -f elf-prod-public-schema-before-complete-season.sql
   pg_restore --list elf-prod-before-complete-season-*.dump | head -5   # readable?
   ls -lh                                                              # non-empty?
   ```

   The dump holds all production data (personal data, password hashes):
   keep it outside every repository, on an encrypted disk, and delete it
   once the release is settled.

## 4. Stage B — database migrations (dashboard SQL editor, in this order)

Do this at a quiet time. Each migration is one transaction and takes
seconds; phase_s1 and phase_s2 briefly lock `campaign_settings`,
`athletes` and the 34 team tables while they add columns and triggers.

For each step: open the file from the branch, copy all of it, Supabase →
SQL Editor → New query, paste, Run. The editor may warn about "destructive
operations" for the migrations: they contain `DROP … IF EXISTS` lines that
only replace their own objects — confirm. If the editor reports an error,
the whole step rolled back: stop and report it.

After each step, run `complete_season_production_check.sql` again. N = the
number of teams the check reported before Stage B.

| Step | File | Expected check result afterwards |
|---|---|---|
| B0 | (check only) | `0 of 4 applied`; functions 0; triggers 0; `teams / without program_id` = `N / n/a` |
| B1 | `supabase/migrations/phase_s1_complete_season.sql` | `1 of 4`; season functions **15**; triggers 0; `N / 0`; completed seasons 0; transitions 0; preview executable by service_role **no**; `team_season_complete` executable by nobody |
| B2 | `supabase/migrations/phase_s2_completed_season_read_only.sql` | `2 of 4`; functions **23**; read-only triggers **34**; `N / 0` |
| B3 | `supabase/migrations/phase_s3_season_preview_access.sql` | `3 of 4`; functions 23; triggers 34; preview executable by service_role **YES** (anon/authenticated **no**) |
| B4 | `supabase/migrations/phase_s4_season_complete_access.sql` | `4 of 4`; functions **24**; triggers 34; `team_season_complete_checked` executable by service_role **YES** only; `team_season_complete` by nobody; completed seasons 0; transitions 0 |

Each step refuses to run before the one it needs. If you re-run a step, also
re-run every later step, in order (re-running phase_s1 alone removes the
preview grant that phase_s3 adds). No other production migration is needed: the check found every
prerequisite (including `phase_t5_attendance_drafts`).

The current production app is unaffected by these migrations: nothing calls
the new functions, and the read-only triggers act only on a completed
season (there are none).

## 5. Stage C — merge and deploy with both flags OFF

Pre-checks:
- Vercel → `elf-team-app` → Settings → Environment Variables:
  `COMPLETE_SEASON_PREVIEW`, `COMPLETE_SEASON_EXECUTE`,
  `ELF_QA_ALLOW_UNVERIFIED_CHECKOUTS`, `ELF_DEPLOYMENT`, `ELF_QA_*` must
  **not** exist. `STRIPE_SECRET_KEY` stays as it is.
- Vercel → Settings → Git: production branch is `main` (a push deploys).
- Note the current production deployment (Deployments → Production) — the
  Instant Rollback target.

Merge (Git Bash), in a fresh detached worktree as for earlier releases:

```bash
cd /c/Projects/elf-complete-season
git fetch origin
git rev-parse --short origin/main            # expect ce85b8e; if not, stop
git worktree add --detach /c/Projects/elf-merge-complete-season origin/main
cd /c/Projects/elf-merge-complete-season
git merge --no-ff feature/complete-season-preprod-hardening \
  -m "Merge Complete Season (Phases 1-5D); flags off"
git diff --stat origin/main HEAD | tail -1    # ~240 files
git push origin HEAD:main
```

Then wait for the Vercel production build (Deployments → newest →
Ready). The deployment guard prints nothing for production; a build that
mentions `deployment-guard` refusing something must not be promoted.

## 6. Stage D — post-deployment smoke tests (both flags off)

- [ ] Site loads; sign in as yourself; Teams list and a team Home load.
- [ ] Team → To-Do: **no** "Complete Season" card.
- [ ] `/team/<your-team>/team/complete-season` → "page isn't available" (404).
- [ ] Browser console on a team page:
      `await fetch('/api/team/<slug>/season/preview').then(r => r.status)` → **404**;
      `await fetch('/api/team/<slug>/season/complete', {method:'POST'}).then(r => r.status)` → **404**.
- [ ] Normal writes still work on an active team you own: post and delete a
      test announcement, save attendance, edit a calendar event.
- [ ] Join flow: `/join/<your team's current code>` shows the team.
- [ ] Re-run the check script: still `4 of 4`, completed seasons 0, transitions 0.
- [ ] Vercel → Runtime logs for 15 minutes: no new errors mentioning
      `season`, `campaign_settings` or `season_completed_read_only`.

## 7. Stage E — preview-only mode (separate approval)

1. Vercel → `elf-team-app` → Environment Variables → add
   `COMPLETE_SEASON_PREVIEW` = `true` (Production). Leave
   `COMPLETE_SEASON_EXECUTE` unset.
2. Redeploy the current production deployment (Deployments → ⋯ → Redeploy).
3. Smoke tests:
   - [ ] As a Head Coach of a team you own: To-Do shows the Complete Season
         card; the preview loads, says **"Preview only"**, has **no** typed
         confirmation fields and **no** Complete button.
   - [ ] The preview's numbers look right for that team (grades, carry-over,
         blockers). It changes nothing.
   - [ ] As an Assistant Coach / parent / athlete: no card; the page says it
         isn't available; `/season/preview` → 403.
   - [ ] `POST /api/team/<slug>/season/complete` → **404** for everyone.
   - [ ] Check script: completed seasons 0, transitions 0.

Enabling completion (`COMPLETE_SEASON_EXECUTE=true`) is a later, separate
release with its own approval: Stage F.

## 8. Stage F — completion for one listed test team (separate approval for each step)

Completion can't be undone (§9 and `docs/COMPLETE_SEASON_REVERSAL.md`).
After the first completion in production, `complete_season_uninstall.sql`
refuses for good, so rollback level 4 no longer exists.

**F0. Prerequisites** (no production change except the release itself)
1. The team-allowlist release is merged and deployed with
   `COMPLETE_SEASON_EXECUTE` and `COMPLETE_SEASON_EXECUTE_TEAMS` **unset**.
   The Stage E smoke tests still pass: the preview works, and
   `POST …/season/complete` returns 404.
2. Take a fresh backup: `bash ~/elf-backups/stage-a-cli-backup.sh` must end
   with `BACKUP OK`. Then verify it offline as in Stage A: checksums, dump
   footers, a restore into a disposable local cluster, and row counts.
3. Run `complete_season_production_check.sql`: `4 of 4 applied`, completed
   seasons 0, transitions 0.
4. Stripe: signed in as a Head Coach (or platform admin), in the browser
   console on that team's page:
   ```js
   await fetch('/api/team/<slug>/season/preview').then(r => r.json()).then(j => j.openCheckouts)
   ```
   This must return `{ state: "checked", count: 0, more: false }`.
   - `{ state: "unknown" }` means the production key can't list Checkout
     Sessions: **stop**. A restricted key needs **Checkout Sessions: Read**.
   - `more: true` means more than 100 checkouts opened in the last 24 hours
     are still open account-wide. Completion is refused until that clears.

**F1. A dedicated test team** (production write)
1. Create a **new** demo team in the Demo Center, with a new address used for
   nothing else. Never use Monroe Valley or any sales demo: after completion
   its old season is read-only and Demo Center reset refuses it.
2. Its only Head Coach is the release owner's ELF account. It has no other
   people, donations, open checkouts, or pending invitations or requests.
3. Open its preview. It must show **0 blockers** and no "couldn't be
   checked" notice. Record the summary numbers, the proposed new address and
   the phrase.

**F2. Turn completion on for that team only**
1. Vercel → `elf-team-app` → Environment Variables → add, both for
   **Production only**:
   - `COMPLETE_SEASON_EXECUTE_TEAMS` = `<test team address>`
   - `COMPLETE_SEASON_EXECUTE` = `true`
2. Redeploy the current production deployment with **"Use existing Build
   Cache"** ticked. If the build fails with
   `next/font/google queries have exactly one entry`, retry once (§10). A
   failed build is never promoted.
3. Check:
   - the new deployment is Ready, built from the same commit, on
     `app.elitelevelfundraising.com`;
   - on a **real** team you coach, the Complete Season screen still says
     "Preview only", and
     `await fetch('/api/team/<real slug>/season/complete', {method:'POST'}).then(r => r.status)`
     returns **404**;
   - on the **test** team, the confirmation form is shown.

**F3. Complete the test team's season (once)**
1. Signed in as the test team's Head Coach, open the preview, type the
   address and the phrase exactly, and press Complete.
2. Keep the receipt: transition id, old and new address, and summary.

**F4. Verify**
1. Check script: completed seasons **1**, transitions **1**.
2. Read-only SQL (prepared at the time). It must show:
   - the test team is archived and completed, with its successor recorded;
   - the successor exists with fundraising off;
   - the counts match the preview;
   - the old join code is revoked;
   - **no other team is completed, archived or linked**.
3. In the app:
   - the old season is read-only (a test announcement is refused);
   - the new season is active, with its roster and copied events.
4. Sending the same request again returns the receipt marked `replayed`. A
   new confirmation on the old season returns 409 "already completed".
5. Runtime logs since F2 show no errors or 5xx responses.

**F5. Afterwards**
- You can keep the test team listed, so its receipt can still be replayed,
  or delete `COMPLETE_SEASON_EXECUTE` and redeploy (§9 level 1).
- Opening completion to a real team means adding its address to
  `COMPLETE_SEASON_EXECUTE_TEAMS` and redeploying, each time with approval.
  There is no "all teams" value.

## 9. Rollback

Use the lightest level that solves the problem.

0. **Stop completion, keep the preview** (Stage F):
   - Seconds: Instant Rollback to the last production deployment built
     without `COMPLETE_SEASON_EXECUTE`.
   - Minutes: delete `COMPLETE_SEASON_EXECUTE` (or remove a team from
     `COMPLETE_SEASON_EXECUTE_TEAMS`) and redeploy.

   Seasons already completed stay completed.
1. **Hide the feature** (minutes): delete `COMPLETE_SEASON_PREVIEW` (and
   `COMPLETE_SEASON_EXECUTE`), redeploy. Everything returns to "both off".
2. **Previous app** (seconds): Vercel → Deployments → the pre-merge
   production deployment → Instant Rollback. (Vercel then stops promoting
   new pushes automatically until you undo the rollback.)
3. **Remove the code from `main`**:
   ```bash
   cd /c/Projects/elf-merge-complete-season
   git fetch origin && git checkout --detach origin/main
   git revert -m 1 <merge commit> --no-edit
   git push origin HEAD:main
   ```
   The old app runs fine with the new schema present.
4. **Remove the database objects** — only if the schema itself is the
   problem, only after level 1, 2 or 3, and only while no season has ever
   been completed: run `scripts/release/complete_season_uninstall.sql` in
   the SQL editor (expect `0 0 0 0`; it refuses otherwise), then the check
   script (`0 of 4`). Tested locally: schema, privileges and data end up
   identical to before Stage B.
5. **Restore the backup** — last resort for data damage; it discards every
   change made since the backup. Production is on the Free plan, with no
   dashboard backups. Restore single tables from the newest
   `~/elf-backups/complete-season-2026-10-24/cli-*/` set (`schema.sql`,
   `data.sql`; plain SQL, via `psql`), rehearsed on a disposable local copy
   first.

A season completed in production cannot be undone from the app or by the
uninstall script: see `docs/COMPLETE_SEASON_REVERSAL.md`.

## 10. Known minor risks

- Some page-level gates (entry card, page gate, panel gate) are tested by
  reading the source, not by rendering the real page.
- JSX whitespace: the production build dropped a space the test renderer
  kept (fixed in 568c4fc). Similar build-only spacing slips are possible
  elsewhere.
- The phase_s2 triggers add a small lookup to writes on 34 team tables
  (measured fine on large QA teams in `large.sh`).
- The preview asks Stripe for open checkouts (read-only). If the live key
  can't list Checkout Sessions the preview says so; completion, once
  enabled, would then be refused (fail closed).
- An open checkout blocks completion for up to 24 hours.
- The check script compares production with the QA schema; columns that
  exist only in production are not a problem.
- Builds download Google Fonts. Google occasionally returns a font address
  that Turbopack can't parse, and the build fails with `next/font/google
  queries have exactly one entry` (upstream vercel/next.js#99114; seen on
  2026-10-26). A failed build is never promoted; retry it. The permanent fix
  is to host the fonts in the repo with `next/font/local`.
- If more than 100 checkouts opened in the last 24 hours are still open
  account-wide, Stripe's answer is incomplete and completion is refused for
  every team (fail closed). The preview doesn't show a notice for that case.
