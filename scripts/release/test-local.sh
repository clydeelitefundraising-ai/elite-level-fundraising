#!/usr/bin/env bash
# Local-only test of scripts/release/*.sql (bash scripts/release/test-local.sh) on a disposable Supabase-shaped
# cluster (port 55447). Never contacts Supabase.
R="$(cd "$(dirname "$0")/../.." && pwd)"; T=$R/supabase/tests/phase_s1_complete_season; MIG=$R/supabase/migrations
WORK="$(mktemp -d)"; DATA="$WORK/data"; PORT=55447
SU="psql -h localhost -p $PORT -X -q -v ON_ERROR_STOP=1 -U supabase_admin"
OW="psql -h localhost -p $PORT -X -q -v ON_ERROR_STOP=1 -U postgres"
initdb -D "$DATA" -U supabase_admin -A trust -E UTF8 >/dev/null || exit 1
pg_ctl -D "$DATA" -o "-p $PORT" -l "$WORK/pg.log" -w start >/dev/null || exit 1
trap 'pg_ctl -D "$DATA" -m fast -w stop >/dev/null; rm -rf "$WORK"' EXIT
AFTER=$(sed -n '/^AFTER_BASELINE="/,/"$/p' $T/run.sh | tr -d '"' | sed 's/AFTER_BASELINE=//')
$SU -d postgres -c "CREATE ROLE postgres LOGIN CREATEROLE" -c "CREATE ROLE anon NOLOGIN" -c "CREATE ROLE authenticated NOLOGIN" \
  -c "CREATE ROLE service_role NOLOGIN BYPASSRLS" -c "CREATE DATABASE elf OWNER postgres" >/dev/null || exit 1
$SU -d elf -c "ALTER SCHEMA public OWNER TO postgres" -c "GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role" \
  -c "SET client_min_messages = error" -c "CREATE PUBLICATION supabase_realtime" >/dev/null || exit 1
$OW -d elf -f $R/supabase/baseline/schema.sql >/dev/null 2>"$WORK/e" || { cat "$WORK/e"; exit 1; }
for m in $AFTER; do $OW -d elf -f $MIG/$m.sql >/dev/null 2>"$WORK/e" || { echo "mig $m failed"; cat "$WORK/e"; exit 1; }; done
$OW -d elf -f $T/fixtures.sql >/dev/null || exit 1
fail=0; ok() { echo "PASS  $1"; }; bad() { echo "FAIL  $1"; fail=1; }
check() { $OW -d elf -t -A -F '|' -f $R/scripts/release/complete_season_production_check.sql; }
summ() { check | grep '^summary|' | grep -v database | cut -d'|' -f2- | tr '\n' ';'; }
dump() { pg_dump -h localhost -p $PORT -U supabase_admin -d elf --schema-only --schema=public --no-owner 2>/dev/null | grep -vE '^--|^$|^SET |pg_catalog.set_config|^.(un)?restrict ' ; }
snap() { $SU -d elf -t -A -f $T/snapshot.sql; }
install() { for s in phase_s1_complete_season phase_s2_completed_season_read_only phase_s3_season_preview_access phase_s4_season_complete_access; do $OW -d elf -f $MIG/$s.sql >/dev/null 2>"$WORK/e" || { echo "$s failed"; cat "$WORK/e"; return 1; }; done; }

echo "pre: $(summ)"; [[ "$(summ)" == *"0 of 4 applied"* && "$(summ)" == *"OK — nothing missing"* ]] && ok "check before release: nothing missing, 0 of 4" || bad "check before"
dump > $WORK/schema.pre; snap > $WORK/snap.pre; DATA_PRE=$($SU -d elf -t -A -c "SELECT md5(string_agg(t::text, ',' ORDER BY t::text)) FROM public.campaign_settings t")
install && ok "s1..s4 install" || bad "install"
echo "installed: $(summ)"; [[ "$(summ)" == *"4 of 4 applied"* ]] && ok "check after release: 4 of 4" || bad "check after"
check | grep '^safety|' | tr '\n' ' '; echo
out=$($OW -d elf -t -A -F ' ' -f $R/scripts/release/complete_season_uninstall.sql 2>&1); echo "uninstall: $out"
[[ "$out" == *"0 0 0 0"* ]] && ok "uninstall leaves nothing (columns/triggers/functions/table = 0)" || bad "uninstall output"
[[ "$(summ)" == *"0 of 4 applied"* ]] && ok "check after uninstall: 0 of 4" || bad "check after uninstall"
dump > $WORK/schema.post; snap > $WORK/snap.post
diff -q $WORK/schema.pre $WORK/schema.post >/dev/null && ok "public schema identical to before the release ($(wc -l < $WORK/schema.pre) dump lines)" || { bad "schema differs"; diff $WORK/schema.pre $WORK/schema.post | head -20; }
diff -q $WORK/snap.pre $WORK/snap.post >/dev/null && ok "catalog/privilege/data snapshot identical ($(wc -l < $WORK/snap.pre) rows)" || { bad "snapshot differs"; diff $WORK/snap.pre $WORK/snap.post | head -10; }
[ "$DATA_PRE" = "$($SU -d elf -t -A -c "SELECT md5(string_agg(t::text, ',' ORDER BY t::text)) FROM public.campaign_settings t")" ] && ok "campaign_settings data identical" || bad "data differs"
out=$($OW -d elf -t -A -F ' ' -f $R/scripts/release/complete_season_uninstall.sql 2>&1); [[ "$out" == *"0 0 0 0"* ]] && ok "uninstall is safe to run twice" || bad "second uninstall: $out"
install && [[ "$(summ)" == *"4 of 4 applied"* ]] && ok "reinstall after uninstall works" || bad "reinstall"
$SU -d elf -c "SET session_replication_role = replica" -c "UPDATE public.campaign_settings SET season_completed_at = now() WHERE campaign_slug = (SELECT min(campaign_slug) FROM public.campaign_settings)" >/dev/null
out=$($OW -d elf -t -A -F ' ' -f $R/scripts/release/complete_season_uninstall.sql 2>&1)
[[ "$out" == *"uninstall refused"* ]] && [[ "$(summ)" == *"4 of 4 applied"* ]] && ok "refuses once a season is completed; nothing removed" || bad "refusal: $out"
$SU -d elf -c "SET session_replication_role = replica" -c "UPDATE public.campaign_settings SET season_completed_at = NULL" -c "INSERT INTO public.team_season_transitions (idempotency_key, request_hash, program_id, from_campaign_slug, to_campaign_slug, from_season_label, to_season_label, preview_fingerprint, actor_kind, actor_name, summary, result) VALUES (gen_random_uuid(), md5('x'), gen_random_uuid(), 'a', 'b', 'x', 'y', 'f', 'head_coach', 'n', '{}', '{}')" >/dev/null 2>&1
out=$($OW -d elf -t -A -F ' ' -f $R/scripts/release/complete_season_uninstall.sql 2>&1)
[[ "$out" == *"uninstall refused"* ]] && ok "refuses when an audit row exists" || bad "audit refusal: $out"
[ $fail = 0 ] && echo "RELEASE SCRIPTS: ALL PASSED" || echo "RELEASE SCRIPTS: FAILED"
