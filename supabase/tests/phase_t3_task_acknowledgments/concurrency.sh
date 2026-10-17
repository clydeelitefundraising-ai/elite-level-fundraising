#!/usr/bin/env bash
# Phase 3A concurrency checks: real parallel sessions against the local DB.
cd "${WORK:?run via run.sh}"
P="psql -h localhost -p 55433 -U postgres -d elf3 -X -q -t -A -v ON_ERROR_STOP=0"
SQ() { $P -c "$1" 2>&1; }
pass=0; fail=0
check() { if [ "$2" = "1" ]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1 :: $3"; fi; }
B1=00000000-0000-0000-0000-0000000000b1; B2=00000000-0000-0000-0000-0000000000b2
PAT=00000000-0000-0000-0000-0000000000c2; PAT_A=00000000-0000-0000-0000-0000000000a2
SAM=00000000-0000-0000-0000-0000000000c3; CASEY=00000000-0000-0000-0000-0000000000c6; CASEY_A=00000000-0000-0000-0000-0000000000a4

mk() {
  SQ "SET ROLE service_role; INSERT INTO qa.ids SELECT '$1', (public.team_task_create('team-a', jsonb_build_object('title', '$1', 'audience', '$2'), '[]', '{\"name\":\"Coach\"}')).id;" >/dev/null
}
# ack TASK REV ATHLETES_SQL MEMBER ACCOUNT_SQL NAME
ack() {
  echo "SET ROLE service_role; SELECT outcome FROM qa.ack('$1', 'team-a', $2, 'parent', ARRAY[$3]::uuid[], '$4', $5, '$6');"
}

# C1: two different linked parents of the same child at the same moment.
mk C1 parent
( $P -c "BEGIN;" -c "$(ack C1 1 "'$B1'" $PAT "'$PAT_A'" 'Pat Smith')" -c "SELECT pg_sleep(3);" -c "COMMIT;" > c1a.out 2>&1 ) &
sleep 1
$P -c "$(ack C1 1 "'$B1'" $SAM NULL 'Sam Smith')" > c1b.out 2>&1
wait
rows=$(SQ "SELECT count(*) FROM public.team_task_acknowledgments WHERE task_id = qa.id('C1');")
ok=0; [ "$(grep -c recorded c1a.out)" = 1 ] && grep -q already_satisfied c1b.out && [ "$rows" = 1 ] && ok=1
check "C1 two parents of one child at once: exactly one recorded, the other already_satisfied" "$ok" "a=$(cat c1a.out) b=$(cat c1b.out) rows=$rows"

# C2: the same person double-submitting concurrently.
mk C2 parent
( $P -c "BEGIN;" -c "$(ack C2 1 "'$B1'" $PAT "'$PAT_A'" 'Pat Smith')" -c "SELECT pg_sleep(2);" -c "COMMIT;" > c2a.out 2>&1 ) &
sleep 1
$P -c "$(ack C2 1 "'$B1'" $PAT "'$PAT_A'" 'Pat Smith')" > c2b.out 2>&1
wait
rows=$(SQ "SELECT count(*) FROM public.team_task_acknowledgments WHERE task_id = qa.id('C2');")
ok=0; grep -q recorded c2a.out && grep -q already_satisfied c2b.out && [ "$rows" = 1 ] && ok=1
check "C2 same person double submit: one row, second call already_satisfied (no error)" "$ok" "a=$(cat c2a.out) b=$(cat c2b.out) rows=$rows"

# C3: acknowledgment in flight; a substantive edit arrives -> the edit
# waits, the acknowledgment keeps the reviewed revision, then stops counting.
mk C3 parent
( $P -c "BEGIN;" -c "$(ack C3 1 "'$B1'" $PAT "'$PAT_A'" 'Pat Smith')" -c "SELECT pg_sleep(3);" -c "COMMIT;" > c3a.out 2>&1 ) &
sleep 1
start=$(date +%s%N)
SQ "SET ROLE service_role; UPDATE public.team_tasks SET title = 'C3 edited' WHERE id = qa.id('C3');" > c3b.out
waited=$(( ($(date +%s%N) - start) / 1000000 ))
wait
st=$(SQ "SELECT k.task_revision || ',' || t.revision || ',' || s.satisfied FROM public.team_task_acknowledgments k JOIN public.team_tasks t ON t.id = k.task_id JOIN public.team_task_ack_status('team-a', ARRAY['$B1'::uuid], ARRAY[qa.id('C3')]) s ON s.requirement = 'parent' WHERE k.task_id = qa.id('C3');")
ok=0; [ "$waited" -ge 1500 ] && grep -q recorded c3a.out && [ "$st" = "1,2,false" ] && ok=1
check "C3 edit waited ${waited}ms for the in-flight acknowledgment; ack keeps revision 1, task is now 2, not satisfied" "$ok" "a=$(cat c3a.out) b=$(cat c3b.out) st=$st"

# C4: an edit in flight; an acknowledgment of the old revision arrives ->
# it waits, then is refused with revision_changed and writes nothing.
mk C4 parent
( $P -c "BEGIN;" -c "SET ROLE service_role;" -c "UPDATE public.team_tasks SET title = 'C4 edited' WHERE id = qa.id('C4');" -c "SELECT pg_sleep(3);" -c "COMMIT;" > c4a.out 2>&1 ) &
sleep 1
$P -c "$(ack C4 1 "'$B1'" $PAT "'$PAT_A'" 'Pat Smith')" > c4b.out 2>&1
wait
rows=$(SQ "SELECT count(*) FROM public.team_task_acknowledgments WHERE task_id = qa.id('C4');")
ok=0; grep -q team_task_ack_revision_changed c4b.out && [ "$rows" = 0 ] && ok=1
check "C4 acknowledgment of a revision being edited: waits, refused with revision_changed, nothing written" "$ok" "a=$(cat c4a.out) b=$(cat c4b.out) rows=$rows"

# C5: two parents of the same two children, children listed in opposite
# orders, at the same moment -> no deadlock; each child recorded once.
SQ "INSERT INTO public.team_member_athletes (team_member_id, athlete_id) VALUES ('$SAM', '$B2'), ('$CASEY', '$B1');" >/dev/null
mk C5 parent
( $P -c "BEGIN;" -c "$(ack C5 1 "'$B2','$B1'" $SAM NULL 'Sam Smith')" -c "SELECT pg_sleep(2);" -c "COMMIT;" > c5a.out 2>&1 ) &
sleep 1
$P -c "$(ack C5 1 "'$B1','$B2'" $CASEY "'$CASEY_A'" 'Casey Coach')" > c5b.out 2>&1
wait
rows=$(SQ "SELECT count(*) || ',' || count(DISTINCT athlete_id) FROM public.team_task_acknowledgments WHERE task_id = qa.id('C5');")
ok=0; ! grep -qi deadlock c5a.out c5b.out && [ "$(grep -c recorded c5a.out)" = 2 ] && [ "$(grep -c already_satisfied c5b.out)" = 2 ] && [ "$rows" = "2,2" ] && ok=1
check "C5 two parents, opposite child order, at once: no deadlock, each child recorded exactly once" "$ok" "a=$(cat c5a.out) b=$(cat c5b.out) rows=$rows"

echo "CONCURRENCY: $pass passed, $fail failed"
