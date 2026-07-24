#!/usr/bin/env node
// Real browser verification (Playwright) for the athlete share-link fix —
// written because a source-only fix previously shipped with a second,
// missed implementation (FundraiserView.tsx's "My Dashboard" Copy Link/
// Share/QR) that a code review alone did not catch. This script actually
// clicks the buttons in a headless browser and reads back what
// navigator.clipboard / navigator.share were called with, plus checks the
// public campaign page's rendered DOM state (selected dropdown value,
// "Supporting X" indicator) after opening a shared link logged out.
//
// Creates and cleans up its own disposable campaign/coach-free athlete +
// claim fixtures — does not touch any real account or campaign data.
//
// Usage:
//   npm install --no-save playwright   (not a project dependency — ad hoc)
//   npx playwright install chromium
//   npm run dev                        (in another terminal)
//   node scripts/verify-athlete-share-links.mjs

import { readFileSync } from "node:fs";
import { randomUUID, randomBytes } from "node:crypto";
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
  if (cond) console.log(`  PASS  ${label}`);
  else { console.log(`  FAIL  ${label}${extra ? " — " + extra : ""}`); failures++; }
}

const slug = `pwverify-${Date.now().toString(36)}`;
let campaignCreated = false, athleteId = null, accountId = null, memberId = null, joinCodeId = null;

async function cleanup() {
  console.log("\nCleaning up fixtures...");
  if (memberId) await restDelete(`team_members?id=eq.${memberId}`);
  if (joinCodeId) await restDelete(`team_join_codes?id=eq.${joinCodeId}`);
  if (athleteId) await restDelete(`athletes?id=eq.${athleteId}`);
  if (accountId) await restDelete(`elf_accounts?id=eq.${accountId}`);
  if (campaignCreated) await restDelete(`campaign_settings?campaign_slug=eq.${slug}`);
  console.log("Cleanup done.");
}

async function main() {
  console.log(`Fixture campaign: ${slug}\n`);

  await restInsert("campaign_settings", { campaign_slug: slug, school_name: "PW Verify School", sport_name: "Baseball" });
  campaignCreated = true;

  const athlete = await restInsert("athletes", { campaign_slug: slug, name: "Playwright Verify Athlete", event: "SS", class_year: "Senior" });
  athleteId = athlete.id;

  const code = "PW" + randomUUID().slice(0, 6).toUpperCase();
  const joinCode = await restInsert("team_join_codes", { campaign_slug: slug, code });
  joinCodeId = joinCode.id;

  // Real HTTP join as this athlete — creates the elf_account, gets a real
  // session cookie, exactly like a real user going through /join/[code].
  const email = `pwverify-${Date.now()}@example.com`;
  const joinRes = await fetch(`${APP_BASE}/api/auth/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, name: "Playwright Verify Athlete", email, password: "pwverify123456", role: "athlete", athlete_id: athleteId }),
  });
  if (!joinRes.ok) throw new Error(`join failed: ${await joinRes.text()}`);
  const setCookie = joinRes.headers.get("set-cookie") ?? "";
  const sessionCookie = setCookie.match(/elf_session=([^;]+)/)?.[1];
  if (!sessionCookie) throw new Error(`no elf_session cookie: ${setCookie}`);

  const acctRes = await fetch(`${SUPA_URL}/rest/v1/elf_accounts?email=eq.${email}&select=id`, { headers: sh() });
  accountId = (await acctRes.json())[0]?.id;
  const memRes = await fetch(`${SUPA_URL}/rest/v1/team_members?account_id=eq.${accountId}&select=id`, { headers: sh() });
  memberId = (await memRes.json())[0]?.id;

  const expectedPath = `/campaign/${slug}?athlete=${athleteId}`;
  const forbiddenSubstring = `/team/${slug}/athlete/${athleteId}`;

  const browser = await chromium.launch();
  const context = await browser.newContext();
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await context.addCookies([{
    name: "elf_session", value: sessionCookie, domain: "localhost", path: "/",
  }]);

  try {
    // ── 1. FundraiserView "My Dashboard" — Copy Link ─────────────────────
    const page = await context.newPage();
    await page.goto(`${APP_BASE}/team/${slug}/fundraiser`, { waitUntil: "networkidle" });

    const copyLinkBtn = page.getByRole("button", { name: /Copy Link/i }).first();
    await copyLinkBtn.waitFor({ state: "visible", timeout: 10000 });
    await copyLinkBtn.click();
    await page.waitForTimeout(300);
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());

    console.log(`\nFundraiserView ("My Dashboard") Copy Link:`);
    console.log(`  clipboard value: ${clipboardText}`);
    assert("clipboard contains the public campaign path with athlete param", clipboardText.includes(expectedPath), `got: ${clipboardText}`);
    assert("clipboard does NOT contain the internal /team/.../athlete/... URL", !clipboardText.includes(forbiddenSubstring), `got: ${clipboardText}`);

    // ── 2. Intercept navigator.share to check the URL it would send ─────
    await page.evaluate(() => {
      window.__lastShareUrl = null;
      navigator.share = (data) => { window.__lastShareUrl = data.url; return Promise.resolve(); };
    });
    const shareBtn = page.getByRole("button", { name: /^Share/i }).first();
    await shareBtn.click();
    await page.waitForTimeout(300);
    const shareUrl = await page.evaluate(() => window.__lastShareUrl);
    console.log(`\nFundraiserView ("My Dashboard") Share:`);
    console.log(`  navigator.share url: ${shareUrl}`);
    assert("share url contains the public campaign path with athlete param", !!shareUrl && shareUrl.includes(expectedPath), `got: ${shareUrl}`);
    assert("share url does NOT contain the internal athlete URL", !!shareUrl && !shareUrl.includes(forbiddenSubstring), `got: ${shareUrl}`);

    // ── 3. AthleteProfileView (roster detail page) — Copy Link, same checks ──
    const page2 = await context.newPage();
    await page2.goto(`${APP_BASE}/team/${slug}/athlete/${athleteId}`, { waitUntil: "networkidle" });
    const copyLinkBtn2 = page2.getByRole("button", { name: /Copy Link/i }).first();
    await copyLinkBtn2.waitFor({ state: "visible", timeout: 10000 });
    await copyLinkBtn2.click();
    await page2.waitForTimeout(300);
    const clipboardText2 = await page2.evaluate(() => navigator.clipboard.readText());
    console.log(`\nAthleteProfileView (roster detail page) Copy Link:`);
    console.log(`  clipboard value: ${clipboardText2}`);
    assert("clipboard contains the public campaign path with athlete param", clipboardText2.includes(expectedPath), `got: ${clipboardText2}`);
    assert("clipboard does NOT contain the internal athlete URL", !clipboardText2.includes(forbiddenSubstring), `got: ${clipboardText2}`);
    await page2.close();

    // ── 4. Open the shared URL logged OUT — fresh context, no cookies ──
    const publicContext = await browser.newContext();
    const publicPage = await publicContext.newPage();
    const fullUrl = `${APP_BASE}${expectedPath}`;
    const resp = await publicPage.goto(fullUrl, { waitUntil: "networkidle" });
    console.log(`\nPublic (logged-out) load of ${fullUrl}:`);
    assert("page loads with 200", resp.status() === 200, `got: ${resp.status()}`);

    // Wait for the client-side campaign-stats fetch + preselect logic to run.
    await publicPage.waitForFunction(
      (name) => {
        const sel = document.querySelector("select");
        return sel && Array.from(sel.options).some((o) => o.value === name);
      },
      "Playwright Verify Athlete",
      { timeout: 10000 },
    ).catch(() => {});

    const selectedValue = await publicPage.evaluate(() => document.querySelector("select")?.value ?? null);
    console.log(`  athlete <select> value: ${selectedValue}`);
    assert("athlete is preselected in the donation form dropdown", selectedValue === "Playwright Verify Athlete", `got: ${selectedValue}`);

    const bodyText = await publicPage.evaluate(() => document.body.innerText);
    assert('"Supporting Playwright Verify Athlete" indicator is visible', bodyText.includes("Supporting Playwright Verify Athlete"));

    await publicContext.close();
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
