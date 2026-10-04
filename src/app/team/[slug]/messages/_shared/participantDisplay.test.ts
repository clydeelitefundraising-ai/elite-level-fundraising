// Group Messaging G2 — pure-function tests for isGroupThread/threadDisplayTitle
// and (review correction) participantSecondaryLabel.
import test from "node:test";
import assert from "node:assert/strict";
import { isGroupThread, threadDisplayTitle, participantSecondaryLabel } from "./participantDisplay.ts";
import type { ResolvedParticipant } from "@/lib/messages";

function participant(overrides: Partial<ResolvedParticipant>): ResolvedParticipant {
  return {
    id: "p1", actor_type: "member", coach_id: null, member_id: "m1", platform_admin_id: null,
    is_auto_included: false, is_observer: false, removed_at: null,
    name: "Carter Sanders", role: "athlete", athlete_id: "athlete-1", photo_url: null,
    ...overrides,
  };
}

test("isGroupThread: true only for thread_type='group'", () => {
  assert.equal(isGroupThread({ thread_type: "group" }), true);
  assert.equal(isGroupThread({ thread_type: "dm" }), false);
});

test("threadDisplayTitle: a group uses group_name, never participant names", () => {
  const participants = [
    participant({ id: "p1", actor_type: "coach", coach_id: "coach-1", member_id: null, name: "Coach Smith", role: "head_coach" }),
    participant({ id: "p2", name: "Carter Sanders", role: "athlete" }),
  ];
  const title = threadDisplayTitle({ thread_type: "group", group_name: "Varsity Jumps" }, participants, "coach", "coach-1");
  assert.equal(title, "Varsity Jumps");
});

test("threadDisplayTitle: a DM still uses conversationDisplayName (participant names)", () => {
  const participants = [
    participant({ id: "p1", actor_type: "coach", coach_id: "coach-1", member_id: null, name: "Coach Smith", role: "head_coach" }),
    participant({ id: "p2", name: "Carter Sanders", role: "athlete" }),
  ];
  const title = threadDisplayTitle({ thread_type: "dm", group_name: null }, participants, "coach", "coach-1");
  assert.equal(title, "Carter Sanders");
});

test("threadDisplayTitle: a group with a null name falls back to a safe generic label, never crashes", () => {
  const title = threadDisplayTitle({ thread_type: "group", group_name: null }, [], "coach", "coach-1");
  assert.equal(title, "Group");
});

// ── participantSecondaryLabel (G2 review correction) ────────────────────────

test("participantSecondaryLabel: an athlete shows 'Athlete', never the raw role string", () => {
  const p = participant({ actor_type: "member", role: "athlete", is_auto_included: false });
  assert.equal(participantSecondaryLabel(p), "Athlete");
});

test("participantSecondaryLabel: a Head Coach shows 'Head Coach', never 'head_coach'", () => {
  const p = participant({ actor_type: "coach", coach_id: "c1", member_id: null, role: "head_coach", is_auto_included: false });
  assert.equal(participantSecondaryLabel(p), "Head Coach");
  assert.ok(!participantSecondaryLabel(p).includes("_"), "must never leak a raw snake_case role enum");
});

test("participantSecondaryLabel: an Assistant Coach shows a human label, never 'assistant_coach'", () => {
  const p = participant({ actor_type: "coach", coach_id: "c1", member_id: null, role: "assistant_coach", is_auto_included: false });
  const label = participantSecondaryLabel(p);
  assert.ok(!label.includes("_"));
  assert.ok(label.toLowerCase().includes("coach"));
});

test("participantSecondaryLabel: a Booster shows 'Booster', never the raw role string", () => {
  const p = participant({ actor_type: "coach", coach_id: "c1", member_id: null, role: "booster", is_auto_included: false });
  assert.equal(participantSecondaryLabel(p), "Booster");
});

test("participantSecondaryLabel: an auto-included parent shows the generic family label, never a role string or 'is_auto_included'", () => {
  const p = participant({ actor_type: "member", role: "parent", is_auto_included: true });
  const label = participantSecondaryLabel(p);
  assert.equal(label, "Family member · Included automatically");
  assert.ok(!label.includes("is_auto_included"));
  assert.ok(!label.toLowerCase().includes("parent"), "must not attribute a specific relationship client-side");
});

test("participantSecondaryLabel: a DIRECTLY-selected parent-role row (should not occur per G1, but defensively) still shows a human role label, not raw text", () => {
  // is_auto_included=false means this is NOT treated as the family-mirror
  // case regardless of role — defensive coverage only; G1 never actually
  // produces this combination (parents are never a direct selection).
  const p = participant({ actor_type: "member", role: "parent", is_auto_included: false });
  assert.equal(participantSecondaryLabel(p), "Parent");
});
