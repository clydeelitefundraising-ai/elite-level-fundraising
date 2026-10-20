#!/usr/bin/env bash
# Phase 5 concurrency checks: real parallel sessions against the local DB
# (team-b; dates relative to the team's Phoenix "today").
cd "${WORK:?run via run.sh}"
P="psql -h localhost -p ${PORT:?} -U postgres -d elf5 -X -q -t -A -v ON_ERROR_STOP=0"
SQ() { $P -c "$1" 2>&1; }
pass=0; fail=0
check() { if [ "$2" = "1" ]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1 :: $3"; fi; }
timed() { local s=$(date +%s%N); SQ "$1" > "$2"; echo $(( ($(date +%s%N) - s) / 1000000 )); }
U() { echo "00000000-0000-0000-0000-0000000000$1"; }
COACH="jsonb_build_object('coach_id', '$(U c4)'::uuid)"
# save DATE_OFFSET VERSION_SQL RECORDS_SQL
save() { echo "SET ROLE service_role; SELECT public.team_attendance_save_draft('team-b', public.team_attendance_today('team-b') + ($1), $2, $3, $COACH);"; }
present() { local out="" c; for c in "$@"; do out="$out${out:+ || }jsonb_build_array(jsonb_build_object('athlete_id', '$(U $c)'::uuid, 'status', 'present'))"; done; echo "$out"; }
sessions() { SQ "SELECT count(*) FROM public.team_attendance_sessions WHERE campaign_slug = 'team-b' AND session_date = public.team_attendance_today('team-b') + ($1);"; }

SQ "INSERT INTO public.athletes (id, campaign_slug, name, class_year, created_at) VALUES
      ('$(U ab)', 'team-b', 'Bo Banks', 'Senior', '2026-01-01T12:00:00Z'),
      ('$(U ac)', 'team-b', 'Cleo Cruz', 'Junior', '2026-01-01T12:00:00Z');" >/dev/null

# C1: two coaches create the same date's session at the same moment ->
# the second waits for the first, then is told it's a conflict. One session.
( $P -c "BEGIN;" -c "$(save -7 0 "$(present b9 ab ac)")" -c "SELECT pg_sleep(3);" -c "COMMIT;" > c1a.out 2>&1 ) &
sleep 1
waited=$(timed "$(save -7 0 "$(present b9 ab ac)")" c1b.out)
wait
n=$(sessions -7)
ok=0; [ "$waited" -ge 1500 ] && grep -q '"version": 1' c1a.out && grep -q attendance_version_conflict c1b.out && [ "$n" = 1 ] && ok=1
check "C1 concurrent first saves: second waited ${waited}ms, got a conflict; exactly one session" "$ok" "a=$(cat c1a.out) b=$(cat c1b.out) sessions=$n"

# C2: two coaches save the same version at once -> the second waits, then
# conflict; the first one's changes are what's stored (no silent overwrite).
ABSENT="jsonb_build_array(jsonb_build_object('athlete_id', '$(U b9)'::uuid, 'status', 'absent', 'absence_reason', 'excused')) || $(present ab ac)"
( $P -c "BEGIN;" -c "$(save -7 1 "$ABSENT")" -c "SELECT pg_sleep(3);" -c "COMMIT;" > c2a.out 2>&1 ) &
sleep 1
waited=$(timed "$(save -7 1 "$(present b9 ab ac)")" c2b.out)
wait
st=$(SQ "SELECT s.version || ',' || r.status FROM public.team_attendance_sessions s JOIN public.team_attendance_records r ON r.session_id = s.id
         WHERE s.campaign_slug = 'team-b' AND s.session_date = public.team_attendance_today('team-b') - 7 AND r.athlete_id = '$(U b9)';")
ok=0; [ "$waited" -ge 1500 ] && grep -q '"version": 2' c2a.out && grep -q attendance_version_conflict c2b.out && [ "$st" = "2,absent" ] && ok=1
check "C2 concurrent saves of one version: second waited ${waited}ms, got a conflict; first save kept (v2, absent)" "$ok" "a=$(cat c2a.out) b=$(cat c2b.out) st=$st"

# C3: an athlete is being deleted while a save runs -> the save waits for
# the delete, then fails closed; nothing is written for that date.
( $P -c "BEGIN;" -c "DELETE FROM public.athletes WHERE id = '$(U ac)';" -c "SELECT pg_sleep(3);" -c "COMMIT;" > c3a.out 2>&1 ) &
sleep 1
waited=$(timed "$(save -8 0 "$(present b9 ab ac)")" c3b.out)
wait
n=$(sessions -8)
ok=0; [ "$waited" -ge 1500 ] && grep -q attendance_athlete_removed c3b.out && [ "$n" = 0 ] && ok=1
check "C3 athlete deleted during a save: save waited ${waited}ms, refused (athlete_removed), nothing written" "$ok" "a=$(cat c3a.out) b=$(cat c3b.out) sessions=$n"

# C4: a save is running when someone deletes an athlete in it -> the delete
# waits for the save; afterwards the record survives, unlinked, named.
( $P -c "BEGIN;" -c "$(save -9 0 "$(present b9 ab)")" -c "SELECT pg_sleep(3);" -c "COMMIT;" > c4a.out 2>&1 ) &
sleep 1
waited=$(timed "DELETE FROM public.athletes WHERE id = '$(U ab)';" c4b.out)
wait
st=$(SQ "SELECT count(*) || ',' || count(*) FILTER (WHERE r.athlete_id IS NULL AND r.athlete_name_snapshot = 'Bo Banks')
         FROM public.team_attendance_records r JOIN public.team_attendance_sessions s ON s.id = r.session_id
         WHERE s.campaign_slug = 'team-b' AND s.session_date = public.team_attendance_today('team-b') - 9;")
ok=0; [ "$waited" -ge 1500 ] && grep -q '"created": true' c4a.out && [ "$st" = "2,1" ] && ok=1
check "C4 athlete deleted while their save is in flight: delete waited ${waited}ms; record kept, unlinked, named" "$ok" "a=$(cat c4a.out) b=$(cat c4b.out) st=$st"

echo "CONCURRENCY: $pass passed, $fail failed"
[ $fail = 0 ]
