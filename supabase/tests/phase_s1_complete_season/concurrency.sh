#!/usr/bin/env bash
# Complete Season concurrency checks: real parallel sessions against the
# local test database (run via run.sh, after tests.sql).
cd "${WORK:?run via run.sh}"
P="psql -h localhost -p ${PORT:?} -U supabase_admin -d elf -X -q -t -A -v ON_ERROR_STOP=0"
SQ() { $P -c "$1" 2>&1; }
pass=0; fail=0
check() { if [ "$2" = "1" ]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1 :: $3"; fi; }
timed() { local s=$(date +%s%N); SQ "$1" > "$2"; echo $(( ($(date +%s%N) - s) / 1000000 )); }

# Four small teams, each with an account-linked Head Coach and 3 athletes.
for t in conca concb concc concd; do
  SQ "INSERT INTO public.elf_accounts (id, email, password_hash, salt, name) VALUES (qa.u('$t-acct'), '$t@example.test', 'x', 'x', '$t');
      INSERT INTO public.campaign_settings (campaign_slug, school_name, sport_name, season) VALUES ('$t-2027', '$t', 'Track', '2027 Season');
      INSERT INTO public.team_coaches (id, campaign_slug, name, email, role, password_hash, salt, account_id)
        VALUES (qa.u('$t-coach'), '$t-2027', '$t', '$t@example.test', 'head_coach', 'unused', 'x', qa.u('$t-acct'));
      INSERT INTO public.athletes (campaign_slug, name, class_year) VALUES ('$t-2027', 'A', 'Freshman'), ('$t-2027', 'B', 'Junior'), ('$t-2027', 'C', 'Senior');" >/dev/null
done
go() { echo "SELECT public.team_season_complete('$1-2027', jsonb_build_object('coach_id', qa.u('$1-coach')), NULL, NULL, public.team_season_fingerprint('$1-2027'), qa.u('$2'), 'COMPLETE 2027 SEASON');"; }
successors() { SQ "SELECT count(*) FROM public.campaign_settings WHERE predecessor_campaign_slug = '$1-2027';"; }
audits() { SQ "SELECT count(*) FROM public.team_season_transitions WHERE from_campaign_slug = '$1-2027';"; }

# C1: the same request twice at once (double click) -> the second waits for
# the first, then returns the first one's stored result as a replay.
( $P -c "BEGIN;" -c "$(go conca k-conca)" -c "SELECT pg_sleep(3);" -c "COMMIT;" > c1a.out 2>&1 ) &
sleep 1
waited=$(timed "$(go conca k-conca)" c1b.out)
wait
ida=$(grep -o '"transition_id": "[^"]*"' c1a.out); idb=$(grep -o '"transition_id": "[^"]*"' c1b.out)
ok=0; [ "$waited" -ge 1500 ] && grep -q '"replayed": false' c1a.out && grep -q '"replayed": true' c1b.out && [ -n "$ida" ] && [ "$ida" = "$idb" ] \
  && [ "$(successors conca)" = 1 ] && [ "$(audits conca)" = 1 ] && ok=1
check "C1 identical simultaneous requests: second waited ${waited}ms and got the first's result as a replay; one successor, one audit row" "$ok" "a=$(cat c1a.out) b=$(cat c1b.out)"

# C2: two different requests at once (two coaches) -> the second waits, then
# is told the season is already completed. Never two successors.
( $P -c "BEGIN;" -c "$(go concb k-concb-1)" -c "SELECT pg_sleep(3);" -c "COMMIT;" > c2a.out 2>&1 ) &
sleep 1
waited=$(timed "$(go concb k-concb-2)" c2b.out)
wait
ok=0; [ "$waited" -ge 1500 ] && grep -q '"replayed": false' c2a.out && grep -q season_already_completed c2b.out \
  && [ "$(successors concb)" = 1 ] && [ "$(audits concb)" = 1 ] && ok=1
check "C2 different simultaneous requests: second waited ${waited}ms, then refused (already completed); one successor" "$ok" "a=$(cat c2a.out) b=$(cat c2b.out)"

# C3: the first call's transaction is held open past lock_timeout -> the
# second gives up after ~10s instead of hanging; the first still commits.
( $P -c "BEGIN;" -c "$(go concc k-concc-1)" -c "SELECT pg_sleep(13);" -c "COMMIT;" > c3a.out 2>&1 ) &
sleep 1
waited=$(timed "$(go concc k-concc-2)" c3b.out)
wait
ok=0; [ "$waited" -ge 9000 ] && [ "$waited" -lt 12500 ] && grep -qi 'lock timeout' c3b.out && grep -q '"replayed": false' c3a.out \
  && [ "$(successors concc)" = 1 ] && ok=1
check "C3 a stuck first call: second gave up after ${waited}ms (lock_timeout 10s) instead of hanging; first committed" "$ok" "a=$(cat c3a.out) b=$(cat c3b.out)"

# C4 (documents the Phase 2 dependency, not a pass/fail check): a roster
# write that commits while a transition holds the team is NOT blocked in
# Phase 1 — it lands on the completed season. Phase 2's guard triggers make
# such writes wait for the team row and then refuse.
( $P -c "BEGIN;" -c "$(go concd k-concd)" -c "SELECT pg_sleep(3);" -c "COMMIT;" > c4a.out 2>&1 ) &
sleep 1
waited=$(timed "INSERT INTO public.athletes (campaign_slug, name, class_year) VALUES ('concd-2027', 'Late', 'Junior');" c4b.out)
wait
late=$(SQ "SELECT count(*) FROM public.athletes WHERE campaign_slug = 'concd-2027' AND name = 'Late';")
echo "INFO  C4 Phase 2 dependency: a roster insert during a transition waited ${waited}ms and landed on the completed season (rows: $late) — Phase 2 must refuse this"

echo "CONCURRENCY: $pass passed, $fail failed"
[ $fail = 0 ]
