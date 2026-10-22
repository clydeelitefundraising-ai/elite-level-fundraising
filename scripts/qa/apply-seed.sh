#!/usr/bin/env bash
# ELF QA synthetic data installer (after apply-schema.sh).
#
#   ELF_QA_ENV_FILE=~/.elf-qa/qa.env bash scripts/qa/apply-seed.sh
#
#   1. seed      scripts/qa/sql/seed.sql with <secrets dir>/seed-vars.sql,
#                one transaction, recorded in elf_qa.applied (runs once)
#   2. hawks     ONLY if ELF_QA_ALLOW_TRANSITION=hawks-track-2027: completes
#                the Hawks 2027 season (a real season transition) so QA has
#                a completed, read-only season. Recorded; runs once.
# Same guard and marker check as apply-schema.sh. Never prints a secret.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${ELF_QA_ENV_FILE:-$HOME/.elf-qa/qa.env}"
SECRETS_DIR="${ELF_QA_SECRETS_DIR:-$HOME/.elf-qa}"
GUARD=(node "$HERE/guard.mjs")
read -r MODE REF < <("${GUARD[@]}" summary --env "$ENV_FILE")
[ -n "${MODE:-}" ] && [ -n "${REF:-}" ] || { echo "guard refused the configuration"; exit 1; }
if [ "$MODE" = "qa" ] && [ "${ELF_QA_CONFIRM:-}" != "$REF" ]; then
  echo "Refusing: set ELF_QA_CONFIRM=$REF to confirm you intend to seed the QA project."; exit 1
fi
Q() { "${GUARD[@]}" psql --env "$ENV_FILE" -- -q -v ON_ERROR_STOP=1 -v "expected_ref=$REF" "$@"; }
QT() { Q -t -A "$@" 2>/dev/null | tr -d '\r'; }
VARS="$SECRETS_DIR/seed-vars.sql"
[ -f "$VARS" ] || { echo "missing $VARS — run generate-secrets.mjs and generate-seed-vars.mjs"; exit 1; }

step() { # name file [extra psql files before it]
  local name="$1" file="$2"; shift 2
  local sha; sha=$(cat "$file" "$@" | sha256sum | cut -d' ' -f1)
  local rec; rec=$(QT -f "$HERE/sql/marker_check.sql" -c "SELECT coalesce((SELECT sha256 FROM elf_qa.applied WHERE step = '$name'), '')")
  if [ -n "$rec" ]; then echo "skipped  $name (already applied)"; return 0; fi
  local pre=(); for f in "$@"; do pre+=(-f "$f"); done
  Q --single-transaction -f "$HERE/sql/marker_check.sql" "${pre[@]}" -f "$file" \
    -c "INSERT INTO elf_qa.applied (step, sha256) VALUES ('$name', '$sha')" >/dev/null
  echo "applied  $name"
}

step seed "$HERE/sql/seed.sql" "$VARS"
if [ "${ELF_QA_ALLOW_TRANSITION:-}" = "hawks-track-2027" ]; then
  step season_transition_hawks "$HERE/sql/seed_complete_hawks.sql"
else
  echo "not run  season_transition_hawks (set ELF_QA_ALLOW_TRANSITION=hawks-track-2027 to complete the Hawks season)"
fi
