#!/usr/bin/env bash
# ELF QA smoke test (read-only; everything is rolled back).
#   ELF_QA_ENV_FILE=~/.elf-qa/qa.env bash scripts/qa/smoke.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${ELF_QA_ENV_FILE:-$HOME/.elf-qa/qa.env}"
GUARD=(node "$HERE/guard.mjs")
read -r MODE REF < <("${GUARD[@]}" summary --env "$ENV_FILE")
[ -n "${MODE:-}" ] && [ -n "${REF:-}" ] || { echo "guard refused the configuration"; exit 1; }
"${GUARD[@]}" psql --env "$ENV_FILE" -- -q -v ON_ERROR_STOP=1 -v "expected_ref=$REF" \
  -f "$HERE/sql/marker_check.sql" -f "$HERE/sql/smoke.sql" 2>&1 | grep -E "PASS|FAIL|SKIP|SMOKE|ERROR" | sed 's/^psql:[^ ]* NOTICE:  //; s/^NOTICE:  //'
exit "${PIPESTATUS[0]}"
