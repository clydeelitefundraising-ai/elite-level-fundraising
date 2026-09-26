import test from "node:test";
import assert from "node:assert/strict";
import {
  notificationBelongsToTeam,
  mergeReadReceipts,
  parseSenderKeyFromReferenceUrl,
  buildMessageReferenceUrl,
  buildAnnouncementReferenceUrl,
  buildCalendarEventUrl,
  filterMessageNotifications,
  isTypeVisibleToMember,
  markAllNotificationsRead,
  markAllNotificationsReadForCoach,
  markNotificationSeen,
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

// ── buildAnnouncementReferenceUrl / buildCalendarEventUrl ────────────────────
//
// Regression coverage for the generic-destination bug: announcement and
// calendar/event push/reference URLs previously carried no entity id at
// all (every announcement pushed the same `/team/{slug}/notifications`,
// every event pushed the same `/team/{slug}/calendar`), so a tap could
// never land on the specific item — only the DM path (buildMessageReferenceUrl
// above) included its entity id. These two mirror that same shape.
//
// buildAnnouncementReferenceUrl points at Communications -> Updates (not the
// Notifications inbox): that's the surface with the actual announcement
// content (comments/likes/attachments/read receipts — see UpdateCard.tsx),
// so both the push tap and the in-app Notifications-inbox row tap land on
// the real announcement instead of a generic list entry. See
// UpdatesWorkspaceView.tsx's findAnnouncementById for the consumer side
// (mirrors calendarHelpers.ts's findEventById).

test("buildAnnouncementReferenceUrl: includes the persisted announcement id, pointed at Communications -> Updates", () => {
  assert.equal(
    buildAnnouncementReferenceUrl("monroe-valley", "ann-123"),
    "/team/monroe-valley/communications?tab=updates&announcementId=ann-123",
  );
});

test("buildCalendarEventUrl: includes the persisted event id", () => {
  assert.equal(
    buildCalendarEventUrl("monroe-valley", "evt-456"),
    "/team/monroe-valley/calendar?eventId=evt-456",
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

// ── Mark All Read (coach + member) ───────────────────────────────────────────
//
// Regression coverage for the coach Mark All Read extension. These stub
// global fetch (same technique as nativeFileShare.test.ts's globalThis
// stubbing) since notifications.ts's write functions are thin PostgREST
// fetch wrappers with no live DB in this test environment — the assertions
// are on exactly which table/columns/method each call uses, which is
// precisely what distinguishes "actor-specific read row" from "touching the
// shared notifications row or another actor's read table".

type FetchCall = { url: string; method: string; body: unknown };

function mockFetchSequence(responses: { status?: number; json?: unknown }[]): { calls: FetchCall[]; restore: () => void } {
  const calls: FetchCall[] = [];
  let i = 0;
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const rawBody = init?.body;
    const body = typeof rawBody === "string" ? JSON.parse(rawBody) : undefined;
    calls.push({ url: String(url), method, body });
    const resp = responses[Math.min(i, responses.length - 1)];
    i++;
    const status = resp.status ?? 200;
    return {
      ok: status < 400,
      status,
      json: async () => resp.json ?? {},
      text: async () => JSON.stringify(resp.json ?? {}),
    } as Response;
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

test("markAllNotificationsReadForCoach: writes to notification_coach_reads keyed by coach_id for every team notification id, never dismissed, never the shared row", async () => {
  const { calls, restore } = mockFetchSequence([
    { json: [{ id: "n1" }, { id: "n2" }] }, // GET notifications for the team
    { status: 200 },                        // POST upsert
  ]);
  try {
    await markAllNotificationsReadForCoach("team-1", "coach-1");
  } finally {
    restore();
  }

  assert.equal(calls.length, 2, "exactly one read of the team's notifications, one write of read state");
  assert.equal(calls[0].method, "GET");
  assert.match(calls[0].url, /\/notifications\?team_id=eq\.team-1/, "only ever reads the given team's notifications");

  assert.equal(calls[1].method, "POST");
  assert.match(calls[1].url, /\/notification_coach_reads\?on_conflict=notification_id,coach_id/);
  const rows = calls[1].body as Array<Record<string, unknown>>;
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.equal(row.coach_id, "coach-1");
    assert.equal("member_id" in row, false, "must never write to the member read table's column");
    assert.equal("dismissed" in row, false, "notification_coach_reads has no dismissed column — must never send one");
    assert.equal(typeof row.read_at, "string");
  }
  assert.deepEqual(rows.map(r => r.notification_id).sort(), ["n1", "n2"]);
});

test("markAllNotificationsReadForCoach: no team notifications is a safe no-op — no write attempted", async () => {
  const { calls, restore } = mockFetchSequence([{ json: [] }]);
  try {
    await markAllNotificationsReadForCoach("team-1", "coach-1");
  } finally {
    restore();
  }
  assert.equal(calls.length, 1, "only the read happens; nothing to write");
});

test("markAllNotificationsRead (member): unaffected by the coach extension — still writes notification_reads keyed by member_id with dismissed:false", async () => {
  const { calls, restore } = mockFetchSequence([
    { json: [{ id: "n1" }] },
    { status: 200 },
  ]);
  try {
    await markAllNotificationsRead("team-1", "member-1");
  } finally {
    restore();
  }

  assert.equal(calls[1].method, "POST");
  assert.match(calls[1].url, /\/notification_reads\?on_conflict=notification_id,member_id/);
  const rows = calls[1].body as Array<Record<string, unknown>>;
  assert.equal(rows[0].member_id, "member-1");
  assert.equal(rows[0].dismissed, false);
  assert.equal("coach_id" in rows[0], false);
});

test("markNotificationSeen (coach): single-notification read still writes to notification_coach_reads, one row, team-scoped first", async () => {
  const { calls, restore } = mockFetchSequence([
    { json: [{ team_id: "team-1" }] }, // getNotificationTeamId lookup
    { status: 200 },                    // the actual coach read write
  ]);
  let result;
  try {
    result = await markNotificationSeen({ kind: "coach", id: "coach-1" }, "n1", "team-1");
  } finally {
    restore();
  }

  assert.deepEqual(result, { ok: true });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].method, "POST");
  assert.match(calls[1].url, /\/notification_coach_reads\?on_conflict=notification_id,coach_id/);
  const row = calls[1].body as Record<string, unknown>;
  assert.equal(row.coach_id, "coach-1");
  assert.equal(row.notification_id, "n1");
});

test("markNotificationSeen (coach): a notification belonging to a different team is refused before any write — cross-team bulk/single-mark protection", async () => {
  const { calls, restore } = mockFetchSequence([
    { json: [{ team_id: "team-B" }] }, // the notification actually belongs to team-B
  ]);
  let result;
  try {
    result = await markNotificationSeen({ kind: "coach", id: "coach-1" }, "n1", "team-A");
  } finally {
    restore();
  }

  assert.deepEqual(result, { ok: false, error: "Not found" });
  assert.equal(calls.length, 1, "no write attempted once the team check fails");
});
