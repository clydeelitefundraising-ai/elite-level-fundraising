#!/usr/bin/env bash
# Complete Season Phase 1 migration tests — DISPOSABLE LOCAL PostgreSQL
# ONLY. Never point this at Supabase.
#
#   bash supabase/tests/phase_s1_complete_season/run.sh
#
# Needs initdb/pg_ctl/psql (PostgreSQL 15+) on PATH. Creates a throwaway
# cluster in a temp directory on port 55436 that mirrors Supabase's roles
# (a superuser, a NON-superuser "postgres" owner, anon/authenticated/
# service_role), then builds the schema from the REAL production schema
# dump (supabase/baseline/schema.sql, including Supabase's default
# privileges) plus every later migration in order, loads synthetic
# fixtures, and runs:
#   * existing objects and data unchanged / rerun identical / failure
#     rolls back
#   * tests.sql       behavior checks (privileges, rules, authorization,
#                     preview, carryover, idempotency, rollback, 2,000+
#                     athlete team)
#   * concurrency.sh  real parallel sessions
# Exit status is non-zero if any check fails. The cluster is always deleted.
set -u
# Fixtures and tests contain non-ASCII text (emoji, en dash): send it as UTF-8
# whatever the console code page is.
export PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "$0")" && pwd)"
SUPA="$(cd "$HERE/../.." && pwd)"
MIG="$SUPA/migrations"
WORK="$(mktemp -d)"; export WORK
DATA="$WORK/data"; LOG="$WORK/pg.log"; PORT=55436; export PORT
SU="psql -h localhost -p $PORT -X -q -v ON_ERROR_STOP=1 -U supabase_admin"
OW="psql -h localhost -p $PORT -X -q -v ON_ERROR_STOP=1 -U postgres"
initdb -D "$DATA" -U supabase_admin -A trust -E UTF8 >/dev/null || exit 1
pg_ctl -D "$DATA" -o "-p $PORT" -l "$LOG" -w start >/dev/null || exit 1
trap 'pg_ctl -D "$DATA" -m fast -w stop >/dev/null; rm -rf "$WORK"' EXIT
postgres --version
failed=0
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; failed=1; }

# Migrations added after the baseline dump (2026-08-21), in the order they
# were added. The baseline already contains everything before it.
AFTER_BASELINE="
phase_24_5_remove_public_donations_read_policy
phase_a29_platform_admin
phase_a29b_backfill_organizations
phase_a30_platform_admin_writes
phase_a31_message_attachments
phase_a32_team_branding_customized
phase_a33_password_reset_tokens
phase_11a_parent_access_requests
phase_11b_post_likes
phase_a34_campaign_description
phase_a35_coach_fundraising
phase_a36_content_reports
phase_a37_user_blocks
phase_a40_message_moderation_removal
phase_c1_team_members_account_campaign_uniq
phase_g1_group_messaging_schema
phase_g3a_roster_assignment
phase_f1a_fundraising_toggle
phase_f1b_fundraising_inquiries
phase_2_2a_community_partners
phase_2_2b_school_advertising_toggle
phase_2_2d1_community_partner_position_lock
phase_2_2e2_public_community_partners_toggle
phase_t1_account_team_order
phase_t2_team_tasks
phase_t3_task_acknowledgments
phase_t5_attendance_drafts"

# ── Supabase-shaped cluster and the real schema ────────────────────────
$SU -d postgres -c "CREATE ROLE postgres LOGIN CREATEROLE" -c "CREATE ROLE anon NOLOGIN" \
  -c "CREATE ROLE authenticated NOLOGIN" -c "CREATE ROLE service_role NOLOGIN BYPASSRLS" \
  -c "CREATE DATABASE elfbase OWNER postgres" >/dev/null || exit 1
$SU -d elfbase -c "ALTER SCHEMA public OWNER TO postgres" \
  -c "GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role" \
  -c "SET client_min_messages = error" -c "CREATE PUBLICATION supabase_realtime" >/dev/null || exit 1
$OW -d elfbase -f "$SUPA/baseline/schema.sql" >/dev/null 2>"$WORK/base.err" || { echo "baseline failed"; cat "$WORK/base.err"; exit 1; }
for m in $AFTER_BASELINE; do
  $OW -d elfbase -f "$MIG/$m.sql" >/dev/null 2>"$WORK/mig.err" || { echo "migration $m failed"; cat "$WORK/mig.err"; exit 1; }
done
$OW -d elfbase -f "$HERE/fixtures.sql" >/dev/null || { echo "fixtures failed"; exit 1; }
echo "schema: baseline + $(echo $AFTER_BASELINE | wc -w) later migrations; $($OW -d elfbase -t -A -c "SELECT count(*) FROM information_schema.columns WHERE table_schema='public'") columns"
$SU -d postgres -c "CREATE DATABASE elf TEMPLATE elfbase OWNER postgres" -c "CREATE DATABASE elfrb TEMPLATE elfbase OWNER postgres" >/dev/null || exit 1

# ── Migration: applies, reapplies, changes nothing it shouldn't ────────
$SU -d elf -t -A -f "$HERE/snapshot.sql" > "$WORK/snap.before"
$OW -d elf -f "$MIG/phase_s1_complete_season.sql" >/dev/null 2>"$WORK/s1.err"; first=$?
$SU -d elf -t -A -f "$HERE/snapshot.sql" > "$WORK/snap.after"
$SU -d elf -t -A -f "$HERE/s1objects.sql" > "$WORK/s1.first"
$OW -d elf -f "$MIG/phase_s1_complete_season.sql" >/dev/null 2>>"$WORK/s1.err"; second=$?
$SU -d elf -t -A -f "$HERE/s1objects.sql" > "$WORK/s1.second"

[ $first = 0 ] && [ $second = 0 ] && pass "migration applies (exit $first) and reapplies (exit $second) as the non-superuser owner" \
  || { fail "migration exit codes: first=$first rerun=$second"; cat "$WORK/s1.err"; }
if [ ! -s "$WORK/snap.before" ] || [ ! -s "$WORK/s1.first" ]; then fail "catalog snapshot is empty (snapshot query failed)"
elif diff -q "$WORK/snap.before" "$WORK/snap.after" >/dev/null; then
  pass "existing tables, columns, constraints, indexes, triggers, functions, privileges and data unchanged ($(wc -l < "$WORK/snap.before") catalog/data rows compared)"
else fail "existing objects changed:"; diff "$WORK/snap.before" "$WORK/snap.after"; fi
if diff -q "$WORK/s1.first" "$WORK/s1.second" >/dev/null; then
  pass "rerun leaves the Phase 1 objects identical ($(wc -l < "$WORK/s1.first") catalog rows compared)"
else fail "rerun changed Phase 1 objects:"; diff "$WORK/s1.first" "$WORK/s1.second"; fi

# A failure inside the migration must leave nothing behind (BEGIN/COMMIT).
sed 's/^COMMIT;\r\?$/SELECT 1\/0;\nCOMMIT;/' "$MIG/phase_s1_complete_season.sql" > "$WORK/s1.broken.sql"
$OW -d elfrb -f "$WORK/s1.broken.sql" >/dev/null 2>&1
left=$($SU -d elfrb -t -A -c "SELECT (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND column_name IN ('program_id','season_started_at','season_completed_at','predecessor_campaign_slug','successor_campaign_slug','previous_season_athlete_id'))
  || ',' || (SELECT count(*) FROM pg_class WHERE relname LIKE 'team_season%' OR relname LIKE 'campaign_settings_%uniq' OR relname = 'athletes_previous_season_uniq')
  || ',' || (SELECT count(*) FROM pg_proc WHERE proname LIKE 'season\_%' OR proname LIKE 'team\_season\_%')")
grep -q '1/0' "$WORK/s1.broken.sql" && [ "$left" = "0,0,0" ] \
  && pass "a failure inside the migration rolls everything back (nothing left behind)" \
  || fail "partial migration left objects: $left"

# ── Behavior ───────────────────────────────────────────────────────────
$SU -d elf -f "$HERE/tests.sql" > "$WORK/tests.out" 2>&1 || { fail "tests.sql aborted:"; tail -15 "$WORK/tests.out"; }
$SU -d elf -t -A -F ' | ' -c "SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END, name, CASE WHEN ok THEN '' ELSE detail END FROM qa.results ORDER BY n" > "$WORK/results.txt" 2>/dev/null
$SU -d elf -t -A -c "SELECT 'BEHAVIOR: ' || count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' FROM qa.results"
if grep '^FAIL' "$WORK/results.txt"; then failed=1; fi
$SU -d elf -t -A -c "SELECT k || ': ' || v FROM qa.vals WHERE k LIKE 'timing%' ORDER BY k"
[ "${VERBOSE:-0}" = 1 ] && cat "$WORK/results.txt"

bash "$HERE/concurrency.sh" || failed=1
[ $failed = 0 ] && echo "ALL PASSED" || echo "SOME CHECKS FAILED"
exit $failed
