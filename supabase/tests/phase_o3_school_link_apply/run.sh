#!/usr/bin/env bash
# School-Account Linking Phase B+ (completed-season school links, atomic
# apply) tests — DISPOSABLE LOCAL PostgreSQL ONLY. Never point this at
# Supabase.
#
#   bash supabase/tests/phase_o3_school_link_apply/run.sh
#
# Same Supabase-shaped cluster as the Complete Season phases (real schema
# dump + every later migration + synthetic fixtures + phase_s1..s4 + t6 +
# t7), on port 55441, then:
#   * phase_o3 applies, reapplies, changes nothing but season_write_guard()'s
#     body and the new school_link_apply(), refuses to run before phase_s2,
#     rolls back on failure, and the down migration restores phase_s2's
#     guard byte-for-byte
#   * the whole Phase 2 read-only suite again WITH phase_o3 applied (every
#     other completed-season write is still refused)
#   * tests.sql       metadata-only linking on completed seasons, everything
#                     else still blocked, actor/input/chain/stale checks,
#                     audit rows in the same transaction, privileges
#   * concurrency.sh  parallel applies (one wins, the other is stale), an
#                     apply racing a completion, an apply racing a direct
#                     write, a failure after the audit insert (rolls back)
# Exit status is non-zero if any check fails. The cluster is always deleted
# (KEEP=1 leaves it running for inspection).
set -u
export PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "$0")" && pwd)"
SUPA="$(cd "$HERE/../.." && pwd)"
MIG="$SUPA/migrations"
S1="$SUPA/tests/phase_s1_complete_season"
S2="$SUPA/tests/phase_s2_completed_season_read_only"
WORK="$(mktemp -d)"; export WORK
DATA="$WORK/data"; LOG="$WORK/pg.log"; PORT=55441; export PORT
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
# Before phase_s2: phase_o3 must refuse to apply here.
$SU -d postgres -c "CREATE DATABASE elfnos2 TEMPLATE elfbase OWNER postgres" >/dev/null || exit 1
$OW -d elfbase -f "$MIG/phase_s2_completed_season_read_only.sql" >/dev/null 2>&1 || { echo "phase_s2 failed"; exit 1; }
# Phase 2's own suite runs on s1 + s2 (+ o3), exactly as its runner builds it.
$SU -d postgres -c "CREATE DATABASE elfs2 TEMPLATE elfbase OWNER postgres" >/dev/null || exit 1
for m in phase_s3_season_preview_access phase_s4_season_complete_access phase_t6_team_overview phase_t7_public_athlete_photos; do
  $OW -d elfbase -f "$MIG/$m.sql" >/dev/null 2>"$WORK/mig.err" || { echo "migration $m failed"; cat "$WORK/mig.err"; exit 1; }
done
echo "schema: baseline + $(echo $AFTER_BASELINE | wc -w) later migrations + phase_s1..s4 + t6 + t7"
$SU -d postgres -c "CREATE DATABASE elf TEMPLATE elfbase OWNER postgres" -c "CREATE DATABASE elfrb TEMPLATE elfbase OWNER postgres" \
  -c "CREATE DATABASE elfdown TEMPLATE elfbase OWNER postgres" >/dev/null || exit 1

# ── Migration ──────────────────────────────────────────────────────────
# Phase 2's catalog + data snapshot, with nothing excluded: the only
# differences allowed are season_write_guard()'s body and the new function.
# Function bodies are compared without CRs: phase_s2.sql is CRLF here, but
# the live guard (applied via the SQL editor) is LF, and the down migration
# restores the LF body (md5 de544ccaf6f5b483afea9c5ff5186ab3 on QA).
sed -e 's/SELECT n IN (/SELECT false AND n IN (/' -e "s/md5(prosrc)/md5(replace(prosrc, chr(13), ''))/" "$S2/snapshot.sql" > "$WORK/snapshot.sql"
grep -q 'SELECT false AND n IN' "$WORK/snapshot.sql" || fail "snapshot filter rewrite did not apply"
GUARD="SELECT md5(prosrc) || ':' || prosecdef || ':' || coalesce(proacl::text, '') || ':' || coalesce(array_to_string(proconfig, ','), '') FROM pg_proc WHERE oid = 'public.season_write_guard()'::regprocedure"
FN="SELECT p.oid::regprocedure || ':' || prosecdef || ':' || coalesce(proacl::text, '') || ':' || coalesce(array_to_string(proconfig, ','), '') || ':' || md5(prosrc) FROM pg_proc p WHERE proname IN ('season_write_guard', 'school_link_apply') ORDER BY 1"
$SU -d elf -t -A -f "$WORK/snapshot.sql" > "$WORK/snap.before"
guard_s2=$($SU -d elf -t -A -c "$GUARD")
$OW -d elf -f "$MIG/phase_o3_school_link_apply.sql" >/dev/null 2>"$WORK/o3.err"; first=$?
$SU -d elf -t -A -f "$WORK/snapshot.sql" > "$WORK/snap.after"
$SU -d elf -t -A -c "$FN" > "$WORK/o3.first"
$OW -d elf -f "$MIG/phase_o3_school_link_apply.sql" >/dev/null 2>>"$WORK/o3.err"; second=$?
$SU -d elf -t -A -c "$FN" > "$WORK/o3.second"
[ $first = 0 ] && [ $second = 0 ] && pass "migration applies (exit $first) and reapplies (exit $second) as the non-superuser owner" \
  || { fail "migration exit codes: first=$first rerun=$second"; cat "$WORK/o3.err"; }
diff "$WORK/snap.before" "$WORK/snap.after" | grep -E '^[<>]' > "$WORK/snap.diff"
other=$(grep -vcE '^[<>] fn (public\.)?season_write_guard\(\):|^> fn (public\.)?school_link_apply\(jsonb,text,uuid,jsonb,jsonb\):' "$WORK/snap.diff")
gl=$(grep -cE '^[<>] fn (public\.)?season_write_guard\(\):' "$WORK/snap.diff"); nl=$(grep -cE '^> fn (public\.)?school_link_apply\(' "$WORK/snap.diff")
if [ ! -s "$WORK/snap.before" ]; then fail "catalog snapshot is empty"
elif [ "$other" = 0 ] && [ "$gl" = 2 ] && [ "$nl" = 1 ]; then
  pass "only season_write_guard()'s body changed and school_link_apply() was added ($(wc -l < "$WORK/snap.before") catalog/data rows compared; every table, trigger, policy, privilege, other function and row identical)"
else fail "unexpected changes (other=$other guard=$gl new=$nl):"; cat "$WORK/snap.diff"; fi
guard_o3=$($SU -d elf -t -A -c "$GUARD")
[ "${guard_s2#*:}" = "${guard_o3#*:}" ] && [ "${guard_s2%%:*}" != "${guard_o3%%:*}" ] \
  && pass "season_write_guard keeps SECURITY DEFINER, its privileges and search_path; only its body changed" \
  || fail "guard attributes changed: $guard_s2 -> $guard_o3"
diff -q "$WORK/o3.first" "$WORK/o3.second" >/dev/null && pass "rerun leaves both functions identical" || fail "rerun changed a function"
gdef() { $SU -d "$1" -t -A -c "SELECT pg_get_functiondef('public.season_write_guard()'::regprocedure)" | tr -d '\r'; }
gdef elf > "$WORK/guard.o3"; gdef elfbase > "$WORK/guard.s2"
added=$(diff "$WORK/guard.o3" "$WORK/guard.s2" | grep -c '^<'); removed=$(diff "$WORK/guard.o3" "$WORK/guard.s2" | grep -c '^>')
[ "$removed" = 0 ] && [ "$added" -ge 5 ] && [ "$added" -le 9 ] && grep -q "elf.school_link" "$WORK/guard.o3" \
  && pass "guard diff vs phase_s2 is purely additive ($added lines added, 0 removed or altered)" \
  || { fail "guard diff: +$added -$removed"; diff "$WORK/guard.o3" "$WORK/guard.s2"; }
$OW -d elfnos2 -f "$MIG/phase_o3_school_link_apply.sql" >/dev/null 2>"$WORK/nos2.err"
none=$($SU -d elfnos2 -t -A -c "SELECT to_regprocedure('public.school_link_apply(jsonb,text,uuid,jsonb,jsonb)') IS NULL AND to_regprocedure('public.season_write_guard()') IS NULL")
grep -q "requires phase_s2" "$WORK/nos2.err" && [ "$none" = "t" ] && pass "refuses to apply before phase_s2 (and creates nothing)" || fail "applied without phase_s2: $none $(cat "$WORK/nos2.err")"
sed 's/^COMMIT;\r\?$/SELECT 1\/0;\nCOMMIT;/' "$MIG/phase_o3_school_link_apply.sql" > "$WORK/o3.broken.sql"
$OW -d elfrb -f "$WORK/o3.broken.sql" >/dev/null 2>&1
left=$($SU -d elfrb -t -A -c "SELECT (to_regprocedure('public.school_link_apply(jsonb,text,uuid,jsonb,jsonb)') IS NOT NULL)::text")
guard_rb=$($SU -d elfrb -t -A -c "$GUARD")
grep -q '1/0' "$WORK/o3.broken.sql" && [ "$left" = "false" ] && [ "$guard_rb" = "$guard_s2" ] \
  && pass "a failure inside the migration rolls everything back (no function, phase_s2 guard intact)" || fail "partial migration left: fn=$left guard=$guard_rb"
# Down: apply, then reverse; the catalog must match the pre-o3 snapshot.
$SU -d elfdown -t -A -f "$WORK/snapshot.sql" > "$WORK/down.before"
$OW -d elfdown -f "$MIG/phase_o3_school_link_apply.sql" >/dev/null 2>&1 || fail "o3 on elfdown"
$OW -d elfdown -f "$MIG/phase_o3_school_link_apply_down.sql" >/dev/null 2>"$WORK/down.err"; d1=$?
$OW -d elfdown -f "$MIG/phase_o3_school_link_apply_down.sql" >/dev/null 2>>"$WORK/down.err"; d2=$?
$SU -d elfdown -t -A -f "$WORK/snapshot.sql" > "$WORK/down.after"
[ $d1 = 0 ] && [ $d2 = 0 ] && diff -q "$WORK/down.before" "$WORK/down.after" >/dev/null \
  && pass "down migration (twice) restores phase_s2's guard byte-for-byte and drops school_link_apply (catalog identical to before phase_o3)" \
  || { fail "down: exit $d1/$d2"; cat "$WORK/down.err"; diff "$WORK/down.before" "$WORK/down.after"; }

# ── Phase 2 read-only suite, with phase_o3 applied ─────────────────────
$OW -d elfs2 -f "$MIG/phase_o3_school_link_apply.sql" >/dev/null 2>&1 || fail "phase_o3 on elfs2"
$SU -d elfs2 -f "$S2/tests.sql" > "$WORK/s2.out" 2>&1 || { fail "Phase 2 tests.sql aborted under phase_o3:"; tail -15 "$WORK/s2.out"; }
$SU -d elfs2 -t -A -F ' | ' -c "SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END, name, CASE WHEN ok THEN '' ELSE detail END FROM qa.results ORDER BY n" > "$WORK/s2.txt" 2>/dev/null
$SU -d elfs2 -t -A -c "SELECT 'PHASE 2 READ-ONLY SUITE WITH PHASE_O3: ' || count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' FROM qa.results"
if grep '^FAIL' "$WORK/s2.txt"; then failed=1; fi
[ "$(grep -c '^PASS' "$WORK/s2.txt")" -gt 50 ] || fail "Phase 2 suite ran too few checks"

# ── Behavior ───────────────────────────────────────────────────────────
$SU -d elf -f "$HERE/tests.sql" > "$WORK/tests.out" 2>&1 || { fail "tests.sql aborted:"; tail -15 "$WORK/tests.out"; }
$SU -d elf -t -A -F ' | ' -c "SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END, name, CASE WHEN ok THEN '' ELSE detail END FROM qa.results ORDER BY n" > "$WORK/results.txt" 2>/dev/null
$SU -d elf -t -A -c "SELECT 'BEHAVIOR: ' || count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' FROM qa.results"
if grep '^FAIL' "$WORK/results.txt"; then failed=1; fi
[ "${VERBOSE:-0}" = 1 ] && cat "$WORK/results.txt"

# ── Concurrency ────────────────────────────────────────────────────────
bash "$HERE/concurrency.sh" || failed=1

[ $failed = 0 ] && echo "ALL PASSED" || echo "SOME CHECKS FAILED"
exit $failed
