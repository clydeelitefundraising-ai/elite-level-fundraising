# School Linking — production release (phase_o3)

Releases `feature/school-linking` (Phase A Organization Center per school,
Phase B Platform Admin School Links, Phase B+ completed-season links via
`school_link_apply`). The database change is one migration,
`supabase/migrations/phase_o3_school_link_apply.sql`; it changes no rows.

Every SQL step below runs in **Supabase → production project → SQL Editor →
New query**: open the file from this branch, copy all of it, paste, **Run**.

| File | What it does |
|---|---|
| `scripts/release/school_link_production_precheck.sql` | One read-only table of 25 checks plus OVERALL. Its first statement makes the transaction READ ONLY, so PostgreSQL refuses any write. |
| `scripts/release/school_link_backup_snapshot.sql` | Two read-only exports (current links; current guard definition). Run each part on its own and download the CSV. |
| `supabase/migrations/phase_o3_school_link_apply.sql` | The migration. One transaction; idempotent. |
| `scripts/release/school_link_production_postcheck.sql` | 25 checks plus OVERALL. Probes try writes that must be refused; each probe runs in a subtransaction that is always undone. The only object it creates is a temporary helper function that ends with the session. |
| `supabase/migrations/phase_o3_school_link_apply_down.sql` | Rollback: restores the phase_s2 guard (md5 `de544ccaf6f5b483afea9c5ff5186ab3`) and drops `school_link_apply`. Keeps links and audit rows. |

The scripts print catalog facts, counts and md5 fingerprints only — no names
or emails.

## 1. Backup

1. Supabase → production project → **Database → Backups**.
   - **Scheduled backups** tab: note the newest daily backup's time (it
     should be from the last 24 hours).
   - **Point in Time** tab: note whether point-in-time recovery is enabled
     and its earliest recovery point.
   - If neither tab shows a recent backup, do not continue without the
     logical backup in step 3.
2. Run `school_link_backup_snapshot.sql` Part A and Part B separately; save
   both CSVs with the release record.
3. Optional logical backup (as for Complete Season, see
   `docs/COMPLETE_SEASON_PRODUCTION_RELEASE.md` §3): `pg_dump -Fc` via the
   Session pooler. Keep the dump outside every repository.

## 2. Pre-check — expected values

Every row must be `PASS` or `RECORD`, and OVERALL must be `0 STOP row(s)`.

| # | Check | Expected |
|---|---|---|
| 1 | transaction is read-only | `on` |
| 2 | current_user | `postgres` |
| 3 | postgres server version | recorded (information only) |
| 4 | season_write_guard md5 | `de544ccaf6f5b483afea9c5ff5186ab3` |
| 5 | season_write_guard md5 (line endings ignored) | `de544ccaf6f5b483afea9c5ff5186ab3` |
| 6 | season_write_guard secdef / acl / config / owner | `true {postgres=X/postgres} search_path="" owner=postgres` |
| 7 | season guard helper functions | `season_fk_cascaded(oid,jsonb),season_fk_cleared(oid,jsonb,text[],jsonb),season_is_completed(text),season_row_slug(text,jsonb),season_write_purpose()` |
| 8 | campaign_settings triggers | `season_write_guard(O)` |
| 9 | audit_logs triggers | `(none)` |
| 10 | school_link_apply exists | `false` |
| 11 | functions using the elf.school_link flag | `0` |
| 12 | table owners | all five `=postgres` |
| 13 | FORCE row-level security | all five `=false` |
| 14 | columns used by school_link_apply | `216d9b2370627c61a6a33ee7c6e508d0 (26)` |
| 15 | campaign_settings.organization_id | `uuid nullable=YES` |
| 16 | campaign_settings primary key | `PRIMARY KEY (campaign_slug)` |
| 17 | campaign_settings → organizations foreign key | `campaign_settings_organization_id_fkey` |
| 18 | roles service_role / anon / authenticated | `3` |
| 19 | postgres is not superuser | `true` |
| 20 | API schema-reload event triggers | `pgrst_ddl_watch(O),pgrst_drop_watch(O)` |
| 21 | BASELINE seasons / completed / linked | record |
| 22 | BASELINE link fingerprint | record |
| 23 | BASELINE organizations fingerprint | record |
| 24 | BASELINE platform admins | record; must be ≥ 1 or nobody can use School Links |
| 25 | BASELINE school_link audit rows | `0` |

What a STOP means:

- **4 and 5 differ:** production's guard is not phase_s2's. Applying phase_o3
  would replace an unknown guard, and the down migration would not restore
  it. Unsafe; investigate.
- **Only 4 differs (5 passes):** line endings only. Safe; tell the release
  owner before continuing.
- **6, 8 or 9:** different guard privileges or extra triggers could change
  what a link write does. Unsafe until explained.
- **10, 11, 25:** phase_o3 (or something using its flag) is already present.
  Unsafe; investigate.
- **12, 13, 19:** a non-postgres owner or FORCE row-level security would
  make the SECURITY DEFINER function fail or behave differently. Unsafe.
- **7, 14–17:** missing prerequisites; the migration or the function would
  fail. Unsafe.
- **20:** the API would not see the new function until `NOTIFY pgrst,
  'reload schema';` is run. Safe with that extra step.

## 3. Release order

1. Backup (§1) and pre-check (§2). Any STOP → stop.
2. Apply `phase_o3_school_link_apply.sql`.
3. Post-check: rows 1–8 and 13–25 `PASS`; rows 9–12 equal pre-check rows
   21–24. Production has completed seasons, so row 14 must be > 0.
4. Merge `feature/school-linking` to main and push (release owner).
5. Verify both Vercel production deployments are READY; signed-out smoke
   (School Links APIs return 401; pages redirect to sign-in).
6. Signed-in smoke by a Platform Admin: open School Links and preview only.
   A link-then-unlink round trip only with explicit approval.

The migration must go first. The new app without it shows "Nothing was
changed" when saving a link. The old app with it is unaffected.

## 4. Rollback

1. **App:** Vercel → promote the previous production deployments.
2. **Unwanted links:** relink in School Links; each audit row's
   `previous_value.organization_id` has the old school.
3. **Database** (after the app rollback): run
   `phase_o3_school_link_apply_down.sql`, then the pre-check — row 4 must be
   `de544ccaf6f5b483afea9c5ff5186ab3` again and row 10 `false`.
