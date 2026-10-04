// Group Messaging G2 — pure-function tests for groupMessaging.ts.
import test from "node:test";
import assert from "node:assert/strict";
import {
  validateGroupNameClient, searchDirectoryEntries, MAX_GROUP_NAME_LENGTH, MAX_GROUP_SEARCH_RESULTS,
  removalPayloadForParticipant, isLastActiveCoach,
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
