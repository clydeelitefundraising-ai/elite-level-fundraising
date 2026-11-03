#!/usr/bin/env bash
# phase_o3 concurrency checks: school_link_apply() with real parallel
# sessions (run via run.sh, after tests.sql — uses its qa helpers and the
# Platform Admin fixture).
cd "${WORK:?run via run.sh}"
P="psql -h localhost -p ${PORT:?} -U supabase_admin -d elf -X -q -t -A -v ON_ERROR_STOP=0"
SQ() { $P -c "$1" 2>&1; }
pass=0; fail=0
check() { if [ "$2" = "1" ]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1 :: $3"; fi; }
timed() { local s=$(date +%s%N); SQ "$1" > "$2"; echo $(( ($(date +%s%N) - s) / 1000000 )); }

# Teams k1..k5: <t>-2025 -> <t>-2026 (both completed) -> <t>-2027 (current).
for t in k1 k2 k3 k4 k5; do
  SQ "INSERT INTO public.campaign_settings (campaign_slug, school_name, sport_name, season) VALUES
        ('$t-2025', '$t', 'Track', '2025 Season'), ('$t-2026', '$t', 'Track', '2026 Season'), ('$t-2027', '$t', 'Track', '2027 Season');
      UPDATE public.campaign_settings SET successor_campaign_slug = '$t-2026' WHERE campaign_slug = '$t-2025';
      UPDATE public.campaign_settings SET successor_campaign_slug = '$t-2027', season_completed_at = now() WHERE campaign_slug = '$t-2026';" >/dev/null
done
# apply <team> <org-key|NULL> <expected-key|NULL> <season...>: the server's call.
apply() {
  local t=$1 org=$2 exp=$3; shift 3
  local o="NULL"; [ "$org" != NULL ] && o="qa.u('$org')"
  local e="NULL"; [ "$exp" != NULL ] && e="qa.u('$exp')"
  local items=""; for s in "$@"; do items="$items${items:+, }qa.e('$s', $e)"; done
  echo "SET ROLE service_role; SELECT public.school_link_apply(qa.pa1(), '$t', $o, qa.s($items));"
}
audits() { SQ "SELECT count(*) FROM public.audit_logs WHERE action LIKE 'school_link.%' AND campaign_slug LIKE '$1-%';"; }
orgs() { SQ "SELECT string_agg(coalesce(o.slug, '-'), ',' ORDER BY c.campaign_slug) FROM public.campaign_settings c LEFT JOIN public.organizations o ON o.id = c.organization_id WHERE c.campaign_slug LIKE '$1-%';"; }

# K1: two admins confirm different schools for the same seasons at the same
# time (both previews showed "no school"). The second waits for the first's
# row locks, then sees the changed school and is refused as stale — never a
# mix of both schools, never audit rows for the loser.
( $P -c "BEGIN;" -c "$(apply k1-2027 org-a NULL k1-2025 k1-2026 k1-2027)" -c "SELECT pg_sleep(2);" -c "COMMIT;" > k1a.out 2>&1 ) &
sleep 0.7
waited=$(timed "$(apply k1-2027 org-b NULL k1-2027 k1-2026 k1-2025)" k1b.out)
wait
ok=0; [ "$waited" -ge 1000 ] && grep -q '"updated"' k1a.out && grep -q school_link_stale k1b.out \
  && [ "$(orgs k1)" = "qa-north,qa-north,qa-north" ] && [ "$(audits k1)" = 3 ] && ok=1
check "K1 two concurrent confirms: the second waited ${waited}ms, then was refused as stale; all 3 seasons on the winner's school, 3 audit rows" "$ok" "a=$(cat k1a.out) b=$(cat k1b.out) orgs=$(orgs k1) audits=$(audits k1)"

# K2: six simultaneous confirms on overlapping selections, in different
# orders. Slug-ordered locking: no deadlock; exactly one wins per season set.
for i in 1 2 3 4 5 6; do
  case $i in
    1) a="k2-2025 k2-2026 k2-2027";; 2) a="k2-2027 k2-2026 k2-2025";; 3) a="k2-2026 k2-2025 k2-2027";;
    4) a="k2-2027 k2-2025 k2-2026";; 5) a="k2-2026 k2-2027 k2-2025";; 6) a="k2-2025 k2-2027 k2-2026";;
  esac
  org=org-a; [ $((i % 2)) = 0 ] && org=org-b
  ( SQ "$(apply k2-2027 $org NULL $a)" > k2.$i.out ) &
done
wait
wins=$(grep -l '"updated"' k2.*.out | wc -l); stale=$(grep -l school_link_stale k2.*.out | wc -l); dead=$(grep -il deadlock k2.*.out | wc -l)
o=$(orgs k2)
ok=0; [ "$wins" = 1 ] && [ "$stale" = 5 ] && [ "$dead" = 0 ] && { [ "$o" = "qa-north,qa-north,qa-north" ] || [ "$o" = "qa-south,qa-south,qa-south" ]; } && [ "$(audits k2)" = 3 ] && ok=1
check "K2 six simultaneous confirms in different orders: 1 applied, 5 stale, 0 deadlocks, one consistent school ($o), 3 audit rows" "$ok" "wins=$wins stale=$stale dead=$dead orgs=$o audits=$(audits k2) $(cat k2.*.out | tr '\n' ' ')"

# K3: a link racing the season's completion. The completion holds the
# current season's row; the link waits, then links the now-completed season
# (organization_id only); completion and successor are preserved.
( $P -c "BEGIN;" -c "UPDATE public.campaign_settings SET season_completed_at = now() WHERE campaign_slug = 'k3-2027';" -c "SELECT pg_sleep(2);" -c "COMMIT;" > k3a.out 2>&1 ) &
sleep 0.7
waited=$(timed "$(apply k3-2027 org-a NULL k3-2027)" k3b.out)
wait
st=$(SQ "SELECT (season_completed_at IS NOT NULL)::text || ',' || coalesce(o.slug, '-') FROM public.campaign_settings c LEFT JOIN public.organizations o ON o.id = c.organization_id WHERE campaign_slug = 'k3-2027';")
ok=0; [ "$waited" -ge 1000 ] && grep -q '"updated"' k3b.out && [ "$st" = "true,qa-north" ] && [ "$(audits k3)" = 1 ] && ok=1
check "K3 link during a completion: waited ${waited}ms, then linked the completed season (still completed; school set; 1 audit row)" "$ok" "a=$(cat k3a.out) b=$(cat k3b.out) st=$st"

# K4: a link racing an uncommitted direct change of the same season's school
# (e.g. another tool): the link waits, then sees the change and is refused as
# stale — the preview the admin confirmed is no longer true.
( $P -c "BEGIN;" -c "UPDATE public.campaign_settings SET organization_id = qa.u('org-b') WHERE campaign_slug = 'k4-2027';" -c "SELECT pg_sleep(2);" -c "COMMIT;" > k4a.out 2>&1 ) &
sleep 0.7
waited=$(timed "$(apply k4-2027 org-a NULL k4-2026 k4-2027)" k4b.out)
wait
ok=0; [ "$waited" -ge 1000 ] && grep -q school_link_stale k4b.out && [ "$(orgs k4)" = "-,-,qa-south" ] && [ "$(audits k4)" = 0 ] && ok=1
check "K4 link during an in-flight direct change: waited ${waited}ms, refused as stale; k4-2026 untouched, no audit rows" "$ok" "a=$(cat k4a.out) b=$(cat k4b.out) orgs=$(orgs k4)"

# K5: while one session is inside a link, other sessions get no exception:
# a direct organization_id write to a completed season of ANOTHER team is
# refused immediately (the flag is transaction-local, never shared).
SQ "CREATE OR REPLACE FUNCTION qa.slow_boom() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN
      IF NEW.campaign_slug = 'k5-2027' THEN PERFORM pg_sleep(2); END IF; RETURN NEW; END \$\$;
    CREATE TRIGGER qa_slow BEFORE UPDATE ON public.campaign_settings FOR EACH ROW EXECUTE FUNCTION qa.slow_boom();" >/dev/null
( SQ "$(apply k5-2027 org-a NULL k5-2025 k5-2026 k5-2027)" > k5a.out ) &
sleep 0.7
waited=$(timed "UPDATE public.campaign_settings SET organization_id = qa.u('org-b') WHERE campaign_slug = 'k1-2026';" k5b.out)
wait
SQ "DROP TRIGGER qa_slow ON public.campaign_settings;" >/dev/null
ok=0; [ "$waited" -lt 1000 ] && grep -q season_completed_read_only k5b.out && grep -q '"updated"' k5a.out \
  && [ "$(orgs k1)" = "qa-north,qa-north,qa-north" ] && ok=1
check "K5 during another session's link (flag on there), a direct write to a completed season elsewhere was refused at once (${waited}ms)" "$ok" "a=$(cat k5a.out) b=$(cat k5b.out)"

# K6: a session killed mid-link (connection lost after the audit insert,
# before COMMIT) leaves nothing: no season changed, no audit row.
( $P -c "BEGIN;" -c "$(apply k5-2027 org-b org-a k5-2025 k5-2026 k5-2027)" -c "SELECT pg_sleep(5);" -c "COMMIT;" > k6a.out 2>&1 ) &
sleep 1.5
SQ "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE query LIKE '%pg_sleep(5)%' AND pid <> pg_backend_pid();" >/dev/null
wait
ok=0; grep -qiE 'terminat|connection' k6a.out && [ "$(orgs k5)" = "qa-north,qa-north,qa-north" ] && [ "$(audits k5)" = 3 ] && ok=1
check "K6 connection killed after the link ran but before COMMIT: all 3 seasons keep their school, no extra audit rows" "$ok" "a=$(cat k6a.out) orgs=$(orgs k5) audits=$(audits k5)"

echo "CONCURRENCY: $pass passed, $fail failed"
[ $fail = 0 ]
