#!/usr/bin/env node
// Generates the password variables for scripts/qa/sql/seed.sql:
//   <secrets dir>/seed-vars.sql   psql \set lines: salts + hashes only
//   <secrets dir>/qa-logins.txt   the synthetic logins (email + password)
// Passwords are new random values; hashes use the QA secrets in
// <secrets dir>/qa-app-secrets.env exactly as the app hashes them
// (src/lib/accountAuth.ts, src/lib/teamAuth.ts), so these logins work only
// in the QA app. Both files stay outside the repository; nothing is printed.
//
//   node scripts/qa/generate-seed-vars.mjs [--dir DIR]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createHash, randomBytes } from "node:crypto";
import { isInsideRepository, parseEnvFile } from "./guard.mjs";

// [code, email, role description] — must match seed.sql.
export const SEED_ACCOUNTS = [
  ["qa_admin",      "qa.admin@example.test",        "Platform admin"],
  ["lions_head",    "lions.head@example.test",      "Lions Head Coach (also a parent)"],
  ["lions_asst",    "lions.assistant@example.test", "Lions Assistant Coach"],
  ["lions_booster", "lions.booster@example.test",   "Lions booster (coach record)"],
  ["lions_jo",      "jo.junior@example.test",       "Lions athlete, Junior -> Senior"],
  ["lions_sam",     "sam.senior@example.test",      "Lions athlete, graduating Senior"],
  ["lions_pat",     "pat.mixed@example.test",       "Lions parent: one graduating, one returning child"],
  ["lions_two",     "tess.two@example.test",        "Lions parent of two returning athletes"],
  ["lions_gil",     "gil.graduating@example.test",  "Lions parent of a graduating athlete only"],
  ["lions_bay",     "bay.booster@example.test",     "Lions booster (member record)"],
  ["bears_head",    "bears.head@example.test",      "Bears Head Coach (preview blockers)"],
  ["bears_ben",     "ben.bear@example.test",        "Bears athlete"],
  ["bears_req",     "new.kid@example.test",         "Bears pending athlete request"],
  ["bears_par",     "new.parent@example.test",      "Bears pending parent request"],
  ["owls_head",     "owls.head@example.test",       "Owls Head Coach (name/address must be entered)"],
  ["hawks_head",    "hawks.head@example.test",      "Hawks Head Coach (completed season)"],
  ["hawks_hank",    "hank.hawk@example.test",       "Hawks athlete"],
  ["hawks_del",     "delete.me@example.test",       "Hawks parent — use for the account-deletion test"],
];

const sha256 = s => createHash("sha256").update(s).digest("hex");
const password = () => randomBytes(12).toString("base64url");
const salt = () => randomBytes(16).toString("hex");

export function buildSeedVars(secrets) {
  if (!secrets.ELF_ACCOUNT_PEPPER || !secrets.TEAM_COACH_PEPPER) throw new Error("QA secrets missing ELF_ACCOUNT_PEPPER / TEAM_COACH_PEPPER");
  const vars = [];
  const logins = [];
  for (const [code, email, what] of SEED_ACCOUNTS) {
    const pw = password(), s = salt();
    vars.push(`\\set s_${code} '${s}'`, `\\set h_${code} '${sha256(pw + s + secrets.ELF_ACCOUNT_PEPPER)}'`);
    logins.push(`${email}\t${pw}\t${what}`);
  }
  // The legacy team-login coach: same email and password on two teams.
  const legacyPw = password();
  for (const team of ["lions", "owls"]) {
    const s = salt();
    vars.push(`\\set s_legacy_${team} '${s}'`, `\\set h_legacy_${team} '${sha256(legacyPw + s + secrets.TEAM_COACH_PEPPER)}'`);
  }
  logins.push(`legacy.coach@example.test\t${legacyPw}\tLegacy team login (Coach Sign In) — same password on Lions and Owls`);
  return { vars: vars.join("\n") + "\n", logins: logins.join("\n") + "\n" };
}

function main(argv) {
  const i = argv.indexOf("--dir");
  const dir = i >= 0 ? argv[i + 1] : (process.env.ELF_QA_SECRETS_DIR || join(homedir(), ".elf-qa"));
  const secretsFile = join(dir, "qa-app-secrets.env");
  const varsFile = join(dir, "seed-vars.sql");
  const loginsFile = join(dir, "qa-logins.txt");
  if (isInsideRepository(varsFile)) { console.error("REFUSED: the secrets directory must be outside every repository"); return 1; }
  if (!existsSync(secretsFile)) { console.error(`missing ${secretsFile} — run generate-secrets.mjs first`); return 1; }
  if (existsSync(varsFile) || existsSync(loginsFile)) { console.error("REFUSED: seed-vars.sql / qa-logins.txt already exist (delete both deliberately to regenerate)"); return 1; }
  const { vars, logins } = buildSeedVars(parseEnvFile(readFileSync(secretsFile, "utf8")));
  writeFileSync(varsFile, "-- QA seed password variables (salts + hashes). QA only. Do not commit.\n" + vars, { mode: 0o600 });
  writeFileSync(loginsFile, "# ELF QA synthetic logins — QA only. Do not commit or share outside QA.\n# email\tpassword\trole\n" + logins, { mode: 0o600 });
  console.error(`wrote ${varsFile} and ${loginsFile} (${SEED_ACCOUNTS.length + 1} logins; values not shown)`);
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith("generate-seed-vars.mjs")) process.exit(main(process.argv.slice(2)));
