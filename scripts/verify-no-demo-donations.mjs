#!/usr/bin/env node
// Real browser verification for the "remove demo donation activity" cleanup
// — checks actual rendered DOM (not source code) for both the Recent
// Donations and Leaderboard sections, across classic and premium layouts,
// on a genuinely empty campaign and one with real data, at both a mobile
// and a desktop viewport.
//
// Creates and cleans up its own disposable campaign/athlete/donation
// fixtures. Does not touch any real campaign data.
//
// Usage:
//   npm install --no-save playwright   (ad hoc, not a project dependency)
//   npx playwright install chromium    (if not already installed)
//   npm run dev                        (in another terminal)
//   node scripts/verify-no-demo-donations.mjs

import { readFileSync } from "node:fs";
import { chromium } from "playwright";

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

function sh(extra = {}) {
  return { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, "Content-Type": "application/json", ...extra };
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
function assert(label, cond, extra = "") {
  if (cond) console.log(`    PASS  ${label}`);
  else { console.log(`    FAIL  ${label}${extra ? " — " + extra : ""}`); failures++; }
}

const FAKE_NAMES = ["Robert T.", "Sarah K.", "Mike & Janet L.", "Coach R.", "Marcus Johnson", "Aaliyah Rivera", "Tyler Chen", "Sofia Martinez", "Devon Williams"];

const emptySlug = `demoaudit-empty-${Date.now().toString(36)}`;
const realSlug  = `demoaudit-real-${Date.now().toString(36)}`;
const created = { campaigns: [], athletes: [], donations: [] };

async function cleanup() {
  console.log("\nCleaning up fixtures...");
  for (const slug of [emptySlug, realSlug]) {
    await restDelete(`donations?campaign_slug=eq.${slug}`);
    await restDelete(`athletes?campaign_slug=eq.${slug}`);
    await restDelete(`campaign_settings?campaign_slug=eq.${slug}`);
  }
  console.log("Cleanup done.");
}

async function checkPage(browser, url, viewport, label) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const resp = await page.goto(url, { waitUntil: "networkidle" });
  console.log(`\n  ${label} (${viewport.width}x${viewport.height}) — ${url}`);
  assert("page loads 200", resp.status() === 200, `got ${resp.status()}`);

  const bodyText = await page.evaluate(() => document.body.innerText);
  for (const name of FAKE_NAMES) {
    assert(`no fake name "${name}" anywhere on page`, !bodyText.includes(name));
  }
  await context.close();
  return bodyText;
}

async function main() {
  console.log(`Fixture campaigns: ${emptySlug} (empty), ${realSlug} (real data)\n`);

  // ── Empty campaign: no athletes, no donations ───────────────────────────
  await restInsert("campaign_settings", { campaign_slug: emptySlug, school_name: "Demo Audit Empty School", sport_name: "Soccer", mascot: "Falcons", layout_variant: "classic" });
  created.campaigns.push(emptySlug);

  // ── Real-data campaign: 1 athlete, 1 donation, premium layout ──────────
  await restInsert("campaign_settings", { campaign_slug: realSlug, school_name: "Demo Audit Real School", sport_name: "Soccer", mascot: "Hawks", layout_variant: "premium" });
  created.campaigns.push(realSlug);
  const athlete = await restInsert("athletes", { campaign_slug: realSlug, name: "Real Fixture Athlete", event: "Forward", class_year: "Senior" });
  created.athletes.push(athlete.id);
  await restInsert("donations", {
    campaign_slug: realSlug, athlete_id: athlete.id, athlete_name: athlete.name,
    donor_name: "Genuine Fixture Donor", amount_cents: 4200, donation_message: "Go get 'em!",
    stripe_session_id: `fixture_${Date.now()}`,
  });

  const browser = await chromium.launch();
  const desktop = { width: 1400, height: 900 };
  const mobile  = { width: 390, height: 844 };

  try {
    // ── 1. Empty campaign, classic layout, desktop + mobile ─────────────
    for (const [vp, label] of [[desktop, "Empty campaign — desktop"], [mobile, "Empty campaign — mobile"]]) {
      const text = await checkPage(browser, `${APP_BASE}/campaign/${emptySlug}`, vp, label);
      assert('"No donations yet" empty state shown', text.includes("No donations yet"));
      assert('"Be the first to support the Falcons." shown (dynamic mascot)', text.includes("Be the first to support the Falcons"));
      assert('"No athletes added yet" empty state shown', text.includes("No athletes added yet"));
      assert('"Athletes will appear here once the roster is added." shown', text.includes("Athletes will appear here once the roster is added"));
    }

    // ── 2. Real-data campaign, premium layout, desktop + mobile ─────────
    for (const [vp, label] of [[desktop, "Real-data campaign — desktop"], [mobile, "Real-data campaign — mobile"]]) {
      const text = await checkPage(browser, `${APP_BASE}/campaign/${realSlug}`, vp, label);
      assert("real donor name renders", text.includes("Genuine Fixture Donor"));
      assert("real athlete name renders in leaderboard", text.includes("Real Fixture Athlete"));
      assert('empty-state donation copy does NOT show (real data present)', !text.includes("No donations yet"));
      assert('empty-state roster copy does NOT show (real data present)', !text.includes("No athletes added yet"));
    }
  } finally {
    await browser.close();
  }

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
