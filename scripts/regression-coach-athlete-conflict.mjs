#!/usr/bin/env node
// Regression test for the Michael Owens incident: a coach's own account must
// never be allowed to claim an athlete profile on the same campaign — that
// silently shadows their coach identity (getActorForAccount's documented
// member-wins-over-coach precedence) and locks them out of every staff
// feature with no error anywhere in the UI.
//
// This repo has no test framework (no jest/vitest/playwright configured) —
// this is a self-contained, runnable integration script against a live
// Supabase project + a running Next.js server, following the same
// verification approach used throughout this sprint. It creates fully
// disposable fixtures (its own campaign/coach/athlete) and cleans up
// everything itself, including on failure.
//
// Deliberately obtains its session cookie via the real HTTP join endpoint
// rather than hand-computing a password hash client-side — keeps the test
// decoupled from the account-password hashing implementation entirely.
//
// Usage:
//   1. `npm run dev` in one terminal (defaults to http://localhost:3000)
//   2. `node scripts/regression-coach-athlete-conflict.mjs` in another
//   Requires .env.local to have NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.

import { readFileSync } from "node:fs";
import { randomUUID, randomBytes } from "node:crypto";

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
const APP_BASE = process.env.APP_BASE || "http://localhost:3000";

if (!SUPA_URL || !SUPA_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

function sh(extra = {}) {
  return { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, "Content-Type": "application/json", ...extra };
}
async function restGet(path) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, { headers: sh() });
  return res.ok ? res.json() : [];
}
async function restInsert(path, body) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    method: "POST", headers: sh({ Prefer: "return=representation" }), body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`insert ${path} failed: ${await res.text()}`);
  return (await res.json())[0];
}
async function restDelete(path) {
  await fetch(`${SUPA_URL}/rest/v1/${path}`, { method: "DELETE", headers: sh({ Prefer: "return=minimal" }) });
}

let failures = 0;
function assert(label, cond) {
  if (cond) console.log(`  PASS  ${label}`);
  else { console.log(`  FAIL  ${label}`); failures++; }
}

const slug = `regtest-coachclaim-${Date.now().toString(36)}`;
const coachEmail = `regtest-coach-${Date.now()}@example.com`;
let campaignCreated = false, coachAccountId = null, coachRowId = null, athleteId = null, joinCodeId = null;

async function cleanup() {
  console.log("\nCleaning up fixtures...");
  await restDelete(`team_members?campaign_slug=eq.${slug}`);
  if (joinCodeId) await restDelete(`team_join_codes?id=eq.${joinCodeId}`);
  if (coachRowId) await restDelete(`team_coaches?id=eq.${coachRowId}`);
  if (athleteId) await restDelete(`athletes?id=eq.${athleteId}`);
  if (coachAccountId) await restDelete(`elf_accounts?id=eq.${coachAccountId}`);
  if (campaignCreated) await restDelete(`campaign_settings?campaign_slug=eq.${slug}`);
  console.log("Cleanup done.");
}

async function main() {
  console.log(`Fixture campaign: ${slug}\n`);

  // ── Set up disposable fixtures ──────────────────────────────────────────
  await restInsert("campaign_settings", { campaign_slug: slug, school_name: "Regression Test School", sport_name: "Baseball" });
  campaignCreated = true;

  const athlete = await restInsert("athletes", { campaign_slug: slug, name: "Regression Test Athlete", event: "SS", class_year: "Senior" });
  athleteId = athlete.id;

  const code = "RT" + randomUUID().slice(0, 6).toUpperCase();
  const joinCode = await restInsert("team_join_codes", { campaign_slug: slug, code });
  joinCodeId = joinCode.id;

  // Create the coach's elf_account (and get a real elf_session cookie) via
  // the actual join endpoint, as a throwaway "booster" role — this avoids
  // needing to replicate the app's password-hashing scheme client-side.
  const bootstrapRes = await fetch(`${APP_BASE}/api/auth/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, name: "Regression Test Coach", email: coachEmail, password: "regtestpass123", role: "booster" }),
  });
  if (!bootstrapRes.ok) throw new Error(`bootstrap join failed: ${await bootstrapRes.text()}`);
  const setCookie = bootstrapRes.headers.get("set-cookie") ?? "";
  const sessionCookie = setCookie.match(/elf_session=([^;]+)/)?.[1];
  if (!sessionCookie) throw new Error(`no elf_session in Set-Cookie: ${setCookie}`);

  const acctRows = await restGet(`elf_accounts?email=eq.${coachEmail}&select=id`);
  coachAccountId = acctRows[0].id;

  // Remove the throwaway booster team_members row the bootstrap join created
  // — we only wanted the account + session, not a booster membership (a
  // booster IS staff, which would mask the exact bug this test targets).
  await restDelete(`team_members?campaign_slug=eq.${slug}&account_id=eq.${coachAccountId}`);

  // Now link this account as a real head coach — matching campaign
  // provisioning's actual data shape (team_coaches only, no team_members).
  const coachRow = await restInsert("team_coaches", {
    campaign_slug: slug, name: "Regression Test Coach", email: coachEmail, role: "head_coach",
    account_id: coachAccountId, password_hash: "unused", salt: randomBytes(16).toString("hex"),
  });
  coachRowId = coachRow.id;

  // ── Scenario: coach already logged in, follows the join link, selects athlete ──
  console.log("Scenario: existing head coach follows join link, selects athlete role\n");

  const res = await fetch(`${APP_BASE}/api/auth/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `elf_session=${sessionCookie}` },
    body: JSON.stringify({ code, name: "Regression Test Coach", role: "athlete", athlete_id: athleteId }),
  });
  const body = await res.json();

  assert("request rejected with 409", res.status === 409);
  assert("error message explains coach can't claim athlete", /coach/i.test(body.error ?? "") && /athlete/i.test(body.error ?? ""));

  const membersAfter = await restGet(`team_members?campaign_slug=eq.${slug}&select=id`);
  assert("zero team_members rows created for this campaign", membersAfter.length === 0);

  const coachRowsAfter = await restGet(`team_coaches?id=eq.${coachRowId}&select=id,role,account_id`);
  assert("coach row still exists, unchanged", coachRowsAfter.length === 1 && coachRowsAfter[0].role === "head_coach" && coachRowsAfter[0].account_id === coachAccountId);

  const athleteClaimAfter = await restGet(`team_members?athlete_id=eq.${athleteId}&select=id`);
  assert("target athlete remains unclaimed", athleteClaimAfter.length === 0);

  // ── Sanity: coach permissions still resolve correctly after the rejection ──
  const joinCodesRes = await fetch(`${APP_BASE}/api/team/${slug}/join-codes`, {
    headers: { Cookie: `elf_session=${sessionCookie}` },
  });
  assert("coach can still access staff-only route (join-codes) after rejection", joinCodesRes.status === 200);

  console.log(failures === 0 ? "\nAll assertions passed.\n" : `\n${failures} assertion(s) FAILED.\n`);
}

try {
  await main();
} catch (err) {
  console.error("Script error:", err);
  failures++;
} finally {
  await cleanup();
}

process.exit(failures > 0 ? 1 : 0);
