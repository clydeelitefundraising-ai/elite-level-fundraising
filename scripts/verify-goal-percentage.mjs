#!/usr/bin/env node
// Real browser verification for the zero-goal percentage fix — checks
// actual rendered DOM text for NaN/Infinity/negative-still-needed across
// every goal scenario, both layouts, both viewport classes. Creates and
// cleans up its own disposable campaign fixtures; touches no real data.
//
// Usage:
//   npm install --no-save playwright   (ad hoc, not a project dependency)
//   npm run dev                        (in another terminal)
//   node scripts/verify-goal-percentage.mjs

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

const BAD_TOKENS = ["NaN", "Infinity", "-Infinity"];

const scenarios = [
  { key: "goal-zero",       slug: `goalcheck-zero-${Date.now().toString(36)}`,      goal_cents: 0,      layout: "classic",  donation: 0    },
  { key: "goal-missing",    slug: `goalcheck-null-${Date.now().toString(36)}`,      goal_cents: undefined, layout: "premium", donation: 0  },
  { key: "goal-no-donations", slug: `goalcheck-nodon-${Date.now().toString(36)}`,   goal_cents: 100000, layout: "classic",  donation: 0    },
  { key: "goal-partial",    slug: `goalcheck-partial-${Date.now().toString(36)}`,   goal_cents: 100000, layout: "premium",  donation: 25000 },
  { key: "goal-overfunded", slug: `goalcheck-over-${Date.now().toString(36)}`,      goal_cents: 10000,  layout: "classic",  donation: 15000 },
];

const created = [];

async function cleanup() {
  console.log("\nCleaning up fixtures...");
  for (const s of scenarios) {
    await restDelete(`donations?campaign_slug=eq.${s.slug}`);
    await restDelete(`campaign_settings?campaign_slug=eq.${s.slug}`);
  }
  console.log("Cleanup done.");
}

async function checkPage(browser, url, viewport, label) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const resp = await page.goto(url, { waitUntil: "networkidle" });
  console.log(`\n  ${label} (${viewport.width}x${viewport.height})`);
  assert("page loads 200", resp.status() === 200, `got ${resp.status()}`);

  const bodyText = await page.evaluate(() => document.body.innerText);
  for (const tok of BAD_TOKENS) {
    assert(`no "${tok}" anywhere on page`, !bodyText.includes(tok));
  }
  // No literal negative-dollar "still needed" text either (e.g. "$-75 still needed")
  assert('no negative "$-" still-needed text', !/\$-\d/.test(bodyText));

  // Progress bar width, if present, must be a finite, valid CSS percentage.
  const badWidths = await page.evaluate(() => {
    const fills = Array.from(document.querySelectorAll('[class*="progress-fill"], [class*="fill"]'));
    return fills
      .map((el) => getComputedStyle(el).width)
      .filter((w) => w === "" || w === "NaNpx" || w.includes("NaN") || w.includes("Infinity"));
  });
  assert("no invalid computed progress-bar width", badWidths.length === 0, JSON.stringify(badWidths));

  await context.close();
  return bodyText;
}

async function main() {
  console.log("Fixture campaigns:", scenarios.map(s => s.slug).join(", "), "\n");

  for (const s of scenarios) {
    await restInsert("campaign_settings", {
      campaign_slug: s.slug, school_name: `Goal Check ${s.key}`, sport_name: "Soccer",
      mascot: "Wolves", layout_variant: s.layout, goal_cents: s.goal_cents,
    });
    created.push(s.slug);
    if (s.donation > 0) {
      await restInsert("donations", {
        campaign_slug: s.slug, donor_name: "Goal Check Donor", amount_cents: s.donation,
        donation_message: "test", stripe_session_id: `goalcheck_${s.key}_${Date.now()}`,
      });
    }
  }

  const browser = await chromium.launch();
  const desktop = { width: 1400, height: 1000 };
  const mobile  = { width: 390, height: 844 };

  try {
    for (const s of scenarios) {
      const url = `${APP_BASE}/campaign/${s.slug}`;
      console.log(`\n=== Scenario: ${s.key} (goal_cents=${s.goal_cents}, layout=${s.layout}, donation_cents=${s.donation}) ===`);
      const desktopText = await checkPage(browser, url, desktop, `${s.key} — desktop`);
      await checkPage(browser, url, mobile, `${s.key} — mobile`);

      if (!s.goal_cents) {
        assert('"Goal not set" wording shown', desktopText.includes("Goal not set"));
      }
      if (s.key === "goal-overfunded") {
        assert("does not claim money is still needed when overfunded", !desktopText.includes("still needed") || desktopText.includes("$0 still needed"));
      }
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
