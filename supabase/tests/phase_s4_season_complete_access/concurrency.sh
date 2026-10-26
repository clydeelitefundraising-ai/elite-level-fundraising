#!/usr/bin/env bash
# Complete Season Phase 4 concurrency checks: real parallel sessions, each
# calling the transition AS service_role (the app server's role), against
# the local test database (run via run.sh, after tests.sql).
cd "${WORK:?run via run.sh}"
P="psql -h localhost -p ${PORT:?} -U supabase_admin -d elf -X -q -t -A -v ON_ERROR_STOP=0"
SQ() { $P -c "$1" 2>&1; }
pass=0; fail=0
check() { if [ "$2" = "1" ]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1 :: $3"; fi; }
timed() { local s=$(date +%s%N); $P -c "SET ROLE service_role" -c "$1" > "$2" 2>&1; echo $(( ($(date +%s%N) - s) / 1000000 )); }

# Two small teams, each with an account-linked Head Coach and 3 athletes.
for t in svca svcb; do
  SQ "INSERT INTO public.elf_accounts (id, email, password_hash, salt, name) VALUES (qa.u('$t-acct'), '$t@example.test', 'x', 'x', '$t');
      INSERT INTO public.campaign_settings (campaign_slug, school_name, sport_name, season) VALUES ('$t-2027', '$t', 'Track', '2027 Season');
      INSERT INTO public.team_coaches (id, campaign_slug, name, email, role, password_hash, salt, account_id)
        VALUES (qa.u('$t-coach'), '$t-2027', '$t', '$t@example.test', 'head_coach', 'unused', 'x', qa.u('$t-acct'));
      INSERT INTO public.athletes (campaign_slug, name, class_year) VALUES ('$t-2027', 'A', 'Freshman'), ('$t-2027', 'B', 'Junior'), ('$t-2027', 'C', 'Senior');" >/dev/null
done
fp() { SQ "SELECT public.team_season_fingerprint('$1-2027');" | tr -d '[:space:]'; }
go() { echo "SELECT public.team_season_complete_checked('$1-2027', jsonb_build_object('coach_id', qa.u('$1-coach')), NULL, NULL, '$2', qa.u('$3'), 'COMPLETE 2027 SEASON');"; }
successors() { SQ "SELECT count(*) FROM public.campaign_settings WHERE predecessor_campaign_slug = '$1-2027';"; }
audits() { SQ "SELECT count(*) FROM public.team_season_transitions WHERE from_campaign_slug = '$1-2027';"; }

# S1: a double click — the same request twice at once, as service_role.
F=$(fp svca)
( $P -c "SET ROLE service_role" -c "BEGIN;" -c "$(go svca "$F" k-svca)" -c "SELECT pg_sleep(3);" -c "COMMIT;" > s1a.out 2>&1 ) &
sleep 1
waited=$(timed "$(go svca "$F" k-svca)" s1b.out)
wait
ida=$(grep -o '"transition_id": "[^"]*"' s1a.out); idb=$(grep -o '"transition_id": "[^"]*"' s1b.out)
ok=0; [ "$waited" -ge 1500 ] && grep -q '"replayed": false' s1a.out && grep -q '"replayed": true' s1b.out && [ -n "$ida" ] && [ "$ida" = "$idb" ] \
  && [ "$(successors svca)" = 1 ] && [ "$(audits svca)" = 1 ] && ok=1
check "S1 service_role double submit: second waited ${waited}ms and received the first's result as a replay; one successor, one audit row" "$ok" "a=$(cat s1a.out) b=$(cat s1b.out)"

# S2: two different requests at once (e.g. two browser tabs), as service_role.
F=$(fp svcb)
( $P -c "SET ROLE service_role" -c "BEGIN;" -c "$(go svcb "$F" k-svcb-1)" -c "SELECT pg_sleep(3);" -c "COMMIT;" > s2a.out 2>&1 ) &
sleep 1
waited=$(timed "$(go svcb "$F" k-svcb-2)" s2b.out)
wait
ok=0; [ "$waited" -ge 1500 ] && grep -q '"replayed": false' s2a.out && grep -qE 'season_already_completed|season_preview_stale' s2b.out \
  && [ "$(successors svcb)" = 1 ] && [ "$(audits svcb)" = 1 ] && ok=1
check "S2 service_role concurrent completions: second waited ${waited}ms, then was refused; never two successors" "$ok" "a=$(cat s2a.out) b=$(cat s2b.out)"

echo "CONCURRENCY: $pass passed, $fail failed"
[ $fail = 0 ]
