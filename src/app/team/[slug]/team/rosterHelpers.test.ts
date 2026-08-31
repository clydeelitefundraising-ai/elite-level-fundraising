import test from "node:test";
import assert from "node:assert/strict";
import {
  shouldShowDesktopRoster,
  buildDesktopRosterRows,
  filterDesktopRosterRows,
  sortDesktopRosterRows,
  distinctGrades,
  DEFAULT_ROSTER_FILTERS,
  type RosterRow,
} from "./rosterHelpers.ts";
import type { TeamActor } from "../../../../lib/permissions.ts";
import type { TeamAthleteRow, OutreachCurrentRow } from "../../../../lib/teamData.ts";
import type { AttributionTotals } from "../../../../lib/donationAttribution.ts";

// Same fixture convention as src/lib/permissions.test.ts /
// desktopNavItems.test.ts / coachDashboardHelpers.test.ts.

function coachActor(role: "head_coach" | "assistant_coach" | "booster"): TeamActor {
  return { kind: "coach", session: { id: "c1", name: "Test Coach", role, campaign_slug: "test-team" } };
}

function memberActor(role: "athlete" | "parent" | "booster"): TeamActor {
  return { kind: "member", session: { id: "m1", name: "Test Member", role, campaign_slug: "test-team", athlete_id: null } };
}

function platformAdminActor(): TeamActor {
  return {
    kind: "platform_admin",
    session: { platformAdminId: "pa1", accountId: "acct1", name: "ELF Employee", email: "employee@elitelevelfundraising.com", campaign_slug: "test-team" },
  };
}

const publicActor: TeamActor = { kind: "public" };

// ─── shouldShowDesktopRoster ────────────────────────────────────────────────

test("shouldShowDesktopRoster: true for Head Coach", () => {
  assert.equal(shouldShowDesktopRoster(coachActor("head_coach")), true);
});

test("shouldShowDesktopRoster: true for Assistant Coach", () => {
  assert.equal(shouldShowDesktopRoster(coachActor("assistant_coach")), true);
});

test("shouldShowDesktopRoster: true for Platform Admin", () => {
  assert.equal(shouldShowDesktopRoster(platformAdminActor()), true);
});

test("shouldShowDesktopRoster: false for Booster (coach-table), unlike isStaff()", () => {
  assert.equal(shouldShowDesktopRoster(coachActor("booster")), false);
});

test("shouldShowDesktopRoster: false for Booster (member-table)", () => {
  assert.equal(shouldShowDesktopRoster(memberActor("booster")), false);
});

test("shouldShowDesktopRoster: false for Athlete/Parent/public", () => {
  assert.equal(shouldShowDesktopRoster(memberActor("athlete")), false);
  assert.equal(shouldShowDesktopRoster(memberActor("parent")), false);
  assert.equal(shouldShowDesktopRoster(publicActor), false);
});

// ─── buildDesktopRosterRows ─────────────────────────────────────────────────

function athlete(overrides: Partial<TeamAthleteRow> & { id: string; name: string }): TeamAthleteRow {
  return {
    campaign_slug: "test-team",
    event: null,
    class_year: null,
    created_at: "2026-01-01T00:00:00.000Z",
    contact_phone: null,
    contact_email: null,
    jersey_number: null,
    grad_year: null,
    profile_photo: null,
    goal_cents: null,
    ...overrides,
  };
}

function outreach(athleteId: string, status: OutreachCurrentRow["status"]): OutreachCurrentRow {
  return { id: `o-${athleteId}`, athlete_id: athleteId, campaign_slug: "test-team", status, note: null, contacted_by: null, coach_id: null, created_at: "2026-01-01T00:00:00.000Z" };
}

const EMPTY_ATTRIBUTION: AttributionTotals = { totalsCents: {}, donorCounts: {}, lastDonationAt: {} };

test("buildDesktopRosterRows: fundraising amount maps to the correct athlete", () => {
  const athletes = [athlete({ id: "a1", name: "Alice" }), athlete({ id: "a2", name: "Bob" })];
  const attribution: AttributionTotals = { totalsCents: { a1: 5000, a2: 0 }, donorCounts: { a1: 3, a2: 0 }, lastDonationAt: {} };
  const rows = buildDesktopRosterRows(athletes, attribution, {}, {});
  assert.equal(rows.find(r => r.id === "a1")?.raisedCents, 5000);
  assert.equal(rows.find(r => r.id === "a1")?.donorCount, 3);
  assert.equal(rows.find(r => r.id === "a2")?.raisedCents, 0);
});

test("buildDesktopRosterRows: contact count maps to the correct athlete", () => {
  const athletes = [athlete({ id: "a1", name: "Alice" }), athlete({ id: "a2", name: "Bob" })];
  const rows = buildDesktopRosterRows(athletes, EMPTY_ATTRIBUTION, { a1: 4 }, {});
  assert.equal(rows.find(r => r.id === "a1")?.contactCount, 4);
  assert.equal(rows.find(r => r.id === "a2")?.contactCount, 0);
});

test("buildDesktopRosterRows: outreach status maps to the correct athlete", () => {
  const athletes = [athlete({ id: "a1", name: "Alice" }), athlete({ id: "a2", name: "Bob" }), athlete({ id: "a3", name: "Cara" })];
  const outreachMap = { a1: outreach("a1", "contacted"), a2: outreach("a2", "needs_follow_up") };
  const rows = buildDesktopRosterRows(athletes, EMPTY_ATTRIBUTION, {}, outreachMap);
  assert.equal(rows.find(r => r.id === "a1")?.outreachStatus, "Contacted");
  assert.equal(rows.find(r => r.id === "a2")?.outreachStatus, "Follow Up");
  assert.equal(rows.find(r => r.id === "a3")?.outreachStatus, "No outreach logged");
});

// D3a: explicit per-DB-value mapping, matching CoachAthleteView.tsx's own
// established outreach vocabulary (OUTREACH_CONFIG) rather than D3's
// original wording.
test("buildDesktopRosterRows: an athlete absent from getOutreachMap's result shows 'No outreach logged', not 'Not Started'", () => {
  const athletes = [athlete({ id: "a1", name: "Alice" })];
  const rows = buildDesktopRosterRows(athletes, EMPTY_ATTRIBUTION, {}, {});
  assert.equal(rows[0].outreachStatus, "No outreach logged");
});

test("buildDesktopRosterRows: DB status 'contacted' maps to 'Contacted'", () => {
  const athletes = [athlete({ id: "a1", name: "Alice" })];
  const rows = buildDesktopRosterRows(athletes, EMPTY_ATTRIBUTION, {}, { a1: outreach("a1", "contacted") });
  assert.equal(rows[0].outreachStatus, "Contacted");
});

test("buildDesktopRosterRows: DB status 'needs_follow_up' maps to 'Follow Up' (not 'Needs Follow-up')", () => {
  const athletes = [athlete({ id: "a1", name: "Alice" })];
  const rows = buildDesktopRosterRows(athletes, EMPTY_ATTRIBUTION, {}, { a1: outreach("a1", "needs_follow_up") });
  assert.equal(rows[0].outreachStatus, "Follow Up");
});

test("buildDesktopRosterRows: DB status 'resolved' maps to 'Resolved'", () => {
  const athletes = [athlete({ id: "a1", name: "Alice" })];
  const rows = buildDesktopRosterRows(athletes, EMPTY_ATTRIBUTION, {}, { a1: outreach("a1", "resolved") });
  assert.equal(rows[0].outreachStatus, "Resolved");
});

test("buildDesktopRosterRows: missing auxiliary data produces safe fallbacks, never undefined/null", () => {
  const athletes = [athlete({ id: "a1", name: "Alice" })];
  const rows = buildDesktopRosterRows(athletes, EMPTY_ATTRIBUTION, {}, {});
  assert.equal(rows[0].raisedCents, 0);
  assert.equal(rows[0].donorCount, 0);
  assert.equal(rows[0].contactCount, 0);
  assert.equal(rows[0].outreachStatus, "No outreach logged");
});

// ─── filterDesktopRosterRows ────────────────────────────────────────────────

const ROWS: RosterRow[] = [
  { id: "a1", name: "Alice Anderson", profile_photo: null, class_year: "Freshman", event: "Sprints", jersey_number: 1, contact_phone: null, contact_email: null, goal_cents: 10000, raisedCents: 5000, donorCount: 2, contactCount: 3, outreachStatus: "Contacted" },
  { id: "a2", name: "Bob Baker",      profile_photo: null, class_year: "Senior",   event: "Distance", jersey_number: 2, contact_phone: null, contact_email: null, goal_cents: null,  raisedCents: 0,    donorCount: 0, contactCount: 0, outreachStatus: "No outreach logged" },
  { id: "a3", name: "cara Chen",      profile_photo: null, class_year: "Freshman", event: null,       jersey_number: null, contact_phone: null, contact_email: null, goal_cents: null, raisedCents: 2500, donorCount: 1, contactCount: 1, outreachStatus: "Resolved" },
];

test("filterDesktopRosterRows: case-insensitive athlete-name search", () => {
  const result = filterDesktopRosterRows(ROWS, { ...DEFAULT_ROSTER_FILTERS, search: "ALICE" });
  assert.deepEqual(result.map(r => r.id), ["a1"]);
});

test("filterDesktopRosterRows: partial-name matching", () => {
  const result = filterDesktopRosterRows(ROWS, { ...DEFAULT_ROSTER_FILTERS, search: "ch" });
  // "Chen" (a3) matches; also matches nothing else here
  assert.deepEqual(result.map(r => r.id), ["a3"]);
});

test("filterDesktopRosterRows: grade/class filtering", () => {
  const result = filterDesktopRosterRows(ROWS, { ...DEFAULT_ROSTER_FILTERS, grade: "Freshman" });
  assert.deepEqual(result.map(r => r.id).sort(), ["a1", "a3"]);
});

test("filterDesktopRosterRows: has-raised-funds", () => {
  const result = filterDesktopRosterRows(ROWS, { ...DEFAULT_ROSTER_FILTERS, fundraising: "has-raised" });
  assert.deepEqual(result.map(r => r.id).sort(), ["a1", "a3"]);
});

test("filterDesktopRosterRows: no-funds-raised", () => {
  const result = filterDesktopRosterRows(ROWS, { ...DEFAULT_ROSTER_FILTERS, fundraising: "no-raised" });
  assert.deepEqual(result.map(r => r.id), ["a2"]);
});

test("filterDesktopRosterRows: combined filters (grade AND fundraising AND search)", () => {
  // "alice" narrows to a1 alone; grade=Freshman and fundraising=has-raised
  // are both also true for a3, proving the search term is what's doing
  // the narrowing here, not an accidental single-filter match.
  const result = filterDesktopRosterRows(ROWS, { search: "alice", grade: "Freshman", fundraising: "has-raised" });
  assert.deepEqual(result.map(r => r.id), ["a1"]);
});

test("filterDesktopRosterRows: no filters returns everything", () => {
  const result = filterDesktopRosterRows(ROWS, DEFAULT_ROSTER_FILTERS);
  assert.equal(result.length, 3);
});

// ─── sortDesktopRosterRows ──────────────────────────────────────────────────

test("sortDesktopRosterRows: Name A-Z", () => {
  const result = sortDesktopRosterRows(ROWS, "name-asc");
  assert.deepEqual(result.map(r => r.id), ["a1", "a2", "a3"]);
});

test("sortDesktopRosterRows: Name Z-A", () => {
  const result = sortDesktopRosterRows(ROWS, "name-desc");
  assert.deepEqual(result.map(r => r.id), ["a3", "a2", "a1"]);
});

test("sortDesktopRosterRows: Raised High-Low", () => {
  const result = sortDesktopRosterRows(ROWS, "raised-desc");
  assert.deepEqual(result.map(r => r.id), ["a1", "a3", "a2"]);
});

test("sortDesktopRosterRows: Raised Low-High", () => {
  const result = sortDesktopRosterRows(ROWS, "raised-asc");
  assert.deepEqual(result.map(r => r.id), ["a2", "a3", "a1"]);
});

test("sortDesktopRosterRows: equal raised amounts break the tie by name, deterministically", () => {
  const tied: RosterRow[] = [
    { ...ROWS[0], id: "x1", name: "Zed",   raisedCents: 100 },
    { ...ROWS[0], id: "x2", name: "Aaron", raisedCents: 100 },
  ];
  const result = sortDesktopRosterRows(tied, "raised-desc");
  assert.deepEqual(result.map(r => r.id), ["x2", "x1"]);
});

test("sortDesktopRosterRows: does not mutate the input array", () => {
  const copy = [...ROWS];
  sortDesktopRosterRows(ROWS, "name-desc");
  assert.deepEqual(ROWS, copy);
});

// ─── distinctGrades ─────────────────────────────────────────────────────────

test("distinctGrades: derived from the loaded roster, deduped, canonically ordered", () => {
  const grades = distinctGrades(ROWS); // Freshman, Senior, Freshman -> {Freshman, Senior}
  assert.deepEqual(grades, ["Freshman", "Senior"]);
});

test("distinctGrades: an athlete with no class_year contributes nothing", () => {
  const rows: RosterRow[] = [{ ...ROWS[0], class_year: null }];
  assert.deepEqual(distinctGrades(rows), []);
});

test("distinctGrades: a non-canonical value present in the data still appears, sorted after canonical values", () => {
  const rows: RosterRow[] = [
    { ...ROWS[0], class_year: "Senior" },
    { ...ROWS[0], class_year: "Grad Year" },
  ];
  assert.deepEqual(distinctGrades(rows), ["Senior", "Grad Year"]);
});
