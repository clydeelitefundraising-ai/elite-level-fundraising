import test from "node:test";
import assert from "node:assert/strict";
import {
  notificationBelongsToTeam,
  mergeReadReceipts,
  parseSenderKeyFromReferenceUrl,
  buildMessageReferenceUrl,
  filterMessageNotifications,
  isTypeVisibleToMember,
} from "./notifications.ts";

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

// ── Phase 10: message-type notification visibility ──────────────────────────

test("parseSenderKeyFromReferenceUrl: extracts the sender key", () => {
  assert.equal(parseSenderKeyFromReferenceUrl("/team/slug/messages/t1?sender=coach%3Aabc"), "coach:abc");
});

test("parseSenderKeyFromReferenceUrl: null when absent", () => {
  assert.equal(parseSenderKeyFromReferenceUrl("/team/slug/messages/t1"), null);
  assert.equal(parseSenderKeyFromReferenceUrl(null), null);
});

test("buildMessageReferenceUrl: builds a valid deep link with an encoded sender key", () => {
  assert.equal(
    buildMessageReferenceUrl("monroe-valley", "t1", "member:xyz"),
    "/team/monroe-valley/messages/t1?sender=member%3Axyz",
  );
});

function messageNotif(id: string, teamId: string, threadId: string | null, senderKey: string | null) {
  return {
    id,
    team_id: teamId,
    type: "message",
    reference_id: threadId,
    reference_url: threadId ? buildMessageReferenceUrl("slug", threadId, senderKey ?? "coach:unknown") : null,
  };
}

test("filterMessageNotifications: an actual participant sees the message notification", () => {
  const notif = messageNotif("n1", "team-A", "thread-1", "coach:sender");
  const participants = new Map([["thread-1", new Set(["coach:sender", "member:viewer"])]]);
  const result = filterMessageNotifications([notif], "team-A", participants, "member:viewer");
  assert.deepEqual(result.map(n => n.id), ["n1"]);
});

test("filterMessageNotifications: a non-participant does not see it", () => {
  const notif = messageNotif("n1", "team-A", "thread-1", "coach:sender");
  const participants = new Map([["thread-1", new Set(["coach:sender", "member:viewer"])]]);
  const result = filterMessageNotifications([notif], "team-A", participants, "member:someone-else");
  assert.deepEqual(result, []);
});

test("filterMessageNotifications: the sender does not see their own notification", () => {
  const notif = messageNotif("n1", "team-A", "thread-1", "coach:sender");
  const participants = new Map([["thread-1", new Set(["coach:sender", "member:viewer"])]]);
  const result = filterMessageNotifications([notif], "team-A", participants, "coach:sender");
  assert.deepEqual(result, []);
});

test("filterMessageNotifications: a participant of a DIFFERENT thread does not see it", () => {
  const notif = messageNotif("n1", "team-A", "thread-1", "coach:sender");
  // "member:viewer" is a participant of thread-2, not thread-1
  const participants = new Map([
    ["thread-1", new Set(["coach:sender"])],
    ["thread-2", new Set(["coach:sender", "member:viewer"])],
  ]);
  const result = filterMessageNotifications([notif], "team-A", participants, "member:viewer");
  assert.deepEqual(result, []);
});

test("filterMessageNotifications: cross-team tampering — a notification belonging to a different team is never exposed, even to an actual thread participant", () => {
  const notif = messageNotif("n1", "team-B", "thread-1", "coach:sender");
  const participants = new Map([["thread-1", new Set(["coach:sender", "member:viewer"])]]);
  // Caller is authenticated against team-A; the notification actually
  // belongs to team-B.
  const result = filterMessageNotifications([notif], "team-A", participants, "member:viewer");
  assert.deepEqual(result, []);
});

// ── Phase 10: request-type notifications are never shown to members ────────

test("isTypeVisibleToMember: request is never visible to a member (Head Coach action queue only)", () => {
  assert.equal(isTypeVisibleToMember("request"), false);
});

test("isTypeVisibleToMember: every other existing type stays visible to members", () => {
  assert.equal(isTypeVisibleToMember("announcement"), true);
  assert.equal(isTypeVisibleToMember("file_upload"), true);
  assert.equal(isTypeVisibleToMember("calendar_event"), true);
  assert.equal(isTypeVisibleToMember("fundraiser"), true);
});
