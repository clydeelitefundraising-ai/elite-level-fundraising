#!/usr/bin/env node
// One-time bulk roster import for Monroe Valley High School Track and Field,
// 2027 Season (campaign_slug: monroe-valley-track-and-field-2027).
//
// The app has no separate "team membership" or "fundraiser participant"
// table — a row in `athletes` (scoped by campaign_slug) IS simultaneously
// the team roster entry and the fundraiser participant. So each athlete
// below requires exactly one write, made through the real, existing
// POST /api/admin/athletes route (same validation + insert + audit-log
// path a human admin uses in the UI) — nothing is bypassed.
//
// Idempotency: before creating anything, the script reads all existing
// athletes for this campaign and matches by normalized "first last" name.
// Matches are left completely untouched (never patched/overwritten), even
// if their event/class differ from this roster — existing Monroe data is
// never modified by this script.
//
// There is no `gender` column in the schema (confirmed during discovery,
// user chose not to add one) — gender is validated and reported here but
// never persisted to the database.
//
// Usage:
//   1. Set ADMIN_PASSWORD (and ADMIN_PEPPER) in .env.local, `npm run dev`.
//   2. Dry run (no writes):  node scripts/import-monroe-track-roster.mjs --dry-run
//   3. Real import:          node scripts/import-monroe-track-roster.mjs
//   Optional: APP_BASE=http://localhost:3000 (default) to point at a different origin.

import { readFileSync } from "node:fs";

function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const env = loadEnv(new URL("../.env.local", import.meta.url));
const SUPA_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PASSWORD = env.ADMIN_PASSWORD;
const APP_BASE = process.env.APP_BASE || "http://localhost:3000";
const DRY_RUN = process.argv.includes("--dry-run");

if (!SUPA_URL || !SUPA_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const TARGET_SLUG = "monroe-valley-track-and-field-2027";
const EXPECTED = { school_name: "Monroe Valley High School", sport_name: "Track and Field", season: "2027 Season" };

const EVENT_GROUPS = ["Sprints", "Distance", "Jumps", "Throws", "Hurdles"];
const CLASS_OPTIONS = ["Freshman", "Sophomore", "Junior", "Senior"];
const GENDERS = ["Boys", "Girls"];

// ── Roster data ──────────────────────────────────────────────────────────
const ROSTER = [
  ["Ethan","Carter","Boys","Sprints","Freshman"],["Mason","Brooks","Boys","Sprints","Sophomore"],
  ["Noah","Bennett","Boys","Sprints","Junior"],["Liam","Foster","Boys","Sprints","Senior"],
  ["Jackson","Cooper","Boys","Sprints","Sophomore"],["Lucas","Ramirez","Boys","Sprints","Junior"],
  ["Benjamin","Turner","Boys","Hurdles","Senior"],["Owen","Murphy","Boys","Hurdles","Junior"],
  ["Caleb","Price","Boys","Jumps","Sophomore"],["Logan","Hughes","Boys","Jumps","Senior"],
  ["Carter","Sanders","Boys","Jumps","Junior"],["Dylan","Perry","Boys","Jumps","Senior"],
  ["Hunter","Flores","Boys","Throws","Junior"],["Brayden","Richardson","Boys","Throws","Senior"],
  ["Gavin","Watson","Boys","Throws","Sophomore"],["Ryan","Griffin","Boys","Distance","Freshman"],
  ["Connor","Hayes","Boys","Distance","Junior"],["Austin","Jenkins","Boys","Distance","Sophomore"],
  ["Tyler","Powell","Boys","Distance","Senior"],["Nathan","Coleman","Boys","Jumps","Freshman"],
  ["Ava","Mitchell","Girls","Sprints","Freshman"],["Emma","Collins","Girls","Sprints","Sophomore"],
  ["Olivia","Diaz","Girls","Sprints","Junior"],["Sophia","Ward","Girls","Sprints","Senior"],
  ["Isabella","Bailey","Girls","Distance","Sophomore"],["Charlotte","Brooks","Girls","Distance","Junior"],
  ["Mia","Henderson","Girls","Hurdles","Senior"],["Amelia","Kim","Girls","Hurdles","Junior"],
  ["Harper","Simmons","Girls","Jumps","Sophomore"],["Evelyn","Ross","Girls","Jumps","Senior"],
  ["Abigail","Cooper","Girls","Jumps","Junior"],["Ella","Foster","Girls","Jumps","Senior"],
  ["Scarlett","Patterson","Girls","Throws","Junior"],["Grace","Hughes","Girls","Throws","Sophomore"],
  ["Chloe","Edwards","Girls","Throws","Senior"],["Lily","Peterson","Girls","Distance","Freshman"],
  ["Hannah","Gray","Girls","Distance","Junior"],["Zoey","Stewart","Girls","Sprints","Sophomore"],
  ["Natalie","Powell","Girls","Distance","Senior"],["Brooklyn","Kelly","Girls","Jumps","Freshman"],
  ["Cameron","Sullivan","Boys","Distance","Freshman"],["Jordan","Ellis","Boys","Throws","Sophomore"],
  ["Trevor","Bryant","Boys","Jumps","Junior"],["Colin","Morgan","Boys","Hurdles","Senior"],
  ["Mackenzie","Reed","Girls","Distance","Freshman"],["Sydney","Bell","Girls","Jumps","Sophomore"],
  ["Payton","Cook","Girls","Throws","Junior"],["Madelyn","Long","Girls","Hurdles","Senior"],
  ["Riley","Sanders","Girls","Sprints","Junior"],["Landon","Fisher","Boys","Hurdles","Senior"],
].map(([firstName,lastName,gender,eventGroup,className]) => ({ firstName, lastName, gender, eventGroup, className }));

function normalizeName(s) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function sbHeaders(extra = {}) {
  return { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, "Content-Type": "application/json", ...extra };
}

function validateRow(row) {
  const errors = [];
  if (!row.firstName.trim()) errors.push("missing first name");
  if (!row.lastName.trim()) errors.push("missing last name");
  if (!GENDERS.includes(row.gender)) errors.push(`invalid gender "${row.gender}"`);
  if (!EVENT_GROUPS.includes(row.eventGroup)) errors.push(`invalid event group "${row.eventGroup}"`);
  if (!CLASS_OPTIONS.includes(row.className)) errors.push(`invalid class "${row.className}"`);
  return errors;
}

async function resolveTargetCampaign() {
  const res = await fetch(
    `${SUPA_URL}/rest/v1/campaign_settings?campaign_slug=eq.${encodeURIComponent(TARGET_SLUG)}&select=campaign_slug,school_name,sport_name,season,archived,is_demo,status`,
    { headers: sbHeaders() },
  );
  if (!res.ok) throw new Error(`campaign_settings lookup failed: ${await res.text()}`);
  const rows = await res.json();
  if (rows.length !== 1) {
    throw new Error(`Expected exactly 1 campaign for slug "${TARGET_SLUG}", found ${rows.length}. Aborting — refusing to guess.`);
  }
  const c = rows[0];
  if (c.school_name !== EXPECTED.school_name || c.sport_name !== EXPECTED.sport_name || c.season !== EXPECTED.season) {
    throw new Error(
      `Campaign "${TARGET_SLUG}" does not match expected identity. ` +
      `Got school="${c.school_name}" sport="${c.sport_name}" season="${c.season}". Aborting.`,
    );
  }
  if (c.is_demo) throw new Error(`Campaign "${TARGET_SLUG}" is flagged is_demo=true. Aborting — refusing to write to a demo campaign.`);
  if (c.archived) throw new Error(`Campaign "${TARGET_SLUG}" is archived. Aborting.`);
  return c;
}

async function getExistingAthletes(slug) {
  const res = await fetch(
    `${SUPA_URL}/rest/v1/athletes?campaign_slug=eq.${encodeURIComponent(slug)}&select=id,name,event,class_year`,
    { headers: sbHeaders() },
  );
  if (!res.ok) throw new Error(`athletes lookup failed: ${await res.text()}`);
  return res.json();
}

async function adminLogin() {
  if (!ADMIN_PASSWORD) throw new Error("ADMIN_PASSWORD is not set in .env.local — required for the real import run.");
  const res = await fetch(`${APP_BASE}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: ADMIN_PASSWORD }),
  });
  if (!res.ok) throw new Error(`Admin login failed (${res.status}): ${await res.text()}`);
  const setCookie = res.headers.get("set-cookie") ?? "";
  const cookie = setCookie.match(/elf_admin=([^;]+)/)?.[1];
  if (!cookie) throw new Error(`No elf_admin cookie in login response Set-Cookie: ${setCookie}`);
  return cookie;
}

async function createAthlete(cookie, slug, row) {
  const res = await fetch(`${APP_BASE}/api/admin/athletes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `elf_admin=${cookie}` },
    body: JSON.stringify({
      campaign_slug: slug,
      name: `${row.firstName} ${row.lastName}`,
      event: row.eventGroup,
      class_year: row.className,
    }),
  });
  if (!res.ok) throw new Error(`(${res.status}) ${await res.text()}`);
  return res.json();
}

async function main() {
  console.log(`${DRY_RUN ? "[DRY RUN] " : ""}Import target: ${TARGET_SLUG}\n`);

  const campaign = await resolveTargetCampaign();
  console.log(`Resolved campaign: ${campaign.school_name} — ${campaign.sport_name} — ${campaign.season} (status=${campaign.status})\n`);

  const existing = await getExistingAthletes(TARGET_SLUG);
  const existingByName = new Map(existing.map(a => [normalizeName(a.name), a]));

  let cookie = null;
  if (!DRY_RUN) cookie = await adminLogin();

  const results = [];
  const totals = { created: 0, already_existed: 0, skipped: 0, failed: 0 };

  for (const row of ROSTER) {
    const label = `${row.firstName} ${row.lastName}`;
    const errors = validateRow(row);
    if (errors.length > 0) {
      results.push({ label, status: "failed", reason: errors.join("; ") });
      totals.failed++;
      continue;
    }

    const key = normalizeName(label);
    const match = existingByName.get(key);
    if (match) {
      results.push({
        label, status: "already_existed",
        linkedToTeam: true, linkedToFundraiser: true,
        note: `existing row has event="${match.event}" class="${match.class_year}" — left unchanged`,
      });
      totals.already_existed++;
      continue;
    }

    if (DRY_RUN) {
      results.push({ label, status: "would_create", linkedToTeam: true, linkedToFundraiser: true });
      totals.created++;
      continue;
    }

    try {
      await createAthlete(cookie, TARGET_SLUG, row);
      results.push({ label, status: "created", linkedToTeam: true, linkedToFundraiser: true });
      totals.created++;
    } catch (err) {
      results.push({ label, status: "failed", reason: err instanceof Error ? err.message : String(err) });
      totals.failed++;
    }
  }

  console.log("Row-level results:");
  for (const r of results) {
    const bits = [r.status];
    if (r.reason) bits.push(r.reason);
    if (r.note) bits.push(r.note);
    console.log(`  ${r.label.padEnd(22)} ${bits.join(" — ")}`);
  }

  console.log("\nTotals:");
  console.log(`  ${DRY_RUN ? "would create" : "created"}: ${totals.created}`);
  console.log(`  already existed:  ${totals.already_existed}`);
  console.log(`  failed:           ${totals.failed}`);
  console.log(`  total rows:       ${ROSTER.length}`);

  process.exit(totals.failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("\nFatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
