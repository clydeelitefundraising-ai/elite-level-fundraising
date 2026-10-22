#!/usr/bin/env node
// ELF QA preflight — READ-ONLY. Run before any install step.
//
//   node scripts/qa/preflight.mjs [--env FILE]
//
//   1. guard: validates the QA config (production refused), no network
//   2. API keys: one HTTP GET to the QA project's REST root with each key;
//      only the status code is shown (never a key or a response body)
//   3. database: connects through the guard with the session forced
//      read-only by the server (default_transaction_read_only=on) and runs
//      scripts/qa/sql/preflight.sql — SELECT statements only, in a READ
//      ONLY transaction that is rolled back
// Writes nothing anywhere.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadQaConfig, DEFAULT_ENV_FILE } from "./guard.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const i = argv.indexOf("--env");
const envFile = i >= 0 ? argv[i + 1] : (process.env.ELF_QA_ENV_FILE || DEFAULT_ENV_FILE);

const result = loadQaConfig(envFile);
for (const w of result.warnings ?? []) console.log(`WARN  ${w}`);
if (!result.ok) {
  for (const e of result.errors) console.log(`REFUSED  ${e}`);
  process.exit(1);
}
const s = result.summary;
console.log(`GUARD  OK  mode=${s.mode} project=${s.ref} db=${s.dbKind} host=${s.dbHost} user=${s.dbUser} database=${s.dbName}`);

let failed = false;
if (s.mode === "qa") {
  for (const [name, key] of [["service key", result.cfg.QA_SERVICE_ROLE_KEY], ["anon key", result.cfg.QA_ANON_KEY]]) {
    try {
      const headers = { apikey: key };
      if (!key.startsWith("sb_")) headers.Authorization = `Bearer ${key}`;
      // A read of a table that doesn't exist: a key the project accepts gets
      // PostgREST's "table not found" (404 PGRST205); a rejected key gets 401.
      // (The schema root /rest/v1/ itself may be restricted to the service key.)
      const res = await fetch(`${result.cfg.QA_SUPABASE_URL}/rest/v1/elf_qa_preflight_probe?select=1&limit=1`, { method: "GET", headers });
      let code = "";
      try { code = String((await res.json())?.code ?? ""); } catch { /* no JSON body */ }
      const ok = res.status === 404 && code === "PGRST205";
      if (!ok) failed = true;
      console.log(`API    ${ok ? "OK  " : "FAIL"}  ${name}: ${new URL(result.cfg.QA_SUPABASE_URL).host} answered HTTP ${res.status}${code ? ` ${code}` : ""}${ok ? " (key valid; probe table absent as expected)" : ""}`);
    } catch {
      failed = true;
      console.log(`API    FAIL  ${name}: the QA API could not be reached`);
    }
  }
}

const r = spawnSync(process.execPath, [join(HERE, "guard.mjs"), "psql", "--env", envFile, "--",
  "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-f", join(HERE, "sql", "preflight.sql")], {
  env: { ...process.env, PGOPTIONS: "-c default_transaction_read_only=on -c statement_timeout=15000", PGCONNECT_TIMEOUT: "15" },
  encoding: "utf8",
});
const lines = (r.stdout || "").split(/\r?\n/).filter(Boolean);
if (r.status !== 0) {
  failed = true;
  // psql errors are connection/permission messages; strip anything URL-like defensively.
  const err = (r.stderr || "").split(/\r?\n/).filter(l => l && !l.startsWith("OK  ")).map(l => l.replace(/postgres(ql)?:\/\/\S+/g, "<url>"));
  console.log(`DB     FAIL  ${err.slice(0, 4).join(" | ") || `psql exit ${r.status}`}`);
} else {
  for (const l of lines) console.log(`DB     ${l}`);
}
console.log(failed ? "PREFLIGHT FAILED" : "PREFLIGHT PASSED (read-only; nothing was written)");
process.exit(failed ? 1 : 0);
