#!/usr/bin/env bash
# Phase 5 (attendance drafts) migration tests — DISPOSABLE LOCAL
# PostgreSQL ONLY. Never point this at Supabase.
#
#   bash supabase/tests/phase_t5_attendance_drafts/run.sh
#
# Needs initdb/pg_ctl/psql (PostgreSQL 15+) on PATH. Creates a throwaway
# cluster in a temp directory on port 55435, stands in for the production
# tables the migration depends on (bootstrap.sql, including Supabase-style
# roles and default privileges), applies phase_t2 and phase_t3 (existing
# To-Do objects), then phase_t5, and runs:
#   * existing objects unchanged / rerun identical / failure rolls back
#   * tests.sql       behavior checks (privileges, write protection, time
#                     zone, saves, validation, roster changes, history)
#   * concurrency.sh  real parallel sessions
# Exit status is non-zero if any check fails. The cluster is always deleted.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../migrations" && pwd)"
WORK="$(mktemp -d)"; export WORK
DATA="$WORK/data"; LOG="$WORK/pg.log"; PORT=55435; export PORT
P="psql -h localhost -p $PORT -X -q -v ON_ERROR_STOP=1"
initdb -D "$DATA" -U postgres -A trust -E UTF8 >/dev/null || exit 1
pg_ctl -D "$DATA" -o "-p $PORT" -l "$LOG" -w start >/dev/null || exit 1
trap 'pg_ctl -D "$DATA" -m fast -w stop >/dev/null; rm -rf "$WORK"' EXIT
postgres --version
failed=0
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; failed=1; }

$P -U postgres -d postgres -c "CREATE DATABASE elf5" >/dev/null
$P -U postgres -d elf5 -f "$HERE/bootstrap.sql" >/dev/null || { echo "bootstrap failed"; exit 1; }
$P -U supa_owner -d elf5 -f "$REPO/phase_t2_team_tasks.sql" >/dev/null || { echo "phase_t2 failed"; exit 1; }
$P -U supa_owner -d elf5 -f "$REPO/phase_t3_task_acknowledgments.sql" >/dev/null || { echo "phase_t3 failed"; exit 1; }

$P -U postgres -d elf5 -t -A -f "$HERE/snapshot.sql" > "$WORK/snap.before"
$P -U supa_owner -d elf5 -f "$REPO/phase_t5_attendance_drafts.sql"; first=$?
$P -U postgres -d elf5 -t -A -f "$HERE/snapshot.sql" > "$WORK/snap.after"
$P -U postgres -d elf5 -t -A -f "$HERE/t5objects.sql" > "$WORK/t5.first"
$P -U supa_owner -d elf5 -f "$REPO/phase_t5_attendance_drafts.sql"; second=$?
$P -U postgres -d elf5 -t -A -f "$HERE/t5objects.sql" > "$WORK/t5.second"

[ $first = 0 ] && [ $second = 0 ] && pass "migration applies (exit $first) and reapplies (exit $second) as the non-superuser owner" \
  || fail "migration exit codes: first=$first rerun=$second"
if diff -q "$WORK/snap.before" "$WORK/snap.after" >/dev/null; then
  pass "existing tables, To-Do objects, functions and data unchanged ($(wc -l < "$WORK/snap.before") catalog/data rows compared)"
else fail "existing objects changed:"; diff "$WORK/snap.before" "$WORK/snap.after"; fi
if diff -q "$WORK/t5.first" "$WORK/t5.second" >/dev/null; then
  pass "rerun leaves the Phase 5 objects identical ($(wc -l < "$WORK/t5.first") catalog rows compared)"
else fail "rerun changed Phase 5 objects:"; diff "$WORK/t5.first" "$WORK/t5.second"; fi

# A failure inside the migration must leave nothing behind (BEGIN/COMMIT).
$P -U postgres -d postgres -c "CREATE DATABASE elf5rb" >/dev/null
sed '/^CREATE ROLE/d' "$HERE/bootstrap.sql" > "$WORK/boot.rb.sql"
$P -U postgres -d elf5rb -f "$WORK/boot.rb.sql" >/dev/null
sed 's/^COMMIT;\r\?$/SELECT 1\/0;\nCOMMIT;/' "$REPO/phase_t5_attendance_drafts.sql" > "$WORK/t5.broken.sql"
$P -U supa_owner -d elf5rb -f "$WORK/t5.broken.sql" >/dev/null 2>&1
left=$($P -U postgres -d elf5rb -t -A -c "SELECT (SELECT count(*) FROM pg_class WHERE relname LIKE 'team_attendance%' OR relname LIKE 'tas_%' OR relname LIKE 'tar_%') || ',' || (SELECT count(*) FROM pg_proc WHERE proname LIKE 'team_attendance%')")
grep -q '1/0' "$WORK/t5.broken.sql" && [ "$left" = "0,0" ] \
  && pass "a failure inside the migration rolls everything back (nothing left behind)" \
  || fail "partial migration left objects: $left"
$P -U postgres -d postgres -c "DROP DATABASE elf5rb" >/dev/null

$P -U postgres -d elf5 -f "$HERE/tests.sql" > "$WORK/tests.out" 2>&1 || { fail "tests.sql aborted:"; tail -8 "$WORK/tests.out"; }
$P -U postgres -d elf5 -t -A -F ' | ' -c "SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END, name, CASE WHEN ok THEN '' ELSE detail END FROM qa.results ORDER BY n" > "$WORK/results.txt"
$P -U postgres -d elf5 -t -A -c "SELECT 'BEHAVIOR: ' || count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' FROM qa.results"
if grep '^FAIL' "$WORK/results.txt"; then failed=1; fi
$P -U postgres -d elf5 -t -A -c "SELECT 'LARGE ROSTER (2,000 athletes): ' || v FROM qa.vals WHERE k = 'Q_timing'"
[ "${VERBOSE:-0}" = 1 ] && cat "$WORK/results.txt"

bash "$HERE/concurrency.sh" || failed=1
# Phase 5-2: the TypeScript rules drive the real functions end to end.
node --no-warnings "$HERE/agreement.mjs" || failed=1
[ $failed = 0 ] && echo "ALL PASSED" || echo "SOME CHECKS FAILED"
exit $failed
