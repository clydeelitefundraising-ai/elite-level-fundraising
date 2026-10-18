#!/usr/bin/env bash
# Phase 3 (task acknowledgments) migration tests — DISPOSABLE LOCAL
# PostgreSQL ONLY. Never point this at Supabase.
#
#   bash supabase/tests/phase_t3_task_acknowledgments/run.sh
#
# Needs initdb/pg_ctl/psql (PostgreSQL 15+) on PATH. Creates a throwaway
# cluster in a temp directory on port 55433, stands in for the production
# tables the migration depends on (bootstrap.sql, including Supabase-style
# roles and default privileges), applies phase_t2 then phase_t3, and runs:
#   * existing objects unchanged / rerun identical / failure rolls back
#   * tests.sql       behavior checks (privileges, roles, cross-team,
#                     multi-child, revisions, deletion, append-only)
#   * concurrency.sh  real parallel sessions
# twice — once per possible team_members.athlete_id delete rule, since
# that table predates the repo migrations. The cluster is always deleted.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../migrations" && pwd)"
WORK="$(mktemp -d)"; export WORK
DATA="$WORK/data"; LOG="$WORK/pg.log"; PORT=55433
P="psql -h localhost -p $PORT -X -q -v ON_ERROR_STOP=1"
initdb -D "$DATA" -U postgres -A trust -E UTF8 >/dev/null || exit 1
pg_ctl -D "$DATA" -o "-p $PORT" -l "$LOG" -w start >/dev/null || exit 1
trap 'pg_ctl -D "$DATA" -m fast -w stop >/dev/null; rm -rf "$WORK"' EXIT
postgres --version

first=1
for RULE in "SET NULL" "CASCADE"; do
  tag=$([ "$RULE" = CASCADE ] && echo cascade || echo setnull)
  echo; echo "==== team_members.athlete_id ON DELETE $RULE ===="
  $P -U postgres -d postgres -c "DROP DATABASE IF EXISTS elf3" -c "CREATE DATABASE elf3" >/dev/null
  if [ $first = 1 ]; then cp "$HERE/bootstrap.sql" "$WORK/boot.tmp.sql"; else sed '/^CREATE ROLE/d' "$HERE/bootstrap.sql" > "$WORK/boot.tmp.sql"; fi
  first=0
  $P -U postgres -d elf3 -v tm_rule="$RULE" -f "$WORK/boot.tmp.sql" >/dev/null || { echo "bootstrap failed"; exit 1; }
  $P -U supa_owner -d elf3 -f "$REPO/phase_t2_team_tasks.sql" >/dev/null || { echo "phase_t2 failed"; exit 1; }
  $P -U postgres -d elf3 -t -A -f "$HERE/snapshot.sql" > "$WORK/snap.before"
  $P -U supa_owner -d elf3 -f "$REPO/phase_t3_task_acknowledgments.sql"; echo "phase_t3 first run: exit $?"
  $P -U postgres -d elf3 -t -A -f "$HERE/snapshot.sql" > "$WORK/snap.after"
  $P -U postgres -d elf3 -t -A -f "$HERE/t3objects.sql" > "$WORK/t3.first"
  $P -U supa_owner -d elf3 -f "$REPO/phase_t3_task_acknowledgments.sql"; echo "phase_t3 rerun:     exit $?"
  $P -U postgres -d elf3 -t -A -f "$HERE/t3objects.sql" > "$WORK/t3.second"
  if diff -q "$WORK/snap.before" "$WORK/snap.after" >/dev/null; then
    echo "PASS  Phase 2 tables, Clearance data and existing functions unchanged ($(wc -l < "$WORK/snap.before") catalog/data rows compared)"
  else echo "FAIL  existing objects changed:"; diff "$WORK/snap.before" "$WORK/snap.after"; fi
  if diff -q "$WORK/t3.first" "$WORK/t3.second" >/dev/null; then
    echo "PASS  rerun leaves the Phase 3 objects identical ($(wc -l < "$WORK/t3.first") catalog rows compared)"
  else echo "FAIL  rerun changed Phase 3 objects:"; diff "$WORK/t3.first" "$WORK/t3.second"; fi

  # A failure inside the migration must leave nothing behind (BEGIN/COMMIT).
  $P -U postgres -d postgres -c "DROP DATABASE IF EXISTS elf3rb" -c "CREATE DATABASE elf3rb" >/dev/null
  sed '/^CREATE ROLE/d' "$HERE/bootstrap.sql" > "$WORK/boot.rb.sql"
  $P -U postgres -d elf3rb -v tm_rule="$RULE" -f "$WORK/boot.rb.sql" >/dev/null
  $P -U supa_owner -d elf3rb -f "$REPO/phase_t2_team_tasks.sql" >/dev/null
  sed 's/^COMMIT;\r\?$/SELECT 1\/0;\nCOMMIT;/' "$REPO/phase_t3_task_acknowledgments.sql" > "$WORK/t3.broken.sql"
  $P -U supa_owner -d elf3rb -f "$WORK/t3.broken.sql" >/dev/null 2>&1
  left=$($P -U postgres -d elf3rb -t -A -c "SELECT (SELECT count(*) FROM pg_class WHERE relname LIKE 'tta_%' OR relname = 'team_task_acknowledgments') || ',' || (SELECT count(*) FROM pg_proc WHERE proname LIKE 'team_task_ack%' OR proname = 'team_task_acknowledge')")
  grep -c '1/0' "$WORK/t3.broken.sql" >/dev/null && [ "$left" = "0,0" ] \
    && echo "PASS  a failure inside the migration rolls everything back (nothing left behind)" \
    || echo "FAIL  partial migration left objects: $left"
  $P -U postgres -d postgres -c "DROP DATABASE elf3rb" >/dev/null

  $P -U postgres -d elf3 -f "$HERE/tests.sql" > "$WORK/tests.$tag.out" 2>&1 || { echo "tests.sql aborted:"; tail -5 "$WORK/tests.$tag.out"; }
  $P -U postgres -d elf3 -t -A -F ' | ' -c "SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END, name, CASE WHEN ok THEN '' ELSE detail END FROM qa.results ORDER BY n" > "$WORK/results.$tag.txt"
  $P -U postgres -d elf3 -t -A -c "SELECT 'BEHAVIOR: ' || count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' FROM qa.results"
  grep '^FAIL' "$WORK/results.$tag.txt"
  bash "$HERE/concurrency.sh"
done
