import test from "node:test";
import assert from "node:assert/strict";
import { notificationBelongsToTeam, mergeReadReceipts } from "./notifications.ts";

// ── notificationBelongsToTeam — cross-team protection ───────────────────────
//
// This is the pure check at the heart of Phase 9's cross-team fix: both
// announcements/[id]/reads and notifications/read (and the new
// announcements/[id]/seen) refuse to act on a notification id unless its
// actual team_id matches the caller's own authenticated team.

test("notificationBelongsToTeam: same team_id is allowed", () => {
  assert.equal(notificationBelongsToTeam("team-A", "team-A"), true);
});

test("notificationBelongsToTeam: a different team_id is rejected (cross-team tampering)", () => {
  assert.equal(notificationBelongsToTeam("team-B", "team-A"), false);
});

test("notificationBelongsToTeam: a notification that couldn't be found (null) is rejected", () => {
  assert.equal(notificationBelongsToTeam(null, "team-A"), false);
});

// ── mergeReadReceipts — member + coach aggregation ──────────────────────────

test("mergeReadReceipts: member-only reads resolve to member entries", () => {
  const result = mergeReadReceipts(
    [{ member_id: "m1", read_at: "2026-01-01T00:00:00Z" }],
    [],
    [{ id: "m1", name: "Jane Smith", role: "parent" }],
    [],
  );
  assert.deepEqual(result, [{ id: "m1", kind: "member", name: "Jane Smith", role: "parent", read_at: "2026-01-01T00:00:00Z" }]);
});

test("mergeReadReceipts: coach reads are included — this is the fix for the previous silent exclusion", () => {
  const result = mergeReadReceipts(
    [],
    [{ coach_id: "c1", read_at: "2026-01-01T00:00:00Z" }],
    [],
    [{ id: "c1", name: "Coach Smith", role: "head_coach" }],
  );
  assert.deepEqual(result, [{ id: "c1", kind: "coach", name: "Coach Smith", role: "head_coach", read_at: "2026-01-01T00:00:00Z" }]);
});

test("mergeReadReceipts: member and coach reads are combined into one list", () => {
  const result = mergeReadReceipts(
    [{ member_id: "m1", read_at: "2026-01-01T00:00:02Z" }],
    [{ coach_id: "c1", read_at: "2026-01-01T00:00:01Z" }],
    [{ id: "m1", name: "Jane Smith", role: "parent" }],
    [{ id: "c1", name: "Coach Smith", role: "head_coach" }],
  );
  assert.equal(result.length, 2);
  assert.deepEqual(result.map(r => r.kind).sort(), ["coach", "member"]);
});

test("mergeReadReceipts: sorted chronologically, oldest seen first", () => {
  const result = mergeReadReceipts(
    [{ member_id: "m1", read_at: "2026-01-01T00:00:05Z" }],
    [{ coach_id: "c1", read_at: "2026-01-01T00:00:01Z" }],
    [{ id: "m1", name: "Jane Smith", role: "parent" }],
    [{ id: "c1", name: "Coach Smith", role: "head_coach" }],
  );
  assert.deepEqual(result.map(r => r.id), ["c1", "m1"]);
});

test("mergeReadReceipts: a read row whose member/coach couldn't be resolved is dropped, not shown broken", () => {
  const result = mergeReadReceipts(
    [{ member_id: "removed-member", read_at: "2026-01-01T00:00:00Z" }],
    [],
    [], // name lookup came back empty — e.g. member removed from the team since reading
    [],
  );
  assert.deepEqual(result, []);
});

test("mergeReadReceipts: no reads at all returns an empty list", () => {
  assert.deepEqual(mergeReadReceipts([], [], [], []), []);
});
