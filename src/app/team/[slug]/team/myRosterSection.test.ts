// Roster "My Profile" / "My Athletes" — the pure selection rule
// (rosterHelpers.ts::myRosterSection) plus structural checks on
// AthleteRosterGrid.tsx and team/page.tsx. Source scans for the component,
// same approach as gradeTabs.test.ts.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { myRosterSection } from "./rosterHelpers.ts";
import type { TeamActor } from "../../../../lib/permissions.ts";
import type { TeamAthleteRow } from "../../../../lib/teamData.ts";

const src = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
const mobileGrid = src("./AthleteRosterGrid.tsx");
const teamPage   = src("./page.tsx");

function athlete(id: string, name: string, class_year: string | null = "Junior"): TeamAthleteRow {
  return {
    id, name, class_year, campaign_slug: "test-team", event: null, created_at: "2026-01-01T00:00:00.000Z",
    contact_phone: null, contact_email: null, jersey_number: null, grad_year: null, profile_photo: null, goal_cents: null,
  };
}

function member(role: "athlete" | "parent" | "booster", athlete_id: string | null = null): TeamActor {
  return { kind: "member", session: { id: "m1", name: "Pat Member", role, campaign_slug: "test-team", athlete_id } };
}

function coach(role: "head_coach" | "assistant_coach" | "booster"): TeamActor {
  return { kind: "coach", session: { id: "c1", name: "Pat Member", role, campaign_slug: "test-team" } };
}

const platformAdmin: TeamActor = {
  kind: "platform_admin",
  session: { platformAdminId: "pa1", accountId: "acct1", name: "ELF Employee", email: "employee@elitelevelfundraising.com", campaign_slug: "test-team" },
};

const roster = [athlete("a1", "Alex Avery"), athlete("a2", "Blair Brooks", "Senior"), athlete("a3", "Casey Cole", "Freshman"), athlete("a4", "Pat Member")];
const ids = (s: ReturnType<typeof myRosterSection>) => s?.athletes.map(a => a.id) ?? null;

// ── Athlete accounts ──────────────────────────────────────────────────────

test("athlete: My Profile holds exactly their own athlete card", () => {
  const s = myRosterSection(member("athlete", "a2"), [], roster);
  assert.equal(s?.title, "My Profile");
  assert.deepEqual(ids(s), ["a2"]);
  assert.equal(s?.athletes[0], roster[1], "the same roster row object — same photo, grade, name");
});

test("athlete: only athlete_id counts — linked ids are ignored for an athlete", () => {
  assert.deepEqual(ids(myRosterSection(member("athlete", "a2"), ["a1", "a3"], roster)), ["a2"]);
});

test("athlete without an athlete_id: no section", () => {
  assert.equal(myRosterSection(member("athlete", null), [], roster), null);
});

test("athlete whose athlete is not on this team/season roster: no section", () => {
  assert.equal(myRosterSection(member("athlete", "other-season-athlete"), [], roster), null);
});

// ── Parent accounts ───────────────────────────────────────────────────────

test("parent with one child: My Athletes holds that child", () => {
  const s = myRosterSection(member("parent"), ["a3"], roster);
  assert.equal(s?.title, "My Athletes");
  assert.deepEqual(ids(s), ["a3"]);
});

test("parent with several children on this team: all of them, in roster order", () => {
  assert.deepEqual(ids(myRosterSection(member("parent"), ["a3", "a1"], roster)), ["a1", "a3"]);
});

test("parent: linked ids from another team or season are never shown", () => {
  assert.deepEqual(ids(myRosterSection(member("parent"), ["a1", "other-team-athlete"], roster)), ["a1"]);
  assert.equal(myRosterSection(member("parent"), ["other-team-athlete"], roster), null);
});

test("parent with no linked athletes: no empty section", () => {
  assert.equal(myRosterSection(member("parent"), [], roster), null);
});

test("duplicate linked ids (legacy column + join table) give one card", () => {
  assert.deepEqual(ids(myRosterSection(member("parent", "a1"), ["a1", "a1"], roster)), ["a1"]);
});

test("never matched by name: a parent named like an athlete gets nothing unless linked", () => {
  // member() is named "Pat Member", the same as athlete a4.
  assert.equal(myRosterSection(member("parent"), [], roster), null);
  assert.equal(myRosterSection(member("athlete", null), [], roster), null);
});

// ── Everyone else keeps the existing roster ───────────────────────────────

test("coaches, boosters, platform admins and the public: no section", () => {
  for (const actor of [coach("head_coach"), coach("assistant_coach"), coach("booster"), member("booster", "a1"), platformAdmin, { kind: "public" } as TeamActor]) {
    assert.equal(myRosterSection(actor, ["a1"], roster), null);
  }
});

test("empty roster: no section", () => {
  assert.equal(myRosterSection(member("parent"), ["a1"], []), null);
});

test("does not modify the roster", () => {
  const before = JSON.stringify(roster);
  myRosterSection(member("parent"), ["a1", "a3"], roster);
  assert.equal(JSON.stringify(roster), before);
});

// ── AthleteRosterGrid.tsx ─────────────────────────────────────────────────

test("grid: section uses myRosterSection with the server-computed linkedAthleteIds", () => {
  assert.match(mobileGrid, /myRosterSection\(actor, linkedAthleteIds, athletes\)/);
});

test("grid: section renders above the Team header, with the existing AthleteRow card", () => {
  const section = mobileGrid.indexOf("{mySection && (");
  const header  = mobileGrid.indexOf("{/* Section header */}");
  assert.ok(section > 0 && section < header, "section before the Team header and search");
  const block = mobileGrid.slice(section, header);
  assert.match(block, /<AthleteRow/);
  assert.match(block, /canOpen=\{canOpenAthlete\(a\.id\)\}/, "same profile-navigation rule");
  assert.match(block, /\{mySection\.title\}/);
});

test("grid: the section stays pinned whatever the search or grade tab", () => {
  const block = mobileGrid.slice(mobileGrid.indexOf("{mySection && ("), mobileGrid.indexOf("{/* Section header */}"));
  assert.match(block, /mySection\.athletes\.map/);
  assert.doesNotMatch(block, /search|activeTab|matchesRosterSearch|matchesGradeTab|filtered/);
  assert.match(mobileGrid, /myRosterSection\(actor, linkedAthleteIds, athletes\)/, "built from the whole roster, not the filtered list");
});

test("grid: the section resets the global <section> padding and keeps a 20px gap to the Team heading", () => {
  // globals.css: `section { padding: 6rem 5%; }` (marketing site) — without
  // the reset the section gets 96px above and below and a 5% side inset.
  assert.match(mobileGrid, /<section aria-label=\{mySection\.title\} style=\{\{ padding: 0, marginBottom: "var\(--space-5\)" \}\}>/);
  const block = mobileGrid.slice(mobileGrid.indexOf("{mySection && ("), mobileGrid.indexOf("{/* Section header */}"));
  assert.doesNotMatch(block, /minHeight|height:|justifyContent|<div style=\{\{ height/, "no fixed heights or spacers");
});

test("grid: the main list leaves out athletes already in the section", () => {
  assert.match(mobileGrid, /!mine\.has\(a\.id\) && matchesRosterSearch\(a\.name, search\) && matchesGradeTab\(a\.class_year, activeTab\)/);
});

test("grid: team count, search and grade tabs still use the whole roster", () => {
  assert.match(mobileGrid, /buildGradeTabs\(athletes\)/);
  assert.match(mobileGrid, /\{athletes\.length\} athlete\{athletes\.length !== 1 \? "s" : ""\}/);
});

test("page: linked athletes still come only from the parent's own member relationships", () => {
  assert.match(teamPage, /actor\.kind === "member" && actor\.session\.role === "parent"\s*\n\s*\? await getLinkedAthleteIdsForMember\(actor\.session\.id, actor\.session\.athlete_id\)/);
});
