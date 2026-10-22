#!/usr/bin/env bash
# Complete Season Phase 2 (completed seasons are read-only) tests —
# DISPOSABLE LOCAL PostgreSQL ONLY. Never point this at Supabase.
#
#   bash supabase/tests/phase_s2_completed_season_read_only/run.sh
#
# Same Supabase-shaped cluster as Phase 1 (real schema dump + every later
# migration + synthetic fixtures + phase_s1), on port 55437, then:
#   * phase_s2 applies, reapplies, changes nothing it shouldn't, rolls back
#     on failure
#   * the Phase 1 behavior suite again, WITH the Phase 2 guards in place
#     (the transition must still work under them)
#   * tests.sql       every protected mutation, what stays allowed, the
#                     removal purposes, foreign-key cascades, attendance
#                     boundaries, requests, admin reopen, active teams
#   * concurrency.sh  writes racing a completion
# Exit status is non-zero if any check fails. The cluster is always deleted.
set -u
export PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "$0")" && pwd)"
SUPA="$(cd "$HERE/../.." && pwd)"
MIG="$SUPA/migrations"
S1="$SUPA/tests/phase_s1_complete_season"
WORK="$(mktemp -d)"; export WORK
DATA="$WORK/data"; LOG="$WORK/pg.log"; PORT=55437; export PORT
SU="psql -h localhost -p $PORT -X -q -v ON_ERROR_STOP=1 -U supabase_admin"
OW="psql -h localhost -p $PORT -X -q -v ON_ERROR_STOP=1 -U postgres"
initdb -D "$DATA" -U supabase_admin -A trust -E UTF8 >/dev/null || exit 1
pg_ctl -D "$DATA" -o "-p $PORT" -l "$LOG" -w start >/dev/null || exit 1
if [ "${KEEP:-0}" = 1 ]; then trap 'echo "KEEP=1: cluster left running on port $PORT (data $DATA)"' EXIT
else trap 'pg_ctl -D "$DATA" -m fast -w stop >/dev/null; rm -rf "$WORK"' EXIT; fi
postgres --version
failed=0
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; failed=1; }

# The same migration list as the Phase 1 runner (single source of truth).
AFTER_BASELINE=$(sed -n '/^AFTER_BASELINE="/,/"$/p' "$S1/run.sh" | tr -d '"' | sed 's/^AFTER_BASELINE=//')

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
$OW -d elfbase -f "$S1/fixtures.sql" >/dev/null || { echo "fixtures failed"; exit 1; }
$OW -d elfbase -f "$MIG/phase_s1_complete_season.sql" >/dev/null 2>&1 || { echo "phase_s1 failed"; exit 1; }
echo "schema: baseline + $(echo $AFTER_BASELINE | wc -w) later migrations + phase_s1"
$SU -d postgres -c "CREATE DATABASE elf TEMPLATE elfbase OWNER postgres" -c "CREATE DATABASE elfrb TEMPLATE elfbase OWNER postgres" \
  -c "CREATE DATABASE elfp1 TEMPLATE elfbase OWNER postgres" >/dev/null || exit 1

# ── Migration: applies, reapplies, changes nothing it shouldn't ────────
$SU -d elf -t -A -f "$HERE/snapshot.sql" > "$WORK/snap.before"
$OW -d elf -f "$MIG/phase_s2_completed_season_read_only.sql" >/dev/null 2>"$WORK/s2.err"; first=$?
$SU -d elf -t -A -f "$HERE/snapshot.sql" > "$WORK/snap.after"
$SU -d elf -t -A -f "$HERE/s2objects.sql" > "$WORK/s2.first"
$OW -d elf -f "$MIG/phase_s2_completed_season_read_only.sql" >/dev/null 2>>"$WORK/s2.err"; second=$?
$SU -d elf -t -A -f "$HERE/s2objects.sql" > "$WORK/s2.second"
[ $first = 0 ] && [ $second = 0 ] && pass "migration applies (exit $first) and reapplies (exit $second) as the non-superuser owner" \
  || { fail "migration exit codes: first=$first rerun=$second"; grep -v NOTICE "$WORK/s2.err"; }
if [ ! -s "$WORK/snap.before" ] || [ ! -s "$WORK/s2.first" ]; then fail "catalog snapshot is empty (snapshot query failed)"
elif diff -q "$WORK/snap.before" "$WORK/snap.after" >/dev/null; then
  pass "existing tables, constraints, indexes, triggers, functions (incl. Phase 1), privileges and data unchanged ($(wc -l < "$WORK/snap.before") catalog/data rows compared)"
else fail "existing objects changed:"; diff "$WORK/snap.before" "$WORK/snap.after"; fi
if diff -q "$WORK/s2.first" "$WORK/s2.second" >/dev/null; then
  pass "rerun leaves the Phase 2 objects identical ($(wc -l < "$WORK/s2.first") catalog rows compared)"
else fail "rerun changed Phase 2 objects:"; diff "$WORK/s2.first" "$WORK/s2.second"; fi
sed 's/^COMMIT;\r\?$/SELECT 1\/0;\nCOMMIT;/' "$MIG/phase_s2_completed_season_read_only.sql" > "$WORK/s2.broken.sql"
$OW -d elfrb -f "$WORK/s2.broken.sql" >/dev/null 2>&1
left=$($SU -d elfrb -t -A -c "SELECT (SELECT count(*) FROM pg_trigger WHERE tgname IN ('season_write_guard', 'team_attendance_season_start_guard'))
  || ',' || (SELECT count(*) FROM pg_proc WHERE proname IN ('season_is_completed', 'season_write_purpose', 'season_fk_target_exists', 'season_fk_cleared',
       'season_fk_cascaded', 'season_row_slug', 'season_write_guard', 'team_attendance_season_start_guard'))")
grep -q '1/0' "$WORK/s2.broken.sql" && [ "$left" = "0,0" ] \
  && pass "a failure inside the migration rolls everything back (nothing left behind)" \
  || fail "partial migration left objects: $left"

# ── Phase 1 behavior again, with the Phase 2 guards in place ───────────
$OW -d elfp1 -f "$MIG/phase_s2_completed_season_read_only.sql" >/dev/null 2>&1 || fail "phase_s2 on elfp1"
$SU -d elfp1 -v phase2=1 -f "$S1/tests.sql" > "$WORK/p1.out" 2>&1 || { fail "Phase 1 tests.sql aborted under Phase 2:"; tail -15 "$WORK/p1.out"; }
$SU -d elfp1 -t -A -F ' | ' -c "SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END, name, CASE WHEN ok THEN '' ELSE detail END FROM qa.results ORDER BY n" > "$WORK/p1.txt" 2>/dev/null
$SU -d elfp1 -t -A -c "SELECT 'PHASE 1 BEHAVIOR WITH PHASE 2 GUARDS: ' || count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' FROM qa.results"
if grep '^FAIL' "$WORK/p1.txt"; then failed=1; fi

# ── Phase 2 behavior ───────────────────────────────────────────────────
$SU -d elf -f "$HERE/tests.sql" > "$WORK/tests.out" 2>&1 || { fail "tests.sql aborted:"; tail -15 "$WORK/tests.out"; }
$SU -d elf -t -A -F ' | ' -c "SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END, name, CASE WHEN ok THEN '' ELSE detail END FROM qa.results ORDER BY n" > "$WORK/results.txt" 2>/dev/null
$SU -d elf -t -A -c "SELECT 'PHASE 2 BEHAVIOR: ' || count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' FROM qa.results"
if grep '^FAIL' "$WORK/results.txt"; then failed=1; fi
[ "${VERBOSE:-0}" = 1 ] && cat "$WORK/results.txt"

bash "$HERE/concurrency.sh" || failed=1
[ $failed = 0 ] && echo "ALL PASSED" || echo "SOME CHECKS FAILED"
exit $failed
