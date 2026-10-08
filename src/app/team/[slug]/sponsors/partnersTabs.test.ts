import test from "node:test";
import assert from "node:assert/strict";
import { resolveActivePartnersTab, PARTNERS_TABS, DEFAULT_PARTNERS_TAB } from "./partnersTabs.ts";

test("resolveActivePartnersTab: 'team' resolves to the team tab", () => {
  assert.equal(resolveActivePartnersTab("team"), "team");
});

test("resolveActivePartnersTab: missing (null) value falls back to the default (community)", () => {
  assert.equal(resolveActivePartnersTab(null), "community");
});

test("resolveActivePartnersTab: missing (undefined) value falls back to the default (community)", () => {
  assert.equal(resolveActivePartnersTab(undefined), "community");
});

test("resolveActivePartnersTab: an invalid/unrecognized value falls back to the default (community), never errors", () => {
  assert.equal(resolveActivePartnersTab("bogus"), "community");
  assert.equal(resolveActivePartnersTab(""), "community");
  assert.equal(resolveActivePartnersTab("Team"), "community"); // case-sensitive, not coerced
});

test("DEFAULT_PARTNERS_TAB is community — ELF Community Partners is the default tab for every role", () => {
  assert.equal(DEFAULT_PARTNERS_TAB, "community");
});

test("PARTNERS_TABS lists community before team, with the full approved labels", () => {
  assert.deepEqual(PARTNERS_TABS.map(t => t.key), ["community", "team"]);
  assert.equal(PARTNERS_TABS[0].label, "ELF Community Partners");
  assert.equal(PARTNERS_TABS[1].label, "Team Sponsors");
});

// ── Home's "Our Sponsors" links use ?tab=team (real URL round-trip) ──────

test("a real '?tab=team' URL (what Home's 'Our Sponsors' links now produce) resolves to the team tab", () => {
  const url = new URL("https://example.test/team/wildcats-2026/sponsors?tab=team");
  assert.equal(resolveActivePartnersTab(url.searchParams.get("tab")), "team");
});

test("the bare route with no query string (what the nav rename itself links to) resolves to the default (community) tab", () => {
  const url = new URL("https://example.test/team/wildcats-2026/sponsors");
  assert.equal(resolveActivePartnersTab(url.searchParams.get("tab")), "community");
});
