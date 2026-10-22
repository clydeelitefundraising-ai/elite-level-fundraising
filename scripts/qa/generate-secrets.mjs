#!/usr/bin/env node
// Generates NEW QA-only application secrets (never production's) into
// <secrets dir>/qa-app-secrets.env — default %USERPROFILE%\.elf-qa — for the
// QA Vercel project and for hashing the synthetic logins. Prints variable
// NAMES only, never values. Refuses to overwrite an existing file.
//
//   node scripts/qa/generate-secrets.mjs [--dir DIR]
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";
import { isInsideRepository } from "./guard.mjs";

export const QA_SECRET_NAMES = [
  "ELF_ACCOUNT_PEPPER", "TEAM_COACH_PEPPER", "TEAM_MEMBER_PEPPER", "ADMIN_PEPPER",
  "CALENDAR_SYNC_PEPPER", "CRON_SECRET", "ADMIN_PASSWORD",
];

export function generateQaSecrets() {
  const out = {};
  for (const n of QA_SECRET_NAMES) out[n] = randomBytes(32).toString("hex");
  out.COMPLETE_SEASON_PREVIEW = "true";
  return out;
}

function main(argv) {
  const i = argv.indexOf("--dir");
  const dir = i >= 0 ? argv[i + 1] : (process.env.ELF_QA_SECRETS_DIR || join(homedir(), ".elf-qa"));
  const file = join(dir, "qa-app-secrets.env");
  if (isInsideRepository(file)) { console.error("REFUSED: the secrets directory must be outside every repository"); return 1; }
  if (existsSync(file)) { console.error(`REFUSED: ${file} already exists (delete it deliberately to regenerate)`); return 1; }
  mkdirSync(dir, { recursive: true });
  const s = generateQaSecrets();
  const body = [
    "# ELF QA application secrets — QA ONLY. Generated locally; never production's.",
    "# Enter these in the QA Vercel project (elf-team-qa). Do not commit or share.",
    ...Object.entries(s).map(([k, v]) => `${k}=${v}`),
    "",
  ].join("\n");
  writeFileSync(file, body, { mode: 0o600 });
  console.error(`wrote ${file}: ${Object.keys(s).join(", ")} (values not shown)`);
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith("generate-secrets.mjs")) process.exit(main(process.argv.slice(2)));
