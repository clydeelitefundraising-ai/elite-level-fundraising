#!/usr/bin/env bash
# Complete Season Phase 3 (read-only preview access) tests — DISPOSABLE
# LOCAL PostgreSQL ONLY. Never point this at Supabase.
#
#   bash supabase/tests/phase_s3_season_preview_access/run.sh
#
# Same Supabase-shaped cluster as Phases 1–2 (real schema dump + every later
# migration + synthetic fixtures + phase_s1 + phase_s2), on port 55438, then:
#   * phase_s3 applies, reapplies, changes nothing but the preview
#     function's own privileges/security, rolls back on failure
#   * tests.sql: exactly one new permission (service_role may run the
#     preview; nothing else, and never team_season_complete), and the
#     preview called as service_role is correct and still checks its actor
# Exit status is non-zero if any check fails. The cluster is always deleted.
set -u
export PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "$0")" && pwd)"
SUPA="$(cd "$HERE/../.." && pwd)"
MIG="$SUPA/migrations"
S1="$SUPA/tests/phase_s1_complete_season"
S2="$SUPA/tests/phase_s2_completed_season_read_only"
WORK="$(mktemp -d)"; export WORK
DATA="$WORK/data"; LOG="$WORK/pg.log"; PORT=55438; export PORT
SU="psql -h localhost -p $PORT -X -q -v ON_ERROR_STOP=1 -U supabase_admin"
OW="psql -h localhost -p $PORT -X -q -v ON_ERROR_STOP=1 -U postgres"
initdb -D "$DATA" -U supabase_admin -A trust -E UTF8 >/dev/null || exit 1
pg_ctl -D "$DATA" -o "-p $PORT" -l "$LOG" -w start >/dev/null || exit 1
trap 'pg_ctl -D "$DATA" -m fast -w stop >/dev/null; rm -rf "$WORK"' EXIT
postgres --version
failed=0
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; failed=1; }

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
$OW -d elfbase -f "$MIG/phase_s2_completed_season_read_only.sql" >/dev/null 2>&1 || { echo "phase_s2 failed"; exit 1; }
echo "schema: baseline + $(echo $AFTER_BASELINE | wc -w) later migrations + phase_s1 + phase_s2"
$SU -d postgres -c "CREATE DATABASE elf TEMPLATE elfbase OWNER postgres" -c "CREATE DATABASE elfrb TEMPLATE elfbase OWNER postgres" >/dev/null || exit 1

# ── Migration ──────────────────────────────────────────────────────────
$SU -d elf -t -A -f "$S2/snapshot.sql" > "$WORK/snap.before"
$OW -d elf -f "$MIG/phase_s3_season_preview_access.sql" >/dev/null 2>"$WORK/s3.err"; first=$?
$SU -d elf -t -A -f "$S2/snapshot.sql" > "$WORK/snap.after"
$SU -d elf -t -A -c "SELECT p.oid::regprocedure || ':' || prosecdef || ':' || coalesce(proacl::text, '') || ':' || coalesce(array_to_string(proconfig, ','), '') || ':' || md5(prosrc) FROM pg_proc p WHERE proname = 'team_season_preview'" > "$WORK/s3.first"
$OW -d elf -f "$MIG/phase_s3_season_preview_access.sql" >/dev/null 2>>"$WORK/s3.err"; second=$?
$SU -d elf -t -A -c "SELECT p.oid::regprocedure || ':' || prosecdef || ':' || coalesce(proacl::text, '') || ':' || coalesce(array_to_string(proconfig, ','), '') || ':' || md5(prosrc) FROM pg_proc p WHERE proname = 'team_season_preview'" > "$WORK/s3.second"
[ $first = 0 ] && [ $second = 0 ] && pass "migration applies (exit $first) and reapplies (exit $second) as the non-superuser owner" \
  || { fail "migration exit codes: first=$first rerun=$second"; cat "$WORK/s3.err"; }
changed=$(diff "$WORK/snap.before" "$WORK/snap.after" | grep -E '^[<>]' | grep -vc 'team_season_preview(')
if [ ! -s "$WORK/snap.before" ]; then fail "catalog snapshot is empty"
elif [ "$changed" = 0 ] && ! diff -q "$WORK/snap.before" "$WORK/snap.after" >/dev/null; then
  pass "only team_season_preview's privileges changed ($(wc -l < "$WORK/snap.before") catalog/data rows compared; body, data and everything else identical)"
else fail "unexpected changes ($changed lines besides team_season_preview):"; diff "$WORK/snap.before" "$WORK/snap.after"; fi
diff -q "$WORK/s3.first" "$WORK/s3.second" >/dev/null && pass "rerun leaves the preview function identical" || fail "rerun changed the preview function"
sed 's/^COMMIT;\r\?$/SELECT 1\/0;\nCOMMIT;/' "$MIG/phase_s3_season_preview_access.sql" > "$WORK/s3.broken.sql"
$OW -d elfrb -f "$WORK/s3.broken.sql" >/dev/null 2>&1
left=$($SU -d elfrb -t -A -c "SELECT prosecdef || ',' || has_function_privilege('service_role', oid, 'EXECUTE') FROM pg_proc WHERE proname = 'team_season_preview'")
grep -q '1/0' "$WORK/s3.broken.sql" && [ "$left" = "false,false" ] && pass "a failure inside the migration rolls everything back" || fail "partial migration left: $left"

# ── Behavior ───────────────────────────────────────────────────────────
$SU -d elf -f "$HERE/tests.sql" > "$WORK/tests.out" 2>&1 || { fail "tests.sql aborted:"; tail -15 "$WORK/tests.out"; }
$SU -d elf -t -A -F ' | ' -c "SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END, name, CASE WHEN ok THEN '' ELSE detail END FROM qa.results ORDER BY n" > "$WORK/results.txt" 2>/dev/null
$SU -d elf -t -A -c "SELECT 'BEHAVIOR: ' || count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' FROM qa.results"
if grep '^FAIL' "$WORK/results.txt"; then failed=1; fi
[ "${VERBOSE:-0}" = 1 ] && cat "$WORK/results.txt"
[ $failed = 0 ] && echo "ALL PASSED" || echo "SOME CHECKS FAILED"
exit $failed
