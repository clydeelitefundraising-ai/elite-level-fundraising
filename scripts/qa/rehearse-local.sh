#!/usr/bin/env bash
# ELF QA installation — full LOCAL rehearsal. Disposable PostgreSQL only;
# never contacts Supabase (the guard runs in local-rehearsal mode, which
# refuses any non-localhost database and any Supabase URL or key).
#
#   bash scripts/qa/rehearse-local.sh
#
# Builds a cluster shaped like a fresh Supabase project (non-superuser
# "postgres" owning the database and a member of anon/authenticated/service_role as on Supabase, the
# supabase_realtime publication, a storage.buckets table and a platform-owned
# rls_auto_enable function), then runs the real QA scripts against it:
#   guard tests and refusals, schema install, idempotent re-run, marker and
#   changed-file refusals, catalog equality with the test runners' schema,
#   QA secrets + synthetic seed + the Hawks season transition, the smoke
#   test, login-hash verification — and finally the Phase 1–4 SQL suites.
# The cluster and every generated secret are deleted at the end.
set -u
export PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
WORK="$(mktemp -d)"; DATA="$WORK/data"; PORT=55439
SU="psql -h localhost -p $PORT -X -q -v ON_ERROR_STOP=1 -U supabase_admin"
initdb -D "$DATA" -U supabase_admin -A trust -E UTF8 >/dev/null || exit 1
pg_ctl -D "$DATA" -o "-p $PORT" -l "$WORK/pg.log" -w start >/dev/null || exit 1
trap 'pg_ctl -D "$DATA" -m fast -w stop >/dev/null; rm -rf "$WORK"' EXIT
failed=0
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; failed=1; }
postgres --version

# ── A Supabase-shaped empty project ────────────────────────────────────
platform() { # db
  $SU -d "$1" -c "SET client_min_messages = error" -c "CREATE PUBLICATION supabase_realtime" \
    -c "CREATE SCHEMA storage" \
    -c "CREATE TABLE storage.buckets (id text PRIMARY KEY, name text NOT NULL UNIQUE, public boolean DEFAULT false, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now())" \
    -c "GRANT USAGE ON SCHEMA storage TO postgres, service_role" -c "GRANT ALL ON storage.buckets TO postgres, service_role" \
    -c "CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger LANGUAGE plpgsql AS \$f\$ BEGIN END \$f\$" >/dev/null
}
$SU -d postgres -c "CREATE ROLE postgres LOGIN CREATEROLE" -c "CREATE ROLE anon NOLOGIN" \
  -c "CREATE ROLE authenticated NOLOGIN" -c "CREATE ROLE service_role NOLOGIN BYPASSRLS" \
  -c "GRANT anon, authenticated, service_role TO postgres" \
  -c "CREATE DATABASE elfqa OWNER postgres" -c "CREATE DATABASE elfref OWNER postgres" -c "CREATE DATABASE elfbusy OWNER postgres" >/dev/null || exit 1
platform elfqa; platform elfbusy
$SU -d elfref -c "SET client_min_messages = error" -c "CREATE PUBLICATION supabase_realtime" >/dev/null
$SU -d elfbusy -c "CREATE TABLE public.campaign_settings (campaign_slug text PRIMARY KEY)" >/dev/null

mkdir -p "$WORK/secrets"
envfile() { # db ref
  printf 'ELF_QA_MODE=local-rehearsal\nQA_PROJECT_REF=%s\nQA_DB_URL=postgresql://postgres@localhost:%s/%s\n' "$2" "$PORT" "$1" > "$WORK/$1.env"
  echo "$WORK/$1.env"
}
QA_ENV=$(envfile elfqa local-rehearsal)
export ELF_QA_SECRETS_DIR="$WORK/secrets"

# ── 1. Guard ───────────────────────────────────────────────────────────
node --test "$HERE/guard.test.mjs" > "$WORK/guard.out" 2>&1 && pass "guard unit tests ($(grep -oE 'pass [0-9]+' "$WORK/guard.out" | head -1))" || { fail "guard unit tests"; tail -20 "$WORK/guard.out"; }
printf 'ELF_QA_MODE=qa\nQA_PROJECT_REF=nggabucgcoaffpppchsp\nQA_SUPABASE_URL=https://nggabucgcoaffpppchsp.supabase.co\nQA_SERVICE_ROLE_KEY=x\nQA_ANON_KEY=x\nQA_DB_URL=postgresql://postgres:x@db.nggabucgcoaffpppchsp.supabase.co:5432/postgres\n' > "$WORK/prod.env"
if node "$HERE/guard.mjs" psql --env "$WORK/prod.env" -- -c "SELECT 1" > "$WORK/prod.out" 2>&1; then fail "a production configuration was accepted"
else grep -q "PRODUCTION" "$WORK/prod.out" && pass "a production configuration is refused before any connection" || fail "production refusal message"; fi
ELF_QA_ENV_FILE="$WORK/prod.env" bash "$HERE/apply-schema.sh" > "$WORK/prodapply.out" 2>&1 && fail "installer ran against production config" \
  || pass "the installer refuses a production configuration"

# ── 2. Install ─────────────────────────────────────────────────────────
start=$(date +%s)
if ELF_QA_ENV_FILE="$QA_ENV" bash "$HERE/apply-schema.sh" > "$WORK/apply1.out" 2>&1; then
  pass "schema installed: $(grep -c '^applied ' "$WORK/apply1.out") steps applied in $(( $(date +%s) - start ))s ($(grep -E '^connected' "$WORK/apply1.out"))"
else fail "schema install"; tail -25 "$WORK/apply1.out"; fi
grep -q "prepared baseline: removed 33 lines" "$WORK/apply1.out" && pass "baseline prepared for Supabase (platform-owned rls_auto_enable left untouched)" || fail "baseline preparation"
ELF_QA_ENV_FILE="$QA_ENV" bash "$HERE/apply-schema.sh" > "$WORK/apply2.out" 2>&1 && grep -q "== done: 0 applied, 33 already applied" "$WORK/apply2.out" \
  && pass "re-running the installer applies nothing (33 steps already applied)" || { fail "idempotent re-run"; tail -5 "$WORK/apply2.out"; }
Q() { node "$HERE/guard.mjs" psql --env "$QA_ENV" -- -q -t -A -v ON_ERROR_STOP=1 "$@" 2>/dev/null | tr -d '\r'; }
[ "$(Q -c "SELECT environment || ':' || project_ref FROM elf_qa.marker")" = "local-rehearsal:local-rehearsal" ] && pass "QA marker recorded" || fail "QA marker"
[ "$(Q -c "SELECT has_schema_privilege('service_role', 'elf_qa', 'USAGE') OR has_schema_privilege('anon', 'elf_qa', 'USAGE')")" = "f" ] \
  && pass "the marker schema is not reachable by any API role" || fail "marker schema privileges"

# Refusals.
$SU -d elfqa -c "UPDATE elf_qa.marker SET project_ref = 'someone-else'" >/dev/null
ELF_QA_ENV_FILE="$QA_ENV" bash "$HERE/apply-schema.sh" > "$WORK/mm.out" 2>&1 && fail "ran on a mismatched marker" \
  || { grep -q elf_qa_marker_mismatch "$WORK/mm.out" && pass "a database marked for another project is refused" || fail "marker mismatch message"; }
$SU -d elfqa -c "UPDATE elf_qa.marker SET project_ref = 'local-rehearsal'" >/dev/null
BUSY_ENV=$(envfile elfbusy local-rehearsal)
ELF_QA_ENV_FILE="$BUSY_ENV" bash "$HERE/apply-schema.sh" > "$WORK/busy.out" 2>&1 && fail "marked a non-empty database" \
  || { grep -q elf_qa_database_not_empty "$WORK/busy.out" && pass "an existing (non-empty) database can never be marked as QA" || fail "non-empty refusal"; }
$SU -d elfqa -c "UPDATE elf_qa.applied SET sha256 = repeat('0', 64) WHERE step = 'phase_s3_season_preview_access'" >/dev/null
ELF_QA_ENV_FILE="$QA_ENV" bash "$HERE/apply-schema.sh" > "$WORK/chg.out" 2>&1 && fail "accepted a changed migration" \
  || { grep -q "applied from a different version" "$WORK/chg.out" && pass "a step applied from a different file version is refused" || fail "changed-file message"; }
$SU -d elfqa -c "UPDATE elf_qa.applied SET sha256 = '$(sha256sum "$ROOT/supabase/migrations/phase_s3_season_preview_access.sql" | cut -d' ' -f1)' WHERE step = 'phase_s3_season_preview_access'" >/dev/null

# ── 3. Same schema as the test runners build ───────────────────────────
# The reference is built INDEPENDENTLY of install-order.txt, from the test
# runners' own migration list, so a wrong install order can't hide itself.
RUNNER_LIST=$(sed -n '/^AFTER_BASELINE="/,/"$/p' "$ROOT/supabase/tests/phase_s1_complete_season/run.sh" | tr -d '"\r' | sed 's/^AFTER_BASELINE=//' | grep -v '^$')
REF_LIST="$RUNNER_LIST phase_s1_complete_season phase_s2_completed_season_read_only phase_s3_season_preview_access phase_s4_season_complete_access"
ORDER_LIST=$(tr -d '\r' < "$HERE/install-order.txt" | grep -vE '^(#|baseline |storage_buckets |$)' | cut -d' ' -f1)
if [ "$(echo $ORDER_LIST)" = "$(echo $REF_LIST)" ]; then pass "install order = the test runners' order ($(echo $REF_LIST | wc -w) migrations after the baseline)"
else fail "install order differs from the test runners' list"; fi
OW="psql -h localhost -p $PORT -X -q -v ON_ERROR_STOP=1 -U postgres -d elfref"
$OW -f "$ROOT/supabase/baseline/schema.sql" >/dev/null 2>&1 || fail "reference baseline"
for m in $REF_LIST; do $OW -f "$ROOT/supabase/migrations/$m.sql" >/dev/null 2>&1 || fail "reference $m"; done
$SU -d elfqa -t -A -f "$HERE/sql/catalog_snapshot.sql" > "$WORK/cat.qa"
$SU -d elfref -t -A -f "$HERE/sql/catalog_snapshot.sql" > "$WORK/cat.ref"
if [ -s "$WORK/cat.qa" ] && diff -q "$WORK/cat.qa" "$WORK/cat.ref" >/dev/null; then
  pass "QA install is identical to the tested schema ($(wc -l < "$WORK/cat.qa") catalog rows: columns, constraints, indexes, triggers, functions, privileges, policies)"
else fail "catalog differs from the reference install:"; diff "$WORK/cat.qa" "$WORK/cat.ref" | head -20; fi
[ "$(Q -c "SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public'")" = "782" ] && pass "782 public columns (production's 758 + 6 Complete Season columns + the 18-column audit table)" || fail "column count: $(Q -c "SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public'")"

# ── 4. Secrets, seed, season transition ────────────────────────────────
node "$HERE/generate-secrets.mjs" > "$WORK/gs.out" 2>&1 && pass "QA secrets generated (names only: $(grep -oE 'ELF_ACCOUNT_PEPPER.*\(values not shown\)' "$WORK/gs.out" | cut -c1-40)…)" || { fail "generate secrets"; cat "$WORK/gs.out"; }
node "$HERE/generate-secrets.mjs" > /dev/null 2>&1 && fail "secrets overwritten" || pass "existing QA secrets are never overwritten"
node "$HERE/generate-seed-vars.mjs" > "$WORK/gv.out" 2>&1 && pass "seed password variables and QA logins generated (values not shown)" || { fail "seed vars"; cat "$WORK/gv.out"; }
if ELF_QA_ENV_FILE="$QA_ENV" ELF_QA_ALLOW_TRANSITION=hawks-track-2027 bash "$HERE/apply-seed.sh" > "$WORK/seed.out" 2>&1; then
  pass "synthetic seed applied; Hawks 2027 season completed ($(grep -c '^applied' "$WORK/seed.out") steps)"
else fail "seed"; tail -20 "$WORK/seed.out"; fi
ELF_QA_ENV_FILE="$QA_ENV" ELF_QA_ALLOW_TRANSITION=hawks-track-2027 bash "$HERE/apply-seed.sh" > "$WORK/seed2.out" 2>&1 && [ "$(grep -c '^skipped' "$WORK/seed2.out")" = 2 ] \
  && pass "re-running the seed applies nothing" || fail "seed re-run"
counts=$(Q -c "SELECT (SELECT count(*) FROM elf_accounts) || ' accounts, ' || (SELECT count(*) FROM campaign_settings) || ' teams, ' || (SELECT count(*) FROM athletes) || ' athletes, ' || (SELECT count(*) FROM team_members) || ' members, ' || (SELECT count(*) FROM team_coaches) || ' coach rows, ' || (SELECT count(*) FROM messages) || ' messages, ' || (SELECT count(*) FROM donations) || ' donations'")
[ "$(Q -c "SELECT count(*) FROM elf_accounts")" = 18 ] && [ "$(Q -c "SELECT count(*) FROM campaign_settings")" = 5 ] && pass "seeded: $counts" || fail "seed counts: $counts"

# ── 5. Smoke test and login hashes ─────────────────────────────────────
if ELF_QA_ENV_FILE="$QA_ENV" bash "$HERE/smoke.sh" > "$WORK/smoke.out" 2>&1; then
  pass "smoke test: $(grep -c '^PASS' "$WORK/smoke.out") checks passed, all rolled back"
else fail "smoke test"; cat "$WORK/smoke.out"; fi
Q -c "SELECT email || chr(9) || salt || chr(9) || password_hash FROM elf_accounts ORDER BY email" > "$WORK/hashes.tsv"
Q -c "SELECT email || chr(9) || salt || chr(9) || password_hash FROM team_coaches WHERE password_hash <> 'unused' ORDER BY campaign_slug" > "$WORK/legacy.tsv"
node -e '
const fs=require("fs"),c=require("crypto");const [secretsDir,h,l]=process.argv.slice(1);
const env=Object.fromEntries(fs.readFileSync(secretsDir+"/qa-app-secrets.env","utf8").split(/\r?\n/).filter(x=>/^[A-Z_]+=/.test(x)).map(x=>[x.slice(0,x.indexOf("=")),x.slice(x.indexOf("=")+1)]));
const pw=Object.fromEntries(fs.readFileSync(secretsDir+"/qa-logins.txt","utf8").split(/\r?\n/).filter(x=>x&&!x.startsWith("#")).map(x=>x.split("\t")));
const sha=s=>c.createHash("sha256").update(s).digest("hex");let ok=0,bad=0;
for(const r of fs.readFileSync(h,"utf8").trim().split("\n")){const [e,s,hash]=r.split("\t");(sha(pw[e]+s+env.ELF_ACCOUNT_PEPPER)===hash)?ok++:bad++;}
for(const r of fs.readFileSync(l,"utf8").trim().split("\n")){const [e,s,hash]=r.split("\t");(sha(pw[e]+s+env.TEAM_COACH_PEPPER)===hash)?ok++:bad++;}
console.log(ok+" "+bad);' "$WORK/secrets" "$WORK/hashes.tsv" "$WORK/legacy.tsv" > "$WORK/hashcheck.out"
read -r okn badn < "$WORK/hashcheck.out"
[ "${badn:-1}" = 0 ] && [ "${okn:-0}" = 20 ] && pass "all 20 synthetic logins hash correctly with the QA secrets (18 ELF accounts + legacy coach on 2 teams)" || fail "login hashes: $okn ok, $badn bad"

# ── 6. Phase 1–4 SQL suites ────────────────────────────────────────────
# (REHEARSE_SKIP_SUITES=1 skips them while iterating; a full rehearsal runs them.)
[ "${REHEARSE_SKIP_SUITES:-0}" = 1 ] && { echo "SKIP  Phase 1-4 SQL suites (REHEARSE_SKIP_SUITES=1)"; failed=1; }
[ "${REHEARSE_SKIP_SUITES:-0}" = 1 ] || for s in phase_s1_complete_season phase_s2_completed_season_read_only phase_s3_season_preview_access phase_s4_season_complete_access; do
  if bash "$ROOT/supabase/tests/$s/run.sh" > "$WORK/$s.out" 2>&1; then
    pass "$s suite: $(grep -E '^(BEHAVIOR|PHASE 2 BEHAVIOR|CONCURRENCY)' "$WORK/$s.out" | tr '\n' ' ')"
  else fail "$s suite"; grep -E '^(FAIL|BEHAVIOR|PHASE)' "$WORK/$s.out"; fi
done

[ $failed = 0 ] && echo "REHEARSAL PASSED" || echo "REHEARSAL FAILED"
exit $failed
