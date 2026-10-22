#!/usr/bin/env bash
# Complete Season Phase 2 concurrency checks: writes racing a completion,
# with real parallel sessions (run via run.sh, after tests.sql).
cd "${WORK:?run via run.sh}"
P="psql -h localhost -p ${PORT:?} -U supabase_admin -d elf -X -q -t -A -v ON_ERROR_STOP=0"
SQ() { $P -c "$1" 2>&1; }
pass=0; fail=0
check() { if [ "$2" = "1" ]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1 :: $3"; fi; }
timed() { local s=$(date +%s%N); SQ "$1" > "$2"; echo $(( ($(date +%s%N) - s) / 1000000 )); }

# Teams with an account-linked Head Coach, athletes, and a thread.
for t in racea raceb racec raced; do
  SQ "INSERT INTO public.elf_accounts (id, email, password_hash, salt, name) VALUES (qa.u('$t-acct'), '$t@example.test', 'x', 'x', '$t');
      INSERT INTO public.campaign_settings (campaign_slug, school_name, sport_name, season) VALUES ('$t-2027', '$t', 'Track', '2027 Season');
      INSERT INTO public.team_coaches (id, campaign_slug, name, email, role, password_hash, salt, account_id)
        VALUES (qa.u('$t-coach'), '$t-2027', '$t', '$t@example.test', 'head_coach', 'unused', 'x', qa.u('$t-acct'));
      INSERT INTO public.athletes (campaign_slug, name, class_year) VALUES ('$t-2027', 'A', 'Freshman'), ('$t-2027', 'B', 'Junior');
      INSERT INTO public.message_threads (id, campaign_slug, created_by_type, created_by_coach_id, creator_name, creator_role)
        VALUES (qa.u('$t-th'), '$t-2027', 'coach', qa.u('$t-coach'), '$t', 'head_coach');" >/dev/null
done
go() { echo "SELECT public.team_season_complete('$1-2027', jsonb_build_object('coach_id', qa.u('$1-coach')), NULL, NULL, public.team_season_fingerprint('$1-2027'), qa.u('k-$1'), 'COMPLETE 2027 SEASON');"; }
hold() { ( $P -c "BEGIN;" -c "$(go "$1")" -c "SELECT pg_sleep(3);" -c "COMMIT;" > "$2" 2>&1 ) & }

# R1: a roster insert while a completion is running waits for it, then is
# refused — it never lands on the completed season (Phase 1's C4 gap).
hold racea r1a.out; sleep 1
waited=$(timed "INSERT INTO public.athletes (campaign_slug, name, class_year) VALUES ('racea-2027', 'Late', 'Junior');" r1b.out)
wait
late=$(SQ "SELECT count(*) FROM public.athletes WHERE campaign_slug = 'racea-2027' AND name = 'Late';")
ok=0; [ "$waited" -ge 1500 ] && grep -q '"replayed": false' r1a.out && grep -q season_completed_read_only r1b.out && [ "$late" = 0 ] && ok=1
check "R1 roster insert during a completion: waited ${waited}ms, then refused; nothing landed on the completed season" "$ok" "a=$(cat r1a.out) b=$(cat r1b.out) late=$late"

# R2: a message sent into the team's thread during a completion waits, then
# is refused.
hold raceb r2a.out; sleep 1
waited=$(timed "INSERT INTO public.messages (thread_id, sender_type, sender_coach_id, body, sender_name, sender_role) VALUES (qa.u('raceb-th'), 'coach', qa.u('raceb-coach'), 'late', 'x', 'head_coach');" r2b.out)
wait
n=$(SQ "SELECT count(*) FROM public.messages WHERE thread_id = qa.u('raceb-th');")
ok=0; [ "$waited" -ge 1500 ] && grep -q season_completed_read_only r2b.out && [ "$n" = 0 ] && ok=1
check "R2 message send during a completion: waited ${waited}ms, then refused" "$ok" "b=$(cat r2b.out) messages=$n"

# R3: writes to a DIFFERENT team are not slowed by someone else's completion.
hold racec r3a.out; sleep 1
waited=$(timed "INSERT INTO public.athletes (campaign_slug, name, class_year) VALUES ('raced-2027', 'Unrelated', 'Junior');" r3b.out)
wait
ok=0; [ "$waited" -lt 1000 ] && ! grep -qi error r3b.out && ok=1
check "R3 another team's write during a completion did not wait (${waited}ms) and succeeded" "$ok" "b=$(cat r3b.out)"

# R4: a write already in progress (uncommitted) when the completion starts:
# the completion waits for it (the write holds the team row's key-share
# lock), then sees the new roster and refuses as stale — never a partial copy.
( $P -c "BEGIN;" -c "INSERT INTO public.athletes (campaign_slug, name, class_year) VALUES ('raced-2027', 'In flight', 'Junior');" -c "SELECT pg_sleep(3);" -c "COMMIT;" > r4a.out 2>&1 ) &
sleep 1
waited=$(timed "$(go raced)" r4b.out)
wait
ok=0; [ "$waited" -ge 1500 ] && grep -qE 'season_preview_stale|season_roster_changed_during_transition' r4b.out \
  && [ "$(SQ "SELECT count(*) FROM public.campaign_settings WHERE campaign_slug = 'raced-2028';")" = 0 ] && ok=1
check "R4 completion waited ${waited}ms for an in-flight roster write, then refused (stale); nothing created" "$ok" "b=$(cat r4b.out)"

echo "CONCURRENCY: $pass passed, $fail failed"
[ $fail = 0 ]
