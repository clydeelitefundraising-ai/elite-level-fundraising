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

# ── Relationship changes racing a submission ──────────────────────────
# The final state must always match the committed relationships: an
# acknowledgment counts only if its identity still holds the link.
B3=00000000-0000-0000-0000-0000000000b3
D1=00000000-0000-0000-0000-0000000000d1; D2=00000000-0000-0000-0000-0000000000d2; D3=00000000-0000-0000-0000-0000000000d3
E1=00000000-0000-0000-0000-0000000000e1
SQ "INSERT INTO public.elf_accounts (id, email, name) VALUES ('$E1', 'tmp@x', 'Tia Temp');
    INSERT INTO public.team_members (id, campaign_slug, role, name, athlete_id, account_id) VALUES
      ('$D1', 'team-a', 'parent', 'Dan One',   '$B3', NULL),
      ('$D2', 'team-a', 'parent', 'Dot Two',   '$B3', NULL),
      ('$D3', 'team-a', 'parent', 'Tia Temp',  '$B3', '$E1');" >/dev/null
status_b() { SQ "SELECT satisfied FROM public.team_task_ack_status('team-a', ARRAY['$1'::uuid], ARRAY[qa.id('$2')]) WHERE requirement = 'parent';"; }
timed() { local s=$(date +%s%N); SQ "$1" > "$2"; echo $(( ($(date +%s%N) - s) / 1000000 )); }

# C6: acknowledgment in flight; the parent is unlinked meanwhile -> the
# unlink waits, the row is kept, and it does not count.
mk C6 parent
( $P -c "BEGIN;" -c "$(ack C6 1 "'$B2'" $CASEY "'$CASEY_A'" 'Casey Coach')" -c "SELECT pg_sleep(3);" -c "COMMIT;" > c6a.out 2>&1 ) &
sleep 1
waited=$(timed "DELETE FROM public.team_member_athletes WHERE team_member_id = '$CASEY' AND athlete_id = '$B2';" c6b.out)
wait
rows=$(SQ "SELECT count(*) FROM public.team_task_acknowledgments WHERE task_id = qa.id('C6');"); sat=$(status_b $B2 C6)
ok=0; [ "$waited" -ge 1500 ] && grep -q recorded c6a.out && [ "$rows" = 1 ] && [ "$sat" = f ] && ok=1
check "C6 unlink during an in-flight acknowledgment: unlink waited ${waited}ms; row kept; not counted" "$ok" "a=$(cat c6a.out) b=$(cat c6b.out) rows=$rows sat=$sat"

# C7: unlink in flight; the parent submits meanwhile -> the submission
# waits, then is refused as not linked; nothing written.
mk C7 parent
( $P -c "BEGIN;" -c "DELETE FROM public.team_member_athletes WHERE team_member_id = '$SAM' AND athlete_id = '$B2';" -c "SELECT pg_sleep(3);" -c "COMMIT;" > c7a.out 2>&1 ) &
sleep 1
waited=$(timed "$(ack C7 1 "'$B2'" $SAM NULL 'Sam Smith')" c7b.out)
wait
rows=$(SQ "SELECT count(*) FROM public.team_task_acknowledgments WHERE task_id = qa.id('C7');")
ok=0; [ "$waited" -ge 1500 ] && grep -q team_task_ack_athlete_not_linked c7b.out && [ "$rows" = 0 ] && ok=1
check "C7 submission during an in-flight unlink: waited ${waited}ms, refused as not linked, nothing written" "$ok" "b=$(cat c7b.out) rows=$rows"

# C8: member deletion in flight; that member submits meanwhile -> waits,
# then member_not_found; nothing written.
mk C8 parent
( $P -c "BEGIN;" -c "DELETE FROM public.team_members WHERE id = '$D1';" -c "SELECT pg_sleep(3);" -c "COMMIT;" > c8a.out 2>&1 ) &
sleep 1
waited=$(timed "$(ack C8 1 "'$B3'" $D1 NULL 'Dan One')" c8b.out)
wait
rows=$(SQ "SELECT count(*) FROM public.team_task_acknowledgments WHERE task_id = qa.id('C8');")
ok=0; [ "$waited" -ge 1500 ] && grep -q team_task_ack_member_not_found c8b.out && [ "$rows" = 0 ] && ok=1
check "C8 submission during an in-flight member deletion: waited ${waited}ms, refused (member_not_found), nothing written" "$ok" "b=$(cat c8b.out) rows=$rows"

# C9: acknowledgment in flight; the member is deleted meanwhile -> the
# deletion waits; the row is kept with member_id cleared; not counted.
mk C9 parent
( $P -c "BEGIN;" -c "$(ack C9 1 "'$B3'" $D2 NULL 'Dot Two')" -c "SELECT pg_sleep(3);" -c "COMMIT;" > c9a.out 2>&1 ) &
sleep 1
waited=$(timed "DELETE FROM public.team_members WHERE id = '$D2';" c9b.out)
wait
row=$(SQ "SELECT (member_id IS NULL) || ',' || full_name FROM public.team_task_acknowledgments WHERE task_id = qa.id('C9');"); sat=$(status_b $B3 C9)
ok=0; [ "$waited" -ge 1500 ] && grep -q recorded c9a.out && [ "$row" = "true,Dot Two" ] && [ "$sat" = f ] && ok=1
check "C9 member deletion during an in-flight acknowledgment: deletion waited ${waited}ms; row kept (member_id cleared); not counted" "$ok" "a=$(cat c9a.out) b=$(cat c9b.out) row=$row sat=$sat"

# C10: acknowledgment in flight; the acknowledging account is deleted
# meanwhile -> the account deletion waits (it must clear account_id on the
# locked member row); the row keeps its account snapshot; not counted.
mk C10 parent
( $P -c "BEGIN;" -c "$(ack C10 1 "'$B3'" $D3 "'$E1'" 'Tia Temp')" -c "SELECT pg_sleep(3);" -c "COMMIT;" > c10a.out 2>&1 ) &
sleep 1
waited=$(timed "DELETE FROM public.elf_accounts WHERE id = '$E1';" c10b.out)
wait
row=$(SQ "SELECT k.account_id || ',' || (m.account_id IS NULL) FROM public.team_task_acknowledgments k JOIN public.team_members m ON m.id = k.member_id WHERE k.task_id = qa.id('C10');"); sat=$(status_b $B3 C10)
ok=0; [ "$waited" -ge 1500 ] && grep -q recorded c10a.out && [ "$row" = "$E1,true" ] && [ "$sat" = f ] && ok=1
check "C10 account deletion during an in-flight acknowledgment: deletion waited ${waited}ms; snapshot kept; not counted" "$ok" "a=$(cat c10a.out) b=$(cat c10b.out) row=$row sat=$sat"

echo "CONCURRENCY: $pass passed, $fail failed"
