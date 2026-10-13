import test from "node:test";
import assert from "node:assert/strict";
import { resolveActivePartnersTab, getPartnersTabs } from "./partnersTabs.ts";

// ── getPartnersTabs ──────────────────────────────────────────────────────

test("getPartnersTabs(true): lists community before team, with the full approved labels", () => {
  const tabs = getPartnersTabs(true);
  assert.deepEqual(tabs.map(t => t.key), ["community", "team"]);
  assert.equal(tabs[0].label, "ELF Community Partners");
  assert.equal(tabs[1].label, "Team Sponsors");
});

test("getPartnersTabs(false): community is completely absent, only Team Sponsors remains", () => {
  const tabs = getPartnersTabs(false);
  assert.deepEqual(tabs.map(t => t.key), ["team"]);
  assert.equal(tabs[0].label, "Team Sponsors");
});

// ── resolveActivePartnersTab: showCommunityPartners = true ──────────────

test("resolveActivePartnersTab(true): 'team' resolves to the team tab", () => {
  assert.equal(resolveActivePartnersTab("team", true), "team");
});

test("resolveActivePartnersTab(true): missing (null) value falls back to the default (community)", () => {
  assert.equal(resolveActivePartnersTab(null, true), "community");
});

test("resolveActivePartnersTab(true): missing (undefined) value falls back to the default (community)", () => {
  assert.equal(resolveActivePartnersTab(undefined, true), "community");
});

test("resolveActivePartnersTab(true): an invalid/unrecognized value falls back to the default (community), never errors", () => {
  assert.equal(resolveActivePartnersTab("bogus", true), "community");
  assert.equal(resolveActivePartnersTab("", true), "community");
  assert.equal(resolveActivePartnersTab("Team", true), "community"); // case-sensitive, not coerced
});

test("a real '?tab=team' URL (what Home's 'Our Sponsors' links now produce) resolves to the team tab", () => {
  const url = new URL("https://example.test/team/wildcats-2026/sponsors?tab=team");
  assert.equal(resolveActivePartnersTab(url.searchParams.get("tab"), true), "team");
});

test("the bare route with no query string resolves to the default (community) tab when advertising is on", () => {
  const url = new URL("https://example.test/team/wildcats-2026/sponsors");
  assert.equal(resolveActivePartnersTab(url.searchParams.get("tab"), true), "community");
});

// ── resolveActivePartnersTab: showCommunityPartners = false ─────────────
// A stale/bookmarked `?tab=community` link (e.g. from before an admin
// turned advertising off for this school) must degrade gracefully to Team
// Sponsors, never resolve to a tab that no longer exists.

test("resolveActivePartnersTab(false): a stale '?tab=community' link resolves to team, not community", () => {
  assert.equal(resolveActivePartnersTab("community", false), "team");
});

test("resolveActivePartnersTab(false): missing/null/undefined all resolve to team", () => {
  assert.equal(resolveActivePartnersTab(null, false), "team");
  assert.equal(resolveActivePartnersTab(undefined, false), "team");
});

test("resolveActivePartnersTab(false): an explicit '?tab=team' still resolves to team", () => {
  assert.equal(resolveActivePartnersTab("team", false), "team");
});
