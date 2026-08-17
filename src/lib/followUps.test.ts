import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFollowUpRows,
  sortFollowUpRows,
  filterFollowUpRows,
  buildFollowUpsReportTitle,
  DEFAULT_FOLLOW_UP_SORT,
} from "./followUps.ts";

function athlete(id: string, name: string) {
  return { id, name } as import("./teamData.ts").TeamAthleteRow;
}

function donation(athleteId: string, cents: number) {
  return {
    id: "d", stripe_session_id: "s", donor_name: "Donor", amount_cents: cents,
    athlete_name: null, athlete_id: athleteId, donation_message: null, created_at: "2026-08-01T00:00:00Z",
  } as import("./supabase.ts").DonationRow;
}

function outreach(athleteId: string, status: "contacted" | "needs_follow_up" | "resolved", note: string | null = null) {
  return {
    id: "o1", athlete_id: athleteId, campaign_slug: "test", status, note,
    contacted_by: "Coach", coach_id: null, created_at: "2026-08-10T00:00:00Z",
  } as import("./teamData.ts").OutreachCurrentRow;
}

// ── Roster-first: the core non-negotiable guarantee ─────────────────────

test("buildFollowUpRows: a completely untouched roster athlete (no account/contacts/donations/outreach) still appears with 0/0/null", () => {
  const athletes = [athlete("a1", "Mason Brooks")];
  const rows = buildFollowUpRows(athletes, [], {}, {});
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    id: "a1", name: "Mason Brooks",
    contacts: 0, raisedCents: 0,
    outreachStatus: null, outreachNote: null, outreachAt: null,
  });
});

test("buildFollowUpRows: every roster athlete appears even when enrichment datasets are empty (roster count === row count)", () => {
  const athletes = [athlete("a1", "Mason Brooks"), athlete("a2", "Abby Cooper"), athlete("a3", "Liam Foster")];
  const rows = buildFollowUpRows(athletes, [], {}, {});
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(r => r.id).sort(), ["a1", "a2", "a3"]);
});

test("buildFollowUpRows: enrichment never adds a row that isn't in the roster (extra contact/donation/outreach data for an unknown id is ignored)", () => {
  const athletes = [athlete("a1", "Mason Brooks")];
  const rows = buildFollowUpRows(
    athletes,
    [donation("ghost-id", 500)],
    { "ghost-id": 3 },
    { "ghost-id": outreach("ghost-id", "resolved") },
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "a1");
  assert.equal(rows[0].contacts, 0);
  assert.equal(rows[0].raisedCents, 0);
});

test("buildFollowUpRows: enriches contacts, raised amount, and outreach correctly by athlete id", () => {
  const athletes = [athlete("a1", "Mason Brooks"), athlete("a2", "Abby Cooper")];
  const rows = buildFollowUpRows(
    athletes,
    [donation("a2", 12500)],
    { a2: 4 },
    { a2: outreach("a2", "needs_follow_up", "Only 4 contacts so far.") },
  );
  const mason = rows.find(r => r.id === "a1")!;
  const abby  = rows.find(r => r.id === "a2")!;
  assert.deepEqual(mason, { id: "a1", name: "Mason Brooks", contacts: 0, raisedCents: 0, outreachStatus: null, outreachNote: null, outreachAt: null });
  assert.equal(abby.contacts, 4);
  assert.equal(abby.raisedCents, 12500);
  assert.equal(abby.outreachStatus, "needs_follow_up");
  assert.equal(abby.outreachNote, "Only 4 contacts so far.");
});

// ── Sorting ───────────────────────────────────────────────────────────────

test("sortFollowUpRows: contacts ascending", () => {
  const rows = [
    { id: "a", name: "A", contacts: 10, raisedCents: 0, outreachStatus: null, outreachNote: null, outreachAt: null },
    { id: "b", name: "B", contacts: 0,  raisedCents: 0, outreachStatus: null, outreachNote: null, outreachAt: null },
    { id: "c", name: "C", contacts: 5,  raisedCents: 0, outreachStatus: null, outreachNote: null, outreachAt: null },
  ];
  assert.deepEqual(sortFollowUpRows(rows, "contacts_asc").map(r => r.id), ["b", "c", "a"]);
});

test("sortFollowUpRows: contacts descending", () => {
  const rows = [
    { id: "a", name: "A", contacts: 10, raisedCents: 0, outreachStatus: null, outreachNote: null, outreachAt: null },
    { id: "b", name: "B", contacts: 0,  raisedCents: 0, outreachStatus: null, outreachNote: null, outreachAt: null },
    { id: "c", name: "C", contacts: 5,  raisedCents: 0, outreachStatus: null, outreachNote: null, outreachAt: null },
  ];
  assert.deepEqual(sortFollowUpRows(rows, "contacts_desc").map(r => r.id), ["a", "c", "b"]);
});

test("sortFollowUpRows: raised ascending and descending", () => {
  const rows = [
    { id: "a", name: "A", contacts: 0, raisedCents: 62000, outreachStatus: null, outreachNote: null, outreachAt: null },
    { id: "b", name: "B", contacts: 0, raisedCents: 0,     outreachStatus: null, outreachNote: null, outreachAt: null },
    { id: "c", name: "C", contacts: 0, raisedCents: 12500, outreachStatus: null, outreachNote: null, outreachAt: null },
  ];
  assert.deepEqual(sortFollowUpRows(rows, "raised_asc").map(r => r.id), ["b", "c", "a"]);
  assert.deepEqual(sortFollowUpRows(rows, "raised_desc").map(r => r.id), ["a", "c", "b"]);
});

test("sortFollowUpRows: does not mutate the input array", () => {
  const rows = [
    { id: "a", name: "A", contacts: 10, raisedCents: 0, outreachStatus: null, outreachNote: null, outreachAt: null },
    { id: "b", name: "B", contacts: 0,  raisedCents: 0, outreachStatus: null, outreachNote: null, outreachAt: null },
  ];
  const original = rows.map(r => r.id);
  sortFollowUpRows(rows, "contacts_desc");
  assert.deepEqual(rows.map(r => r.id), original);
});

test("default sort constant is contacts ascending", () => {
  assert.equal(DEFAULT_FOLLOW_UP_SORT, "contacts_asc");
});

// ── Filtering ─────────────────────────────────────────────────────────────

test("filterFollowUpRows: 'all' returns every row unchanged", () => {
  const rows = [
    { id: "a", name: "A", contacts: 0, raisedCents: 0, outreachStatus: "needs_follow_up" as const, outreachNote: null, outreachAt: null },
    { id: "b", name: "B", contacts: 0, raisedCents: 0, outreachStatus: "resolved" as const, outreachNote: null, outreachAt: null },
    { id: "c", name: "C", contacts: 0, raisedCents: 0, outreachStatus: null, outreachNote: null, outreachAt: null },
  ];
  assert.equal(filterFollowUpRows(rows, "all").length, 3);
});

test("filterFollowUpRows: 'needs_follow_up' excludes resolved/contacted/null-status athletes", () => {
  const rows = [
    { id: "a", name: "A", contacts: 0, raisedCents: 0, outreachStatus: "needs_follow_up" as const, outreachNote: null, outreachAt: null },
    { id: "b", name: "B", contacts: 0, raisedCents: 0, outreachStatus: "resolved" as const, outreachNote: null, outreachAt: null },
    { id: "c", name: "C", contacts: 0, raisedCents: 0, outreachStatus: "contacted" as const, outreachNote: null, outreachAt: null },
    { id: "d", name: "D", contacts: 0, raisedCents: 0, outreachStatus: null, outreachNote: null, outreachAt: null },
  ];
  const filtered = filterFollowUpRows(rows, "needs_follow_up");
  assert.deepEqual(filtered.map(r => r.id), ["a"]);
});

// ── Print report title reflects the active filter ────────────────────────

test("buildFollowUpsReportTitle: all athletes", () => {
  assert.equal(buildFollowUpsReportTitle("all", 12, 12), "Fundraising Athlete Report");
});

test("buildFollowUpsReportTitle: needs follow up shows N of M", () => {
  assert.equal(buildFollowUpsReportTitle("needs_follow_up", 3, 12), "Needs Follow Up — 3 of 12 Athletes");
});

// ── Print data must preserve exactly the caller's given order ───────────

test("filter then sort composition preserves order for a downstream print consumer (no independent re-sort)", () => {
  const rows = [
    { id: "a", name: "A", contacts: 10, raisedCents: 0, outreachStatus: "needs_follow_up" as const, outreachNote: null, outreachAt: null },
    { id: "b", name: "B", contacts: 0,  raisedCents: 0, outreachStatus: "needs_follow_up" as const, outreachNote: null, outreachAt: null },
    { id: "c", name: "C", contacts: 5,  raisedCents: 0, outreachStatus: "resolved" as const, outreachNote: null, outreachAt: null },
  ];
  const sorted   = sortFollowUpRows(rows, "contacts_asc");
  const filtered = filterFollowUpRows(sorted, "needs_follow_up");
  // Print consumes `filtered` directly — its order must be exactly the
  // sorted order with non-matching rows removed, nothing re-sorted.
  assert.deepEqual(filtered.map(r => r.id), ["b", "a"]);
});
