# ELF QA database setup (Complete Season)

Installs ELF's schema and synthetic test data into the **QA** Supabase project
`mzsvbxosoidwhntpjdkf` (us-east-2). The production project
`nggabucgcoaffpppchsp` is refused by every script, wherever it appears.

Nothing here runs against Supabase until you approve it. Rehearse locally first:

    bash scripts/qa/rehearse-local.sh

## Safety layers
1. **Guard** (`guard.mjs`) — every database command runs through
   `guard.mjs psql`, which validates the whole config first:
   - `QA_PROJECT_REF` must be exactly `mzsvbxosoidwhntpjdkf`;
   - `QA_SUPABASE_URL` must be exactly `https://mzsvbxosoidwhntpjdkf.supabase.co`;
   - `QA_DB_URL` must be the QA project's direct host (`db.<ref>.supabase.co`,
     user `postgres`) or the us-east-2 session pooler (user `postgres.<ref>`),
     port 5432, database `postgres`;
   - legacy (JWT) API keys must carry the QA ref and the right role;
     new-format keys are flagged and checked at connect time;
   - the production ref anywhere in the file → refused;
   - the config file must be outside every repository.
   Secrets are never printed; psql gets them through its environment.
2. **Explicit confirmation** — in `qa` mode the installers also require
   `ELF_QA_CONFIRM=mzsvbxosoidwhntpjdkf`.
3. **QA marker** (`elf_qa.marker`) — created only on an **empty** database
   (no public tables), so an existing database (e.g. production) can never be
   marked. Every session then checks the marker matches the expected project
   before running anything.
4. **Applied-step ledger** (`elf_qa.applied`) — each step records its file's
   SHA-256; re-runs skip it, a changed file is refused.

## Files
| File | Purpose |
|---|---|
| `qa.env.example` | the config file's keys (copy to `%USERPROFILE%\.elf-qa\qa.env`) |
| `guard.mjs`, `guard.test.mjs` | connection guard and its tests |
| `install-order.txt` | baseline → 27 later migrations → Complete Season 1–3 → buckets |
| `prepare-baseline.mjs` | leaves Supabase's own `rls_auto_enable` function alone |
| `preflight.mjs`, `sql/preflight.sql` | READ-ONLY checks: guard, API keys (status codes only), database facts in a server-enforced read-only session |
| `apply-schema.sh` | marker + ordered, recorded install |
| `sql/storage_buckets.sql` | the 9 storage buckets (2 private, 7 public) |
| `generate-secrets.mjs` | new QA-only app secrets → `%USERPROFILE%\.elf-qa\qa-app-secrets.env` |
| `generate-seed-vars.mjs` | synthetic logins (QA-hashed) → `seed-vars.sql`, `qa-logins.txt` (same folder) |
| `sql/seed.sql` | synthetic teams, people, messaging, fundraising, attendance |
| `sql/seed_complete_hawks.sql` | optional: completes the Hawks 2027 season (needs `ELF_QA_ALLOW_TRANSITION=hawks-track-2027`) |
| `apply-seed.sh`, `smoke.sh`, `sql/smoke.sql` | seed installer; read-only smoke test (rolled back) |
| `rehearse-local.sh`, `sql/catalog_snapshot.sql` | the full rehearsal against a disposable local cluster |

## QA run (only after approval)
    node scripts/qa/guard.mjs check
    node scripts/qa/preflight.mjs
    node scripts/qa/generate-secrets.mjs
    node scripts/qa/generate-seed-vars.mjs
    ELF_QA_CONFIRM=mzsvbxosoidwhntpjdkf bash scripts/qa/apply-schema.sh
    ELF_QA_CONFIRM=mzsvbxosoidwhntpjdkf ELF_QA_ALLOW_TRANSITION=hawks-track-2027 bash scripts/qa/apply-seed.sh
    bash scripts/qa/smoke.sh
