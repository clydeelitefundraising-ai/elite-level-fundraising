#!/usr/bin/env node
// Release-blocker regression test: a parent with one or more claimed
// athletes must bypass the "Link your fundraising profile" flow and land
// directly on the fundraiser dashboard; multiple claims must show a working
// switcher; Share/Copy/QR must reflect whichever athlete is selected.
//
// Also covers: single-claim parent, athlete account, coach account, and a
// coach who is also a parent on the same campaign — confirming the fix
// doesn't regress any of those.
//
// Creates and cleans up its own disposable campaign/athletes/accounts.
// Touches no real data.
//
// Usage:
//   npm install --no-save playwright   (ad hoc, not a project dependency)
//   npm run dev                        (in another terminal)
//   node scripts/verify-parent-fundraiser-auth.mjs

import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
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
function assert(label, cond, extra = "") {
  if (cond) console.log(`    PASS  ${label}`);
  else { console.log(`    FAIL  ${label}${extra ? " — " + extra : ""}`); failures++; }
}

const slug = `parentauth-${Date.now().toString(36)}`;
const state = { campaignCreated: false, athletes: [], accounts: [], joinCodeId: null };

async function cleanup() {
  console.log("\nCleaning up fixtures...");
  await restDelete(`team_member_athletes?athlete_id=in.(${state.athletes.map(a => a.id).join(",") || "00000000-0000-0000-0000-000000000000"})`);
  await restDelete(`team_members?campaign_slug=eq.${slug}`);
  await restDelete(`team_coaches?campaign_slug=eq.${slug}`);
  if (state.joinCodeId) await restDelete(`team_join_codes?id=eq.${state.joinCodeId}`);
  for (const a of state.athletes) await restDelete(`athletes?id=eq.${a.id}`);
  for (const acc of state.accounts) await restDelete(`elf_accounts?id=eq.${acc}`);
  if (state.campaignCreated) await restDelete(`campaign_settings?campaign_slug=eq.${slug}`);
  console.log("Cleanup done.");
}

async function joinAsMember({ email, name, role, athleteId, athleteIds }) {
  const res = await fetch(`${APP_BASE}/api/auth/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: state.code, name, email, password: "parentauthtest123", role,
      ...(athleteId ? { athlete_id: athleteId } : {}),
      ...(athleteIds ? { athlete_ids: athleteIds } : {}),
    }),
  });
  if (!res.ok) throw new Error(`join failed for ${email}: ${await res.text()}`);
  const setCookie = res.headers.get("set-cookie") ?? "";
  const cookie = setCookie.match(/elf_session=([^;]+)/)?.[1];
  if (!cookie) throw new Error(`no elf_session for ${email}: ${setCookie}`);
  const acctRows = await restGet(`elf_accounts?email=eq.${email}&select=id`);
  state.accounts.push(acctRows[0].id);
  return cookie;
}

async function main() {
  console.log(`Fixture campaign: ${slug}\n`);

  await restInsert("campaign_settings", { campaign_slug: slug, school_name: "Parent Auth Test School", sport_name: "Basketball", mascot: "Bears" });
  state.campaignCreated = true;

  const athleteA = await restInsert("athletes", { campaign_slug: slug, name: "Fixture Athlete A", event: "Guard", class_year: "Freshman" });
  const athleteB = await restInsert("athletes", { campaign_slug: slug, name: "Fixture Athlete B", event: "Forward", class_year: "Senior" });
  state.athletes.push(athleteA, athleteB);

  const code = "PA" + randomBytes(3).toString("hex").toUpperCase();
  state.code = code;
  const joinCode = await restInsert("team_join_codes", { campaign_slug: slug, code });
  state.joinCodeId = joinCode.id;

  const browser = await chromium.launch();

  try {
    // ── Scenario 1: Parent with ONE claimed athlete ─────────────────────
    console.log("=== Scenario: parent with one claimed athlete ===");
    const p1Cookie = await joinAsMember({ email: `p1-${Date.now()}@example.com`, name: "Parent One", role: "parent", athleteIds: [athleteA.id] });
    {
      const ctx = await browser.newContext();
      await ctx.addCookies([{ name: "elf_session", value: p1Cookie, domain: "localhost", path: "/" }]);
      const page = await ctx.newPage();
      await page.goto(`${APP_BASE}/team/${slug}/fundraiser`, { waitUntil: "networkidle" });
      const text = await page.evaluate(() => document.body.innerText);
      assert("does NOT show the link/claim flow", !text.includes("Link your fundraising profile"));
      assert("shows the claimed athlete's dashboard", text.includes("Fixture Athlete A") || text.includes("My Dashboard"));
      assert("no Unauthorized error shown", !text.includes("Unauthorized"));

      const copyBtn = page.getByRole("button", { name: /Copy Link/i }).first();
      await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
      await copyBtn.click();
      await page.waitForTimeout(300);
      const clip = await page.evaluate(() => navigator.clipboard.readText());
      assert("Copy Link points at the claimed athlete", clip.includes(`athlete=${athleteA.id}`), `got: ${clip}`);
      await ctx.close();
    }

    // ── Scenario 2: Parent with MULTIPLE claimed athletes ───────────────
    console.log("\n=== Scenario: parent with multiple claimed athletes ===");
    const p2Cookie = await joinAsMember({ email: `p2-${Date.now()}@example.com`, name: "Parent Two", role: "parent", athleteIds: [athleteA.id, athleteB.id] });
    {
      const ctx = await browser.newContext();
      await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
      await ctx.addCookies([{ name: "elf_session", value: p2Cookie, domain: "localhost", path: "/" }]);
      const page = await ctx.newPage();
      await page.goto(`${APP_BASE}/team/${slug}/fundraiser`, { waitUntil: "networkidle" });
      let text = await page.evaluate(() => document.body.innerText);
      assert("does NOT show the link/claim flow", !text.includes("Link your fundraising profile"));
      assert("switcher shows both athlete names", text.includes("Fixture Athlete A") && text.includes("Fixture Athlete B"));

      // Switch to athlete B via the switcher link
      await page.getByRole("link", { name: "Fixture Athlete B" }).click();
      await page.waitForLoadState("networkidle");
      text = await page.evaluate(() => document.body.innerText);
      assert("switching updates the visible dashboard", text.includes("Fixture Athlete B"));

      const copyBtn = page.getByRole("button", { name: /Copy Link/i }).first();
      await copyBtn.click();
      await page.waitForTimeout(300);
      const clip = await page.evaluate(() => navigator.clipboard.readText());
      assert("Copy Link reflects the CURRENTLY SELECTED athlete (B)", clip.includes(`athlete=${athleteB.id}`), `got: ${clip}`);
      await ctx.close();
    }

    // ── Scenario 3: Athlete account (own single self-link, unchanged) ───
    console.log("\n=== Scenario: athlete account ===");
    const athleteC = await restInsert("athletes", { campaign_slug: slug, name: "Fixture Athlete C", event: "Center", class_year: "Junior" });
    state.athletes.push(athleteC);
    const aCookie = await joinAsMember({ email: `athlete-${Date.now()}@example.com`, name: "Fixture Athlete C", role: "athlete", athleteId: athleteC.id });
    {
      const ctx = await browser.newContext();
      await ctx.addCookies([{ name: "elf_session", value: aCookie, domain: "localhost", path: "/" }]);
      const page = await ctx.newPage();
      await page.goto(`${APP_BASE}/team/${slug}/fundraiser`, { waitUntil: "networkidle" });
      const text = await page.evaluate(() => document.body.innerText);
      assert("athlete sees own dashboard, not the link flow", !text.includes("Link your fundraising profile") && text.includes("Fixture Athlete C"));
      const switcherLinks = await page.locator('a[href^="?athlete="]').count();
      assert("no athlete-switcher links rendered for a single self-link", switcherLinks === 0, `found ${switcherLinks}`);
      await ctx.close();
    }

    // ── Scenario 4: Coach account ────────────────────────────────────────
    console.log("\n=== Scenario: coach account ===");
    const coachEmail = `coach-${Date.now()}@example.com`;
    const bootstrapCookie = await joinAsMember({ email: coachEmail, name: "Fixture Coach", role: "booster" });
    await restDelete(`team_members?campaign_slug=eq.${slug}&account_id=eq.${state.accounts[state.accounts.length - 1]}`);
    const coachAccountId = state.accounts[state.accounts.length - 1];
    const coachRow = await restInsert("team_coaches", {
      campaign_slug: slug, name: "Fixture Coach", email: coachEmail, role: "head_coach",
      account_id: coachAccountId, password_hash: "unused", salt: randomBytes(16).toString("hex"),
    });
    {
      const ctx = await browser.newContext();
      await ctx.addCookies([{ name: "elf_session", value: bootstrapCookie, domain: "localhost", path: "/" }]);
      const page = await ctx.newPage();
      await page.goto(`${APP_BASE}/team/${slug}/fundraiser`, { waitUntil: "networkidle" });
      const text = await page.evaluate(() => document.body.innerText);
      assert("coach sees the team/coach view, not the link flow", !text.includes("Link your fundraising profile"));
      assert("coach sees Campaign Progress (coach view)", text.includes("Campaign Progress") || text.includes("Team Leaderboard"));
      await ctx.close();
    }

    // ── Scenario 5: Coach who is also a parent (member wins, per precedence) ──
    console.log("\n=== Scenario: coach who is also a parent ===");
    // Reuse the coach account, now also join it as a parent claiming athlete A.
    const coachAsParentRes = await fetch(`${APP_BASE}/api/auth/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `elf_session=${bootstrapCookie}` },
      body: JSON.stringify({ code, name: "Fixture Coach", role: "parent", athlete_ids: [athleteA.id] }),
    });
    assert("coach-as-parent join succeeds (multi-role account supported)", coachAsParentRes.ok, await coachAsParentRes.clone().text());
    {
      const ctx = await browser.newContext();
      await ctx.addCookies([{ name: "elf_session", value: bootstrapCookie, domain: "localhost", path: "/" }]);
      const page = await ctx.newPage();
      await page.goto(`${APP_BASE}/team/${slug}/fundraiser`, { waitUntil: "networkidle" });
      const text = await page.evaluate(() => document.body.innerText);
      assert("no Unauthorized / crash for coach+parent account", !text.includes("Unauthorized"));
      assert("does not show the link/claim flow (member precedence resolves a real role)", !text.includes("Link your fundraising profile"));
      await ctx.close();
    }

    // ── Scenario 6: Existing share-link functionality unchanged (roster detail page) ──
    console.log("\n=== Scenario: share-link from roster detail page (AthleteProfileView) unchanged ===");
    {
      const ctx = await browser.newContext();
      await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
      await ctx.addCookies([{ name: "elf_session", value: aCookie, domain: "localhost", path: "/" }]);
      const page = await ctx.newPage();
      await page.goto(`${APP_BASE}/team/${slug}/athlete/${athleteC.id}`, { waitUntil: "networkidle" });
      const copyBtn = page.getByRole("button", { name: /Copy Link/i }).first();
      await copyBtn.click();
      await page.waitForTimeout(300);
      const clip = await page.evaluate(() => navigator.clipboard.readText());
      assert("roster-detail Copy Link still produces the public campaign URL", clip.includes(`/campaign/${slug}?athlete=${athleteC.id}`), `got: ${clip}`);
      await ctx.close();
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
