#!/usr/bin/env bash
# ELF QA schema installer.
#
#   ELF_QA_ENV_FILE=~/.elf-qa/qa.env bash scripts/qa/apply-schema.sh
#
# Every database command goes through scripts/qa/guard.mjs (only the QA
# project — or, in local-rehearsal mode, a localhost database — is
# accepted; the production project is refused wherever it appears).
#   1. guard check, then a connection test
#   2. QA marker: created only on an EMPTY database; otherwise it must
#      match the expected project exactly
#   3. each step in install-order.txt, in order, each session starting with
#      the marker check; recorded in elf_qa.applied with the file's SHA-256.
#      Re-runs skip applied steps; a changed file is refused. Files without
#      their own BEGIN/COMMIT run as one transaction (all or nothing).
# Stops at the first error. Never prints a secret.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
ENV_FILE="${ELF_QA_ENV_FILE:-$HOME/.elf-qa/qa.env}"
GUARD=(node "$HERE/guard.mjs")

read -r MODE REF < <("${GUARD[@]}" summary --env "$ENV_FILE")
[ -n "${MODE:-}" ] && [ -n "${REF:-}" ] || { echo "guard refused the configuration"; exit 1; }
if [ "$MODE" = "qa" ] && [ "${ELF_QA_CONFIRM:-}" != "$REF" ]; then
  echo "Refusing: set ELF_QA_CONFIRM=$REF to confirm you intend to install into the QA project."; exit 1
fi
Q() { "${GUARD[@]}" psql --env "$ENV_FILE" -- -q -v ON_ERROR_STOP=1 -v "expected_ref=$REF" -v "mode=$MODE" "$@"; }
QT() { Q -t -A "$@" 2>/dev/null | tr -d '\r'; }

echo "== 1. connection"
Q -t -A -c "SELECT 'connected: database=' || current_database() || ' server=' || split_part(version(), ' ', 2)" | tr -d '\r'

echo "== 2. QA marker"
state=$(QT -c "SELECT CASE WHEN to_regclass('elf_qa.marker') IS NULL THEN 'none' ELSE 'present' END")
if [ "$state" = "none" ]; then
  Q -f "$HERE/sql/qa_marker_create.sql"
  echo "marker created for $MODE $REF"
fi
Q -f "$HERE/sql/marker_check.sql" -c "SELECT 1" >/dev/null
echo "marker verified for $REF"

echo "== 3. install steps"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
applied=0; skipped=0
while read -r step file; do
  case "$step" in ''|'#'*) continue ;; esac
  src="$ROOT/$file"
  [ -f "$src" ] || { echo "missing file: $file"; exit 1; }
  sha=$(sha256sum "$src" | cut -d' ' -f1)
  rec=$(QT -f "$HERE/sql/marker_check.sql" -c "SELECT coalesce((SELECT sha256 FROM elf_qa.applied WHERE step = '$step'), '')")
  if [ "$rec" = "$sha" ]; then skipped=$((skipped+1)); continue; fi
  if [ -n "$rec" ]; then echo "REFUSED: $step was applied from a different version of $file"; exit 1; fi
  run="$src"
  if [ "$step" = "baseline" ]; then
    node "$HERE/prepare-baseline.mjs" "$src" "$WORK/baseline.sql"
    run="$WORK/baseline.sql"
  fi
  single=()
  grep -qE '^[[:space:]]*BEGIN;' "$src" || single=(--single-transaction)
  if ! Q "${single[@]}" -f "$HERE/sql/marker_check.sql" -f "$run" \
         -c "INSERT INTO elf_qa.applied (step, sha256) VALUES ('$step', '$sha')" >"$WORK/out.txt" 2>"$WORK/err.txt"; then
    echo "FAILED at step $step:"; grep -v NOTICE "$WORK/err.txt" | head -20; exit 1
  fi
  echo "applied  $step"
  applied=$((applied+1))
done < <(tr -d '\r' < "$HERE/install-order.txt")
echo "== done: $applied applied, $skipped already applied"
