#!/usr/bin/env node
// ELF QA guard — the ONLY way the QA scripts reach a database.
//
// Every SQL command the QA scripts run goes through `guard.mjs psql`, which
// first validates the whole QA configuration and refuses anything that is
// not the QA Supabase project. It never prints a secret: the database
// password and keys stay in the config file and in the child process's
// environment.
//
//   node scripts/qa/guard.mjs check [--env FILE]
//   node scripts/qa/guard.mjs psql  [--env FILE] -- <psql arguments>
//
// The config file lives OUTSIDE every repository (default
// %USERPROFILE%\.elf-qa\qa.env). See scripts/qa/qa.env.example.
//
// Two modes:
//   qa              (default) the Supabase QA project. Only project ref
//                   mzsvbxosoidwhntpjdkf is accepted; the production ref is
//                   rejected wherever it appears.
//   local-rehearsal a disposable local PostgreSQL (localhost only, no
//                   Supabase URL or keys allowed) used to rehearse the install.
import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const QA_PROJECT_REF = "mzsvbxosoidwhntpjdkf";
export const DENIED_PROJECT_REFS = ["nggabucgcoaffpppchsp"]; // production — NEVER
export const QA_REGION = "us-east-2";
export const LOCAL_REHEARSAL_REF = "local-rehearsal";
export const DEFAULT_ENV_FILE = join(homedir(), ".elf-qa", "qa.env");

const REQUIRED = {
  qa: ["ELF_QA_MODE", "QA_PROJECT_REF", "QA_SUPABASE_URL", "QA_SERVICE_ROLE_KEY", "QA_ANON_KEY", "QA_DB_URL"],
  "local-rehearsal": ["ELF_QA_MODE", "QA_PROJECT_REF", "QA_DB_URL"],
};

/** Parses KEY=VALUE lines (optional quotes, # comments). */
export function parseEnvFile(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[line.slice(0, i).trim()] = v;
  }
  return out;
}

/** True if p is inside a git repository or under C:\Projects (worktrees). */
export function isInsideRepository(p) {
  const abs = resolve(p);
  if (/^[a-z]:[\\/]projects([\\/]|$)/i.test(abs)) return true;
  let dir = dirname(abs);
  for (;;) {
    if (existsSync(join(dir, ".git"))) return true;
    const parent = dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
}

function decodeJwtPayload(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  } catch {
    return null;
  }
}

/** A Supabase API key: legacy JWT keys carry the project ref and role and
 *  are checked offline; new sb_secret_/sb_publishable_ keys don't, so they
 *  are flagged for the connect-time check (installer step 1). */
export function checkKey(name, key, ref, role) {
  if (!key) return { ok: false, error: `${name} is missing` };
  const payload = decodeJwtPayload(key);
  if (payload) {
    if (payload.ref !== ref) return { ok: false, error: `${name} belongs to a different project (ref mismatch)` };
    if (payload.role !== role) return { ok: false, error: `${name} is not the ${role} key` };
    return { ok: true, verified: "jwt-ref" };
  }
  const prefix = role === "service_role" ? "sb_secret_" : "sb_publishable_";
  if (key.startsWith(prefix)) return { ok: true, verified: "unverifiable-offline" };
  return { ok: false, error: `${name} is not a recognisable Supabase ${role} key` };
}

/** Validates a postgres connection URL for the mode. Returns host parts
 *  without the password. */
export function checkDbUrl(dbUrl, mode, ref) {
  let u;
  try { u = new URL(dbUrl); } catch { return { ok: false, error: "QA_DB_URL is not a valid URL" }; }
  if (u.protocol !== "postgresql:" && u.protocol !== "postgres:") return { ok: false, error: "QA_DB_URL must be a postgresql:// URL" };
  const host = u.hostname.toLowerCase();
  const user = decodeURIComponent(u.username);
  const database = decodeURIComponent(u.pathname.replace(/^\//, ""));
  const port = Number(u.port || 5432);
  if (mode === "local-rehearsal") {
    if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") return { ok: false, error: "local-rehearsal only allows a localhost database" };
    if (port === 5432) return { ok: false, error: "local-rehearsal must use a dedicated port, not 5432" };
    return { ok: true, host, port, user, database, kind: "local", ssl: false };
  }
  if (port !== 5432) return { ok: false, error: "QA_DB_URL must use port 5432 (direct or session pooler); the transaction pooler (6543) can't run migrations" };
  if (database !== "postgres") return { ok: false, error: "QA_DB_URL must target the 'postgres' database" };
  if (host === `db.${ref}.supabase.co`) {
    if (user !== "postgres") return { ok: false, error: "the direct connection must use the 'postgres' user" };
    return { ok: true, host, port, user, database, kind: "direct", ssl: true };
  }
  if (/^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(host)) {
    if (!host.includes(`-${QA_REGION}.`)) return { ok: false, error: `the pooler host must be in the QA region (${QA_REGION})` };
    if (user !== `postgres.${ref}`) return { ok: false, error: "the pooler user must be postgres.<QA project ref>" };
    return { ok: true, host, port, user, database, kind: "session-pooler", ssl: true };
  }
  return { ok: false, error: "QA_DB_URL host is not the QA project's database or its regional pooler" };
}

/** Validates a whole QA configuration. Never returns secret values. */
export function validateQaConfig(cfg, { envFilePath } = {}) {
  const errors = [];
  const warnings = [];
  const mode = cfg.ELF_QA_MODE;
  if (mode !== "qa" && mode !== "local-rehearsal") {
    return { ok: false, errors: ["ELF_QA_MODE must be 'qa' or 'local-rehearsal'"], warnings };
  }
  for (const k of REQUIRED[mode]) if (!cfg[k]) errors.push(`${k} is missing`);

  // The production project must not appear ANYWHERE in the file.
  for (const [k, v] of Object.entries(cfg)) {
    for (const denied of DENIED_PROJECT_REFS) {
      if (String(v).toLowerCase().includes(denied) || k.toLowerCase().includes(denied)) {
        errors.push(`${k} refers to the PRODUCTION project — refused`);
      }
    }
  }
  if (envFilePath && isInsideRepository(envFilePath)) errors.push("the QA config file must live outside every repository (e.g. %USERPROFILE%\\.elf-qa\\qa.env)");

  const ref = cfg.QA_PROJECT_REF;
  let db = null;
  if (mode === "qa") {
    if (ref !== QA_PROJECT_REF) errors.push(`QA_PROJECT_REF must be exactly ${QA_PROJECT_REF}`);
    if (cfg.QA_SUPABASE_URL) {
      let u = null;
      try { u = new URL(cfg.QA_SUPABASE_URL); } catch { errors.push("QA_SUPABASE_URL is not a valid URL"); }
      if (u) {
        if (u.protocol !== "https:") errors.push("QA_SUPABASE_URL must be https");
        if (u.hostname.toLowerCase() !== `${QA_PROJECT_REF}.supabase.co`) errors.push(`QA_SUPABASE_URL must be https://${QA_PROJECT_REF}.supabase.co`);
        if (u.pathname !== "/" && u.pathname !== "") errors.push("QA_SUPABASE_URL must not have a path");
      }
    }
    for (const [name, role] of [["QA_SERVICE_ROLE_KEY", "service_role"], ["QA_ANON_KEY", "anon"]]) {
      if (!cfg[name]) continue;
      const r = checkKey(name, cfg[name], QA_PROJECT_REF, role);
      if (!r.ok) errors.push(r.error);
      else if (r.verified === "unverifiable-offline") warnings.push(`${name} is a new-format key; its project is verified at connect time`);
    }
  } else {
    if (ref !== LOCAL_REHEARSAL_REF) errors.push(`local-rehearsal requires QA_PROJECT_REF=${LOCAL_REHEARSAL_REF}`);
    for (const k of ["QA_SUPABASE_URL", "QA_SERVICE_ROLE_KEY", "QA_ANON_KEY"]) {
      if (cfg[k]) errors.push(`${k} must not be set in local-rehearsal (no cloud access)`);
    }
  }
  if (cfg.QA_DB_URL) {
    const r = checkDbUrl(cfg.QA_DB_URL, mode, ref);
    if (!r.ok) errors.push(r.error); else db = r;
  }
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary: errors.length === 0 ? { mode, ref, dbKind: db.kind, dbHost: db.host, dbUser: db.user, dbName: db.database } : null,
    db,
  };
}

export function loadQaConfig(envFile = process.env.ELF_QA_ENV_FILE || DEFAULT_ENV_FILE) {
  if (!existsSync(envFile) || !statSync(envFile).isFile()) {
    return { ok: false, errors: [`QA config file not found: ${envFile}`], warnings: [] };
  }
  const cfg = parseEnvFile(readFileSync(envFile, "utf8"));
  return { ...validateQaConfig(cfg, { envFilePath: envFile }), cfg };
}

function argEnvFile(argv) {
  const i = argv.indexOf("--env");
  return i >= 0 ? argv[i + 1] : undefined;
}

function report(result) {
  for (const w of result.warnings ?? []) console.error(`WARN  ${w}`);
  if (!result.ok) {
    for (const e of result.errors) console.error(`REFUSED  ${e}`);
    return false;
  }
  const s = result.summary;
  console.error(`OK  mode=${s.mode} project=${s.ref} db=${s.dbKind} host=${s.dbHost} user=${s.dbUser} database=${s.dbName}`);
  return true;
}

function main(argv) {
  const cmd = argv[0];
  const envFile = argEnvFile(argv) ?? process.env.ELF_QA_ENV_FILE ?? DEFAULT_ENV_FILE;
  const result = loadQaConfig(envFile);
  if (cmd === "check") return report(result) ? 0 : 1;
  // Mode and project ref only (no secrets), for the shell scripts.
  if (cmd === "summary") {
    if (!report(result)) return 1;
    process.stdout.write(`${result.summary.mode} ${result.summary.ref}
`);
    return 0;
  }
  if (cmd === "psql") {
    if (!report(result)) return 1;
    const sep2 = argv.indexOf("--");
    const psqlArgs = sep2 >= 0 ? argv.slice(sep2 + 1) : [];
    const u = new URL(result.cfg.QA_DB_URL);
    const env = {
      ...process.env,
      PGHOST: result.db.host,
      PGPORT: String(result.db.port),
      PGUSER: result.db.user,
      PGDATABASE: result.db.database,
      PGPASSWORD: decodeURIComponent(u.password),
      PGSSLMODE: result.db.ssl ? "require" : "disable",
      PGCLIENTENCODING: "UTF8",
      PGAPPNAME: "elf-qa-install",
    };
    // Nothing else may pick a different server.
    for (const k of ["PGSERVICE", "PGSERVICEFILE", "DATABASE_URL", "PGHOSTADDR"]) delete env[k];
    const r = spawnSync("psql", ["-X", ...psqlArgs], { env, stdio: "inherit" });
    return r.status ?? 1;
  }
  console.error("usage: guard.mjs check|summary|psql [--env FILE] [-- psql args]");
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exit(main(process.argv.slice(2)));
}
