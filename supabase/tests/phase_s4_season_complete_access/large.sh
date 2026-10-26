#!/usr/bin/env bash
# Complete Season Phase 5B — large-team completion checks. DISPOSABLE LOCAL
# PostgreSQL ONLY (run via run.sh, after tests.sql and concurrency.sh).
#
# Three realistically large synthetic teams (400 athletes, 1,000 account-
# linked members with parent links, 30 coaches, 200 future events, 5,000
# donations, push subscriptions, safety blocks, calendar feed links), each
# completed through the app server's only entry point
# (team_season_complete_checked, as service_role):
#   L1  timed completion: everything carried over / left in history correctly
#   L2  a statement timeout aborts mid-transition: nothing is written; the
#       retry with the SAME confirmation id then completes normally
#   L3  lost response (the client disconnects while the database works):
#       the retry with the same id returns the one committed receipt
#   L4  replay after the Head Coach lost the successor season: refused
#   L5  concurrent double submit (same id) and a second tab (new id) on a
#       large team: one successor, one audit row, no join code anywhere
cd "${WORK:?run via run.sh}"
P="psql -h localhost -p ${PORT:?} -U supabase_admin -d elf -X -q -t -A -v ON_ERROR_STOP=0"
SQ() { $P -c "$1" 2>&1; }
pass=0; fail=0
check() { if [ "$2" = "1" ]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1 :: $3"; fi; }
ms() { echo $(( ($(date +%s%N) - $1) / 1000000 )); }

ATHLETES=400; PARENTS=550; BOOSTERS=50; EVENTS=200; DONATIONS=5000
# Members: 400 athlete members + 550 parents + 50 boosters = 1,000.
SQ "CREATE OR REPLACE FUNCTION qa.make_large_team(p text) RETURNS void LANGUAGE sql AS \$\$
  INSERT INTO public.elf_accounts (id, email, password_hash, salt, name)
    SELECT qa.u(p || '-acct-' || i), p || '-' || i || '@example.test', 'x', 'x', 'Person ' || i FROM generate_series(1, 1030) i;
  INSERT INTO public.campaign_settings (campaign_slug, school_name, sport_name, season, fundraising_enabled)
    VALUES (p || '-2027', p || ' HS', 'Track', '2027 Season', true);
  INSERT INTO public.team_coaches (id, campaign_slug, name, email, role, password_hash, salt, account_id)
    SELECT qa.u(p || '-coach-' || i), p || '-2027', 'Coach ' || i, p || '-coach' || i || '@example.test',
           CASE WHEN i = 1 THEN 'head_coach' WHEN i <= 20 THEN 'assistant_coach' ELSE 'booster' END,
           'unused', 'x', qa.u(p || '-acct-' || (1000 + i)) FROM generate_series(1, 30) i;
  INSERT INTO public.athletes (id, campaign_slug, name, class_year, jersey_number)
    SELECT qa.u(p || '-ath-' || i), p || '-2027', 'Athlete ' || i,
           (ARRAY['Freshman','Sophomore','Junior','Senior'])[1 + i % 4], i FROM generate_series(1, $ATHLETES) i;
  INSERT INTO public.team_members (id, campaign_slug, role, name, athlete_id, salt, account_id)
    SELECT qa.u(p || '-mem-' || i), p || '-2027',
           CASE WHEN i <= $ATHLETES THEN 'athlete' WHEN i <= $ATHLETES + $PARENTS THEN 'parent' ELSE 'booster' END,
           'Member ' || i, CASE WHEN i <= $ATHLETES THEN qa.u(p || '-ath-' || i) END, 's', qa.u(p || '-acct-' || i)
    FROM generate_series(1, $ATHLETES + $PARENTS + $BOOSTERS) i;
  INSERT INTO public.team_member_athletes (team_member_id, athlete_id)
    SELECT qa.u(p || '-mem-' || i), qa.u(p || '-ath-' || (1 + (i * 7 + k) % $ATHLETES))
    FROM generate_series($ATHLETES + 1, $ATHLETES + $PARENTS) i, generate_series(0, 1) k;
  INSERT INTO public.calendar_events (id, campaign_slug, title, event_date, event_time, location, type)
    SELECT qa.u(p || '-ev-' || i), p || '-2027', 'Event ' || i, public.team_attendance_today(p || '-2027') + (i - 20), '', '', 'team'
    FROM generate_series(1, $EVENTS + 19) i;
  INSERT INTO public.donations (id, donor_name, amount, amount_cents, campaign_slug, athlete_id, stripe_session_id, created_at)
    SELECT qa.u(p || '-don-' || i), 'Donor ' || i, 25, 2500, p || '-2027', qa.u(p || '-ath-' || (1 + i % $ATHLETES)),
           'cs_test_' || p || '_' || i, now() - interval '3 days' - (i || ' minutes')::interval FROM generate_series(1, $DONATIONS) i;
  INSERT INTO public.push_subscriptions (id, campaign_slug, platform, endpoint, member_id)
    SELECT qa.u(p || '-push-' || i), p || '-2027', 'web', 'https://push.example.test/' || p || '/' || i, qa.u(p || '-mem-' || i)
    FROM generate_series(1, 300) i;
  INSERT INTO public.user_blocks (campaign_slug, blocker_kind, blocker_id, blocked_kind, blocked_id)
    SELECT p || '-2027', 'member', qa.u(p || '-mem-' || (500 + i)), 'member', qa.u(p || '-mem-' || (600 + i)) FROM generate_series(1, 100) i;
  INSERT INTO public.team_join_codes (campaign_slug, code) VALUES (p || '-2027', upper(substr(md5(p), 1, 6)));
  INSERT INTO public.calendar_subscription_tokens (id, campaign_slug) VALUES (qa.u(p || '-ct'), p || '-2027');
\$\$;" >/dev/null
for t in biga bigb bigc; do
  s=$(date +%s%N); out=$(SQ "SELECT qa.make_large_team('$t');")
  [ -n "$out" ] && { echo "FAIL  building $t: $out"; exit 1; }
done
echo "large teams: 3 × ($ATHLETES athletes, $((ATHLETES + PARENTS + BOOSTERS)) members, 30 coaches, $EVENTS future events, $DONATIONS donations)"

fp() { SQ "SELECT public.team_season_fingerprint('$1-2027');" | tr -d '[:space:]'; }
call() { echo "SELECT public.team_season_complete_checked('$1-2027', jsonb_build_object('coach_id', qa.u('$1-coach-1')), NULL, NULL, '$2', qa.u('$3'), 'COMPLETE 2027 SEASON');"; }
svc() { $P -c "SET ROLE service_role" "$@" 2>&1; }
successors() { SQ "SELECT count(*) FROM public.campaign_settings WHERE predecessor_campaign_slug = '$1-2027';"; }
audits() { SQ "SELECT count(*) FROM public.team_season_transitions WHERE from_campaign_slug = '$1-2027';"; }
completed() { SQ "SELECT season_completed_at IS NOT NULL FROM public.campaign_settings WHERE campaign_slug = '$1-2027';"; }
tid() { grep -o '"transition_id": "[^"]*"' "$1" | head -1; }
nothing_written() {   # team untouched: not completed, no successor, no audit, no successor-season rows
  [ "$(completed "$1")" = f ] && [ "$(successors "$1")" = 0 ] && [ "$(audits "$1")" = 0 ] \
    && [ "$(SQ "SELECT count(*) FROM public.athletes WHERE campaign_slug = '$1-2028';")" = 0 ] \
    && [ "$(SQ "SELECT count(*) FROM public.team_members WHERE campaign_slug = '$1-2028';")" = 0 ] \
    && [ "$(SQ "SELECT archived FROM public.campaign_settings WHERE campaign_slug = '$1-2027';")" = f ]
}

# ── L2 (biga): timeout mid-transition, then retry with the same id ──────
F=$(fp biga)
# Aborted early (reading), midway and late (writing): each must leave nothing.
for t in 40 250 500; do
  svc -c "SET statement_timeout = '${t}ms'" -c "$(call biga "$F" k-biga)" > l2a.out
  ok=0; grep -q "statement timeout" l2a.out && nothing_written biga && ok=1
  check "L2 a statement timeout ${t}ms into the transition writes nothing (team untouched, no successor, no audit, no copied rows)" "$ok" "$(cat l2a.out)"
done

# ── L1 (biga): the retry IS the timed completion ────────────────────────
s=$(date +%s%N); svc -c "$(call biga "$F" k-biga)" > l1.out; took=$(ms $s)
ok=0; grep -q '"replayed": false' l1.out && [ "$(successors biga)" = 1 ] && [ "$(audits biga)" = 1 ] && ok=1
check "L2 retry with the same confirmation id after the timeout completes normally (${took}ms for the large team)" "$ok" "$(cat l1.out)"
counts=$(SQ "SELECT (SELECT count(*) FROM public.athletes WHERE campaign_slug = 'biga-2028') || ',' ||
  (SELECT count(*) FROM public.athletes WHERE campaign_slug = 'biga-2027') || ',' ||
  (SELECT count(*) FROM public.team_coaches WHERE campaign_slug = 'biga-2028' AND account_id IS NOT NULL) || ',' ||
  (SELECT count(*) FROM public.calendar_events WHERE campaign_slug = 'biga-2028') || ',' ||
  (SELECT count(*) FROM public.donations WHERE campaign_slug = 'biga-2027') || ',' ||
  (SELECT count(*) FROM public.donations WHERE campaign_slug = 'biga-2028') || ',' ||
  (SELECT archived::text FROM public.campaign_settings WHERE campaign_slug = 'biga-2027') || ',' ||
  (SELECT count(*) FROM public.team_join_codes WHERE campaign_slug = 'biga-2028');")
want="$((ATHLETES * 3 / 4)),$ATHLETES,30,$EVENTS,$DONATIONS,0,true,1"
ok=0; [ "$counts" = "$want" ] && ok=1
check "L1 large completion result: 300 returning athletes carried, 400 kept in history, 30 coaches, $EVENTS future events, $DONATIONS donations stay in history, old season archived, one new join code" "$ok" "got $counts want $want"
members=$(SQ "SELECT count(*) FROM public.team_members WHERE campaign_slug = 'biga-2028';")
ok=0; [ "$members" -ge 800 ] && [ "$members" -le 1000 ] && ! grep -qi 'join_code' l1.out && ok=1
check "L1 $members members carried (graduated athletes' accounts excluded); no join code in the result" "$ok" "members=$members $(cat l1.out | head -c 300)"

svc -c "$(call biga "$F" k-biga)" > l1r.out
ok=0; grep -q '"replayed": true' l1r.out && [ "$(tid l1r.out)" = "$(tid l1.out)" ] && ! grep -qi 'join_code' l1r.out && ok=1
check "L1 replay of the large completion returns the same receipt without a join code" "$ok" "$(cat l1r.out | head -c 300)"

# ── L4 (biga): replay after the Head Coach lost the successor season ────
SQ "UPDATE public.team_coaches SET role = 'assistant_coach' WHERE campaign_slug = 'biga-2028' AND account_id = qa.u('biga-acct-1001');" >/dev/null
svc -c "$(call biga "$F" k-biga)" > l4.out
ok=0; grep -q season_actor_not_authorized l4.out && ! grep -q transition_id l4.out && ok=1
check "L4 a Head Coach demoted in the new season can't replay the receipt with the old confirmation id" "$ok" "$(cat l4.out)"
SQ "UPDATE public.team_coaches SET role = 'head_coach' WHERE campaign_slug = 'biga-2028' AND account_id = qa.u('biga-acct-1001');" >/dev/null

# ── L3 (bigb): lost response — the client disconnects mid-transition ───
F=$(fp bigb)
svc -c "SELECT pg_sleep(0.3);" -c "$(call bigb "$F" k-bigb)" > l3a.out &
cpid=$!
sleep 0.5; kill -9 $cpid 2>/dev/null; wait $cpid 2>/dev/null
for i in $(seq 1 100); do   # wait until the orphaned backend has finished (committed or rolled back)
  [ "$(SQ "SELECT count(*) FROM pg_stat_activity WHERE query LIKE '%team_season_complete_checked(''bigb-2027''%' AND pid <> pg_backend_pid();")" = 0 ] && break
  sleep 0.1
done
before=$(audits bigb)
svc -c "$(call bigb "$F" k-bigb)" > l3b.out
audit_id=$(SQ "SELECT id FROM public.team_season_transitions WHERE from_campaign_slug = 'bigb-2027';")
ok=0; [ "$(successors bigb)" = 1 ] && [ "$(audits bigb)" = 1 ] && [ "$(tid l3b.out)" = "\"transition_id\": \"$audit_id\"" ] && ok=1
check "L3 lost response: after the client vanished (server had $before committed), the retry with the same id returned the one committed receipt ($(grep -o '"replayed": [a-z]*' l3b.out))" "$ok" "$(cat l3b.out | head -c 300) audit=$audit_id"

# ── L5 (bigc): concurrent double submit + a second tab ──────────────────
F=$(fp bigc)
svc -c "$(call bigc "$F" k-bigc)" > l5a.out & a=$!
svc -c "$(call bigc "$F" k-bigc)" > l5b.out & b=$!
svc -c "$(call bigc "$F" k-bigc-tab2)" > l5c.out & c=$!
wait $a $b $c
same=0; [ -n "$(tid l5a.out)" ] && [ "$(tid l5a.out)" = "$(tid l5b.out)" ] && same=1
fresh=$(cat l5a.out l5b.out | grep -c '"replayed": false')
ok=0; [ $same = 1 ] && [ "$fresh" = 1 ] && grep -qE 'season_already_completed|season_preview_stale|could not obtain lock|lock timeout' l5c.out \
  && [ "$(successors bigc)" = 1 ] && [ "$(audits bigc)" = 1 ] && ! cat l5a.out l5b.out l5c.out | grep -qi join_code && ok=1
check "L5 large team, three simultaneous requests: the double submit got one receipt (once fresh, once replayed), the second tab was refused; one successor, one audit row" "$ok" "a=$(head -c 200 l5a.out) b=$(head -c 200 l5b.out) c=$(head -c 200 l5c.out)"

# Unrelated large teams untouched by each other's completions.
ok=0; [ "$(SQ "SELECT count(*) FROM public.athletes WHERE campaign_slug IN ('biga-2027','bigb-2027','bigc-2027');")" = $((ATHLETES * 3)) ] \
  && [ "$(SQ "SELECT count(*) FROM public.donations WHERE campaign_slug IN ('biga-2027','bigb-2027','bigc-2027');")" = $((DONATIONS * 3)) ] && ok=1
check "history intact: every large team's athletes and donations still in its archived season" "$ok" ""

echo "LARGE: $pass passed, $fail failed"
[ $fail = 0 ]
