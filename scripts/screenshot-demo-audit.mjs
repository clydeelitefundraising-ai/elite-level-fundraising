#!/usr/bin/env node
// Takes screenshots of an empty campaign and a real-data campaign for the
// demo-donation-removal cleanup deliverable. Reuses the same disposable
// fixture pattern as verify-no-demo-donations.mjs; cleans up afterward.

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
const OUT_DIR = process.argv[2] || ".";

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

const emptySlug = `shot-empty-${Date.now().toString(36)}`;
const realSlug  = `shot-real-${Date.now().toString(36)}`;

async function cleanup() {
  for (const slug of [emptySlug, realSlug]) {
    await restDelete(`donations?campaign_slug=eq.${slug}`);
    await restDelete(`athletes?campaign_slug=eq.${slug}`);
    await restDelete(`campaign_settings?campaign_slug=eq.${slug}`);
  }
}

async function main() {
  await restInsert("campaign_settings", { campaign_slug: emptySlug, school_name: "Riverside Academy", sport_name: "Soccer", mascot: "Falcons", layout_variant: "classic" });
  await restInsert("campaign_settings", { campaign_slug: realSlug, school_name: "Lakeside High", sport_name: "Soccer", mascot: "Hawks", layout_variant: "classic" });
  const athlete = await restInsert("athletes", { campaign_slug: realSlug, name: "Jordan Rivers", event: "Midfield", class_year: "Senior" });
  await restInsert("donations", {
    campaign_slug: realSlug, athlete_id: athlete.id, athlete_name: athlete.name,
    donor_name: "Alex Turner", amount_cents: 7500, donation_message: "Go Hawks!",
    stripe_session_id: `shotfixture_${Date.now()}`,
  });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } });

  await page.goto(`${APP_BASE}/campaign/${emptySlug}`, { waitUntil: "networkidle" });
  await page.locator("#donations").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT_DIR}/1-empty-campaign.png`, fullPage: true });

  await page.goto(`${APP_BASE}/campaign/${realSlug}`, { waitUntil: "networkidle" });
  await page.locator("#donations").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT_DIR}/2-real-donations.png`, fullPage: true });

  await browser.close();
  console.log("Screenshots written to", OUT_DIR);
}

try {
  await main();
} finally {
  await cleanup();
}
