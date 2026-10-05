// Group Messaging G2/G3B — pure-function tests for groupMessaging.ts.
import test from "node:test";
import assert from "node:assert/strict";
import {
  validateGroupNameClient, searchDirectoryEntries, MAX_GROUP_NAME_LENGTH, MAX_GROUP_SEARCH_RESULTS,
  removalPayloadForParticipant, isLastActiveCoach,
  searchRosterAthletes, athleteMetaLabel, athleteJoinStatusLabel, athleteSecondaryLabel,
  buildManageGroupRows, countGroupPeople,
  type RosterAthleteEntry, type RosterAssignmentWithStatus, type ManageGroupParticipantLike,
} from "./groupMessaging.ts";

// ── validateGroupNameClient ─────────────────────────────────────────────────

test("validateGroupNameClient: required", () => {
  assert.equal(validateGroupNameClient("").ok, false);
  assert.equal(validateGroupNameClient("   ").ok, false);
});

test("validateGroupNameClient: trims", () => {
  const result = validateGroupNameClient("  Varsity Jumps  ");
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.name, "Varsity Jumps");
});

test("validateGroupNameClient: enforces the 80-char max", () => {
  assert.equal(MAX_GROUP_NAME_LENGTH, 80);
  assert.equal(validateGroupNameClient("a".repeat(81)).ok, false);
  assert.equal(validateGroupNameClient("a".repeat(80)).ok, true);
});

// ── searchDirectoryEntries ───────────────────────────────────────────────────

const ROSTER = [
  { id: "a1", name: "Carter Sanders" },
  { id: "a2", name: "Carlos Ramirez" },
  { id: "a3", name: "Colin Morgan" },
  { id: "a4", name: "Abby Cooper" },
];

test("searchDirectoryEntries: empty query returns no results (search-first, no giant roster)", () => {
  assert.deepEqual(searchDirectoryEntries(ROSTER, "", new Set()), []);
});

test("searchDirectoryEntries: partial case-insensitive match", () => {
  const results = searchDirectoryEntries(ROSTER, "car", new Set());
  assert.deepEqual(results.map(r => r.id).sort(), ["a1", "a2"]);
});

test("searchDirectoryEntries: excludes already-selected/active ids", () => {
  const results = searchDirectoryEntries(ROSTER, "car", new Set(["a1"]));
  assert.deepEqual(results.map(r => r.id), ["a2"]);
});

test("searchDirectoryEntries: results are capped at MAX_GROUP_SEARCH_RESULTS", () => {
  const big = Array.from({ length: 20 }, (_, i) => ({ id: `id-${i}`, name: `Match Athlete ${i}` }));
  const results = searchDirectoryEntries(big, "match", new Set());
  assert.equal(results.length, MAX_GROUP_SEARCH_RESULTS);
});

test("searchDirectoryEntries: selected people remain excluded even as the query changes (simulated via excludeIds)", () => {
  // Selection state lives in the component, not this function — this test
  // proves the function itself always honors whatever exclude set it's
  // given, which is what keeps a selected person out of search results
  // regardless of what the user types next.
  const afterSelectingCarter = searchDirectoryEntries(ROSTER, "co", new Set(["a1"]));
  assert.deepEqual(afterSelectingCarter.map(r => r.id).sort(), ["a3", "a4"]);
});

test("searchDirectoryEntries: no match returns an empty array", () => {
  assert.deepEqual(searchDirectoryEntries(ROSTER, "zzz", new Set()), []);
});

// ── G3 production bug report — exact repro examples ─────────────────────────
// Confirms the search helper itself is correct (the production bug was a
// genuinely empty directory response, not a broken search/filter) by
// reproducing the exact query/name pairs from the bug report.

test("G3 repro: query 'f' matches any athlete/staff whose name contains f, case-insensitively", () => {
  const roster = [
    { id: "s1", name: "Coach Franklin" },
    { id: "a1", name: "Carter Sanders" },
  ];
  const results = searchDirectoryEntries(roster, "f", new Set());
  assert.deepEqual(results.map(r => r.id), ["s1"]);
});

test("G3 repro: query 'car' matches Carter Sanders when present", () => {
  const roster = [{ id: "a1", name: "Carter Sanders" }, { id: "a2", name: "Abby Cooper" }];
  const results = searchDirectoryEntries(roster, "car", new Set());
  assert.deepEqual(results.map(r => r.id), ["a1"]);
});

test("G3 repro: query 'smith' matches Coach Smith when present, case-insensitively", () => {
  const roster = [{ id: "s1", name: "Coach Smith" }, { id: "s2", name: "Coach Jones" }];
  const results = searchDirectoryEntries(roster, "SMITH", new Set());
  assert.deepEqual(results.map(r => r.id), ["s1"]);
});

// ── removalPayloadForParticipant (G2 review correction) ─────────────────────
//
// Verifies the exact identity mapping end-to-end: a directly-selected
// athlete's message_thread_participants.member_id IS the team_members.id
// the directory originally returned and the G1 DELETE endpoint expects back
// as athleteId — never the athletes-table athlete_id, never an account id.
// A coach row's coach_id IS team_coaches.id regardless of its role
// (head_coach/assistant_coach/booster all map the same way) — the SAME
// identifier G1 expects back as staffId.

test("removalPayloadForParticipant: a direct athlete maps to { athleteId: member_id }, the exact team_members.id", () => {
  const athlete = { actor_type: "member" as const, coach_id: null, member_id: "team-members-row-id-123", is_auto_included: false };
  assert.deepEqual(removalPayloadForParticipant(athlete), { athleteId: "team-members-row-id-123" });
});

test("removalPayloadForParticipant: a Head Coach maps to { staffId: coach_id }, the exact team_coaches.id", () => {
  const headCoach = { actor_type: "coach" as const, coach_id: "team-coaches-row-id-abc", member_id: null, is_auto_included: false };
  assert.deepEqual(removalPayloadForParticipant(headCoach), { staffId: "team-coaches-row-id-abc" });
});

test("removalPayloadForParticipant: an Assistant Coach maps to staffId exactly like Head Coach — role never changes the identity column", () => {
  const assistantCoach = { actor_type: "coach" as const, coach_id: "team-coaches-row-id-def", member_id: null, is_auto_included: false };
  assert.deepEqual(removalPayloadForParticipant(assistantCoach), { staffId: "team-coaches-row-id-def" });
});

test("removalPayloadForParticipant: a Booster (team_coaches row) maps to staffId identically to any other coach role", () => {
  const booster = { actor_type: "coach" as const, coach_id: "team-coaches-row-id-ghi", member_id: null, is_auto_included: false };
  assert.deepEqual(removalPayloadForParticipant(booster), { staffId: "team-coaches-row-id-ghi" });
});

test("removalPayloadForParticipant: an auto-included (family-mirrored) parent is NEVER directly removable, regardless of actor_type", () => {
  const autoParent = { actor_type: "member" as const, coach_id: null, member_id: "team-members-row-id-parent", is_auto_included: true };
  assert.equal(removalPayloadForParticipant(autoParent), null);
});

test("removalPayloadForParticipant: a row missing its own identity id is refused rather than sending a malformed payload", () => {
  assert.equal(removalPayloadForParticipant({ actor_type: "member", coach_id: null, member_id: null, is_auto_included: false }), null);
  assert.equal(removalPayloadForParticipant({ actor_type: "coach", coach_id: null, member_id: null, is_auto_included: false }), null);
});

// ── isLastActiveCoach (G2 review correction — mirrors G1's own guard) ──────

test("isLastActiveCoach: true when no OTHER active coach remains", () => {
  const participants = [{ actor_type: "coach" as const, coach_id: "only-coach" }];
  assert.equal(isLastActiveCoach(participants, "only-coach"), true);
});

test("isLastActiveCoach: false when at least one other coach remains (Head Coach + Assistant Coach)", () => {
  const participants = [
    { actor_type: "coach" as const, coach_id: "head-coach-id" },
    { actor_type: "coach" as const, coach_id: "assistant-coach-id" },
  ];
  assert.equal(isLastActiveCoach(participants, "assistant-coach-id"), false);
  assert.equal(isLastActiveCoach(participants, "head-coach-id"), false);
});

test("isLastActiveCoach: a booster coach counts as an active coach for this guard — it only cares about actor_type, not role", () => {
  const participants = [
    { actor_type: "coach" as const, coach_id: "head-coach-id" },
    { actor_type: "coach" as const, coach_id: "booster-coach-id" },
  ];
  assert.equal(isLastActiveCoach(participants, "head-coach-id"), false);
});

test("isLastActiveCoach: athlete/parent member rows never count toward the coach count", () => {
  const participants = [
    { actor_type: "coach" as const, coach_id: "only-coach" },
    { actor_type: "member" as const, coach_id: null },
  ];
  assert.equal(isLastActiveCoach(participants, "only-coach"), true);
});

// ═══════════════════════════════════════════════════════════════════════════
// Group Messaging G3B — full-roster picker, Manage Group, count
// ═══════════════════════════════════════════════════════════════════════════

// ── searchRosterAthletes (GROUP DIRECTORY / PICKER) ─────────────────────────

const FULL_ROSTER: RosterAthleteEntry[] = [
  { id: "athlete-carter", name: "Carter Sanders", event: "Long Jump", classYear: "JR", joined: true },
  { id: "athlete-colin",  name: "Colin Morgan",   event: "Triple Jump", classYear: "SR", joined: false },
  { id: "athlete-abby",   name: "Abby Cooper",    event: "Sprints", classYear: "SO", joined: false },
  { id: "athlete-jake",   name: "Jake Thompson",  event: null, classYear: null, joined: true },
];

test("searchRosterAthletes: full roster athlete appears even when joined=false", () => {
  const results = searchRosterAthletes(FULL_ROSTER, "colin", new Set());
  assert.deepEqual(results.map(a => a.id), ["athlete-colin"]);
  assert.equal(results[0].joined, false);
});

test("searchRosterAthletes: a joined athlete appears too", () => {
  const results = searchRosterAthletes(FULL_ROSTER, "carter", new Set());
  assert.deepEqual(results.map(a => a.id), ["athlete-carter"]);
  assert.equal(results[0].joined, true);
});

test("searchRosterAthletes: partial name match", () => {
  const results = searchRosterAthletes(FULL_ROSTER, "cart", new Set());
  assert.deepEqual(results.map(a => a.id), ["athlete-carter"]);
});

test("searchRosterAthletes: case-insensitive", () => {
  const results = searchRosterAthletes(FULL_ROSTER, "CARTER", new Set());
  assert.deepEqual(results.map(a => a.id), ["athlete-carter"]);
});

test("searchRosterAthletes: search by event metadata ('long jump' finds only Carter, not Colin's Triple Jump)", () => {
  const results = searchRosterAthletes(FULL_ROSTER, "long jump", new Set());
  assert.deepEqual(results.map(a => a.id), ["athlete-carter"]);
});

test("searchRosterAthletes: search by classYear metadata ('JR' finds Carter)", () => {
  const results = searchRosterAthletes(FULL_ROSTER, "JR", new Set());
  assert.deepEqual(results.map(a => a.id), ["athlete-carter"]);
});

test("searchRosterAthletes: excludes already-assigned/selected ids", () => {
  const results = searchRosterAthletes(FULL_ROSTER, "o", new Set(["athlete-colin"]));
  assert.ok(!results.some(a => a.id === "athlete-colin"));
});

test("searchRosterAthletes: empty query returns nothing (search-first)", () => {
  assert.deepEqual(searchRosterAthletes(FULL_ROSTER, "", new Set()), []);
});

test("searchRosterAthletes: no match returns an empty array", () => {
  assert.deepEqual(searchRosterAthletes(FULL_ROSTER, "zzz", new Set()), []);
});

test("searchRosterAthletes: results capped at MAX_GROUP_SEARCH_RESULTS", () => {
  const big: RosterAthleteEntry[] = Array.from({ length: 20 }, (_, i) => ({
    id: `id-${i}`, name: `Match Athlete ${i}`, event: null, classYear: null, joined: false,
  }));
  const results = searchRosterAthletes(big, "match", new Set());
  assert.equal(results.length, MAX_GROUP_SEARCH_RESULTS);
});

// ── athleteMetaLabel / athleteJoinStatusLabel / athleteSecondaryLabel ───────

test("athleteMetaLabel: joins event and classYear with a middle dot", () => {
  assert.equal(athleteMetaLabel("Long Jump", "JR"), "Long Jump · JR");
});

test("athleteMetaLabel: degrades cleanly when only classYear is available", () => {
  assert.equal(athleteMetaLabel(null, "JR"), "JR");
});

test("athleteMetaLabel: degrades cleanly when only event is available", () => {
  assert.equal(athleteMetaLabel("Long Jump", null), "Long Jump");
});

test("athleteMetaLabel: empty string when neither is available (never a stray separator)", () => {
  assert.equal(athleteMetaLabel(null, null), "");
  assert.equal(athleteMetaLabel("", ""), "");
});

test("athleteJoinStatusLabel: neutral copy for an unjoined athlete, null for a joined one", () => {
  assert.equal(athleteJoinStatusLabel(false), "Hasn't joined ELF yet");
  assert.equal(athleteJoinStatusLabel(true), null);
});

test("athleteSecondaryLabel: joined athlete shows plain 'Athlete'", () => {
  assert.equal(athleteSecondaryLabel(true), "Athlete");
});

test("athleteSecondaryLabel: unjoined athlete shows 'Athlete · Hasn't joined ELF yet'", () => {
  assert.equal(athleteSecondaryLabel(false), "Athlete · Hasn't joined ELF yet");
});

// ── buildManageGroupRows / countGroupPeople (MANAGE + COUNT) ────────────────

function participant(overrides: Partial<ManageGroupParticipantLike>): ManageGroupParticipantLike {
  return {
    id: "p1", actor_type: "member", coach_id: null, member_id: "m1",
    is_auto_included: false, name: "Someone", role: "athlete", photo_url: null,
    ...overrides,
  };
}

test("buildManageGroupRows: a JOINED assigned athlete appears exactly ONCE, never also from their own participant row", () => {
  const rosterAssignments: RosterAssignmentWithStatus[] = [{ athlete_id: "athlete-carter", name: "Carter Sanders", joined: true }];
  const participants: ManageGroupParticipantLike[] = [
    participant({ id: "coach-1", actor_type: "coach", coach_id: "coach-1", member_id: null, name: "Coach", role: "head_coach" }),
    // Carter's own DIRECT participant row — must be excluded from display
    // entirely; he's already represented via the roster-assignment row.
    participant({ id: "m-carter", actor_type: "member", member_id: "m-carter", is_auto_included: false, name: "Carter Sanders", role: "athlete" }),
  ];
  const rows = buildManageGroupRows(rosterAssignments, participants);
  const athleteRows = rows.filter(r => r.kind === "athlete");
  assert.equal(athleteRows.length, 1, "Carter must appear exactly once");
  assert.equal(rows.length, 2, "exactly coach + Carter — Carter's direct participant row must not ALSO appear as a separate row");
  assert.ok(!rows.some(r => (r.kind === "family" || r.kind === "staff") && r.participant.id === "m-carter"));
});

test("buildManageGroupRows: an UNJOINED assigned athlete appears exactly once, with joined=false", () => {
  const rosterAssignments: RosterAssignmentWithStatus[] = [{ athlete_id: "athlete-colin", name: "Colin Morgan", joined: false }];
  const rows = buildManageGroupRows(rosterAssignments, []);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, "athlete");
  if (rows[0].kind === "athlete") assert.equal(rows[0].joined, false);
});

test("buildManageGroupRows: auto-included family participant is retained and distinct from an athlete row", () => {
  const rosterAssignments: RosterAssignmentWithStatus[] = [{ athlete_id: "athlete-carter", name: "Carter Sanders", joined: true }];
  const participants: ManageGroupParticipantLike[] = [
    participant({ id: "m-mom", actor_type: "member", member_id: "m-mom", is_auto_included: true, name: "Mom", role: "parent" }),
  ];
  const rows = buildManageGroupRows(rosterAssignments, participants);
  const familyRows = rows.filter(r => r.kind === "family");
  assert.equal(familyRows.length, 1);
  if (familyRows[0].kind === "family") assert.equal(familyRows[0].participant.name, "Mom");
});

test("buildManageGroupRows: staff rows are retained and ordered first", () => {
  const participants: ManageGroupParticipantLike[] = [
    participant({ id: "coach-1", actor_type: "coach", coach_id: "coach-1", name: "Coach Smith", role: "head_coach" }),
  ];
  const rows = buildManageGroupRows([], participants);
  assert.equal(rows[0].kind, "staff");
});

test("countGroupPeople: a joined athlete is counted once, not twice (roster assignment + their own participant row)", () => {
  const rosterAssignments: RosterAssignmentWithStatus[] = [{ athlete_id: "athlete-carter", name: "Carter Sanders", joined: true }];
  const participants: ManageGroupParticipantLike[] = [
    participant({ id: "m-carter", actor_type: "member", member_id: "m-carter", is_auto_included: false }),
  ];
  assert.equal(countGroupPeople(rosterAssignments, participants), 1);
});

test("countGroupPeople: a roster-only (unjoined) athlete is still counted", () => {
  const rosterAssignments: RosterAssignmentWithStatus[] = [{ athlete_id: "athlete-colin", name: "Colin Morgan", joined: false }];
  assert.equal(countGroupPeople(rosterAssignments, []), 1);
});

test("countGroupPeople: auto-included family counted once each", () => {
  const participants: ManageGroupParticipantLike[] = [
    participant({ id: "m-mom", actor_type: "member", is_auto_included: true }),
    participant({ id: "m-dad", actor_type: "member", is_auto_included: true }),
  ];
  assert.equal(countGroupPeople([], participants), 2);
});

test("countGroupPeople: staff counted once each", () => {
  const participants: ManageGroupParticipantLike[] = [
    participant({ id: "coach-1", actor_type: "coach", coach_id: "coach-1" }),
    participant({ id: "coach-2", actor_type: "coach", coach_id: "coach-2" }),
  ];
  assert.equal(countGroupPeople([], participants), 2);
});

test("countGroupPeople: full mixed group — 2 athletes (1 joined, 1 not) + 1 staff + 1 family = 4", () => {
  const rosterAssignments: RosterAssignmentWithStatus[] = [
    { athlete_id: "athlete-carter", name: "Carter Sanders", joined: true },
    { athlete_id: "athlete-colin", name: "Colin Morgan", joined: false },
  ];
  const participants: ManageGroupParticipantLike[] = [
    participant({ id: "coach-1", actor_type: "coach", coach_id: "coach-1" }),
    participant({ id: "m-carter", actor_type: "member", member_id: "m-carter", is_auto_included: false }),
    participant({ id: "m-mom", actor_type: "member", is_auto_included: true }),
  ];
  assert.equal(countGroupPeople(rosterAssignments, participants), 4);
});
