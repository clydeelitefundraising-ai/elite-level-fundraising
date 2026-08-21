const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

export type NotificationType =
  | "announcement"
  | "file_upload"
  | "calendar_event"
  | "fundraiser"
  | "message"
  | "request";

export type RecipientScope =
  | "everyone"
  | "athletes"
  | "parents"
  | "boosters"
  | "athlete_specific";

export type NotificationRow = {
  id: string;
  team_id: string;
  type: NotificationType;
  title: string;
  body: string;
  reference_id: string | null;
  reference_url: string | null;
  recipient_scope: RecipientScope;
  recipient_athlete_id: string | null;
  created_at: string;
  read_at: string | null;
  dismissed: boolean;
};

// Actor types used for read-state and scope filtering
export type MemberActorFilter = {
  kind: "member";
  id: string;
  role: string;
  athlete_id: string | null;
};
export type CoachActorFilter = { kind: "coach"; id: string };
export type ActorFilter = MemberActorFilter | CoachActorFilter | null;

// ── Team identity lookup ───────────────────────────────────────────────────────

export async function getTeamIdBySlug(slug: string): Promise<string | null> {
  const res = await fetch(
    `${BASE}/rest/v1/campaign_settings?campaign_slug=eq.${encodeURIComponent(slug)}&select=team_id&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return null;
  const rows: { team_id: string }[] = await res.json();
  return rows[0]?.team_id ?? null;
}

// ── Write ─────────────────────────────────────────────────────────────────────

export async function createNotification(
  teamId: string,
  payload: {
    type: NotificationType;
    title: string;
    body?: string;
    reference_id?: string | null;
    reference_url?: string | null;
    recipient_scope?: RecipientScope;
    recipient_athlete_id?: string | null;
  },
): Promise<void> {
  await fetch(`${BASE}/rest/v1/notifications`, {
    method: "POST",
    headers: h({ Prefer: "return=minimal" }),
    body: JSON.stringify({
      team_id:              teamId,
      type:                 payload.type,
      title:                payload.title,
      body:                 payload.body ?? "",
      reference_id:         payload.reference_id  ?? null,
      reference_url:        payload.reference_url ?? null,
      recipient_scope:      payload.recipient_scope      ?? "everyone",
      recipient_athlete_id: payload.recipient_athlete_id ?? null,
    }),
  });
}

// ── Scope filter ──────────────────────────────────────────────────────────────

function isVisibleToMember(
  notif: { recipient_scope: string; recipient_athlete_id: string | null },
  member: { role: string; athlete_id: string | null },
): boolean {
  switch (notif.recipient_scope) {
    case "everyone":        return true;
    case "athletes":        return member.role === "athlete";
    case "parents":         return member.role === "parent";
    case "boosters":        return member.role === "booster";
    case "athlete_specific":
      return member.athlete_id !== null &&
             member.athlete_id === notif.recipient_athlete_id;
    default: return true;
  }
}

// Phase 10: request-type rows are a Head Coach action queue (Requests
// Center) — never shown in a member's own notification inbox at all,
// regardless of recipient_scope (there's no scope value meaning "staff
// only", and these rows are created with the default "everyone" scope).
// Pure/exported so this rule is directly testable without a live DB.
export function isTypeVisibleToMember(type: NotificationType): boolean {
  return type !== "request";
}

// ── Phase 10: message-type visibility — thread participants only ────────────
//
// Every other notification type uses the broadcast-category recipient_scope
// above. A message-type notification represents one DM thread's message
// event — its real "recipients" are that thread's actual participants, a
// concept recipient_scope has no way to express. Rather than inventing a
// second visibility system, this is a targeted branch: message-type rows
// are excluded from the scope check entirely and instead filtered by real
// thread participancy (message_thread_participants), with the sender
// excluded from their own notification. message_reads and the Messages
// UI's own unread count are completely untouched by any of this — this
// only governs the general notification inbox/push, independent
// bookkeeping via notification_reads/notification_coach_reads.
//
// Sender identity has no dedicated column on `notifications` (unchanged
// schema, no migration this phase) — encoded instead as a `?sender=` query
// param on reference_url, which already needs to be the real
// /team/{slug}/messages/{threadId} deep link. Harmless to any consumer
// that just does router.push(reference_url) (confirmed: NotificationsView
// does exactly that; unknown query params are simply ignored on
// navigation).

/** Pure — extracts the "coach:<id>" / "member:<id>" sender key smuggled
 *  onto a message notification's reference_url, if present. */
export function parseSenderKeyFromReferenceUrl(url: string | null): string | null {
  if (!url) return null;
  const qIndex = url.indexOf("?");
  if (qIndex === -1) return null;
  return new URLSearchParams(url.slice(qIndex + 1)).get("sender");
}

/** Pure — builds the deep-link + encoded-sender reference_url for a new
 *  message notification. senderKey matches the exact "coach:<id>" /
 *  "member:<id>" convention push.ts's sendPushToParticipants already
 *  uses, so nothing new is invented. */
export function buildMessageReferenceUrl(slug: string, threadId: string, senderKey: string): string {
  return `/team/${slug}/messages/${threadId}?sender=${encodeURIComponent(senderKey)}`;
}

type MessageVisibilityNotif = {
  id: string;
  team_id: string;
  type: string;
  reference_id: string | null;
  reference_url: string | null;
};

/**
 * Pure — the complete message-type visibility rule in one testable
 * function: team isolation, sender exclusion, and real thread-participancy
 * all in one pass. `participantsByThread` maps thread_id -> the set of
 * "coach:<id>"/"member:<id>" keys who actually belong to that thread (so a
 * participant of a DIFFERENT thread is naturally excluded — they're simply
 * absent from that thread's set). `expectedTeamId` guards against a
 * cross-team notification id somehow reaching this function at all.
 */
export function filterMessageNotifications<T extends MessageVisibilityNotif>(
  notifs: T[],
  expectedTeamId: string,
  participantsByThread: Map<string, Set<string>>,
  viewerKey: string,
): T[] {
  return notifs.filter(n => {
    if (n.team_id !== expectedTeamId) return false;
    if (!n.reference_id) return false;
    const senderKey = parseSenderKeyFromReferenceUrl(n.reference_url);
    if (senderKey !== null && senderKey === viewerKey) return false;
    const participants = participantsByThread.get(n.reference_id);
    return participants ? participants.has(viewerKey) : false;
  });
}

async function fetchParticipantsByThread(threadIds: string[]): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  if (!threadIds.length) return map;
  const res = await fetch(
    `${BASE}/rest/v1/message_thread_participants?thread_id=in.(${threadIds.join(",")})&select=thread_id,actor_type,coach_id,member_id`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return map;
  const rows: { thread_id: string; actor_type: "coach" | "member"; coach_id: string | null; member_id: string | null }[] = await res.json();
  for (const r of rows) {
    const id = r.actor_type === "coach" ? r.coach_id : r.member_id;
    if (!id) continue;
    const key = `${r.actor_type}:${id}`;
    if (!map.has(r.thread_id)) map.set(r.thread_id, new Set());
    map.get(r.thread_id)!.add(key);
  }
  return map;
}

// ── Read ──────────────────────────────────────────────────────────────────────

type RawNotifRow = Omit<NotificationRow, "read_at" | "dismissed">;
type MemberReadRow = { notification_id: string; read_at: string | null; dismissed: boolean };
type CoachReadRow  = { notification_id: string; read_at: string };

/**
 * Fetch notifications for a team, filtered by recipient scope and merged with
 * per-actor read state. Dismissed member notifications are excluded from results.
 *
 * - actor = null  → all notifications, all unread (shouldn't happen in practice)
 * - actor.kind = "coach" → all notifications (no scope filter), coach read state
 * - actor.kind = "member" → scope-filtered, member read state
 */
export async function getNotificationsForMember(
  teamId: string,
  actor: ActorFilter,
  limit = 50,
): Promise<NotificationRow[]> {
  const res = await fetch(
    `${BASE}/rest/v1/notifications?team_id=eq.${encodeURIComponent(teamId)}&order=created_at.desc&limit=${limit}`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return [];
  let notifs: RawNotifRow[] = await res.json();
  if (!notifs.length) return [];

  // No actor → return all as unread, minus types that need a real viewer
  // identity to filter correctly (message: thread participancy; request:
  // staff-only, see below).
  if (!actor) {
    return notifs.filter(n => n.type !== "message" && isTypeVisibleToMember(n.type)).map(n => ({ ...n, read_at: null, dismissed: false }));
  }

  // Phase 10: message-type rows never go through the broadcast recipient_scope
  // check (below) — they're filtered separately by real thread participancy,
  // for BOTH member and coach actors (coaches get no scope filter for every
  // other type, but DO need this filter for messages).
  const viewerKey = `${actor.kind}:${actor.id}`;
  const messageNotifs = notifs.filter(n => n.type === "message");
  const otherNotifs   = notifs.filter(n => n.type !== "message");
  const threadIds = [...new Set(messageNotifs.map(n => n.reference_id).filter((id): id is string => Boolean(id)))];
  const participantsByThread = await fetchParticipantsByThread(threadIds);
  const visibleMessageNotifs = filterMessageNotifications(messageNotifs, teamId, participantsByThread, viewerKey);

  // Members: filter by recipient scope. request-type rows are a Head Coach
  // action queue (Requests Center) — never shown in a member's own
  // notification inbox at all, regardless of recipient_scope (which stays
  // at its default "everyone" for these rows since there's no scope value
  // meaning "staff only"). Coaches below are unaffected — they already see
  // every non-message type with no scope filter, which is exactly the
  // existing, preserved "coach inbox sees requests" behavior.
  if (actor.kind === "member") {
    notifs = [...otherNotifs.filter(n => isTypeVisibleToMember(n.type) && isVisibleToMember(n, actor)), ...visibleMessageNotifs];
    if (!notifs.length) return [];

    const ids = notifs.map(n => n.id).join(",");
    const readRes = await fetch(
      `${BASE}/rest/v1/notification_reads?member_id=eq.${encodeURIComponent(actor.id)}&notification_id=in.(${ids})&select=notification_id,read_at,dismissed`,
      { headers: h(), cache: "no-store" },
    );
    const reads: MemberReadRow[] = readRes.ok ? await readRes.json() : [];
    const readMap = new Map(reads.map(r => [r.notification_id, r]));

    return notifs
      .map(n => {
        const read = readMap.get(n.id);
        return { ...n, read_at: read?.read_at ?? null, dismissed: read?.dismissed ?? false };
      })
      .filter(n => !n.dismissed);
  }

  // Coaches: no scope filter for non-message types (existing, preserved
  // behavior) — but message-type rows are still restricted to actual
  // thread participants, same as members.
  notifs = [...otherNotifs, ...visibleMessageNotifs];
  if (!notifs.length) return [];
  const ids = notifs.map(n => n.id).join(",");
  const readRes = await fetch(
    `${BASE}/rest/v1/notification_coach_reads?coach_id=eq.${encodeURIComponent(actor.id)}&notification_id=in.(${ids})&select=notification_id,read_at`,
    { headers: h(), cache: "no-store" },
  );
  const reads: CoachReadRow[] = readRes.ok ? await readRes.json() : [];
  const readMap = new Map(reads.map(r => [r.notification_id, r.read_at]));

  return notifs.map(n => ({
    ...n,
    read_at:  readMap.get(n.id) ?? null,
    dismissed: false,
  }));
}

/**
 * Count unread visible notifications for a member.
 * Reuses getNotificationsForMember so scope filtering is consistent.
 */
export async function getUnreadCount(
  teamId: string,
  actor: MemberActorFilter,
): Promise<number> {
  const notifs = await getNotificationsForMember(teamId, actor);
  return notifs.filter(n => !n.read_at).length;
}

// ── Mark read / dismiss ───────────────────────────────────────────────────────

export async function markNotificationRead(
  notificationId: string,
  memberId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(
    `${BASE}/rest/v1/notification_reads?on_conflict=notification_id,member_id`,
    {
      method:  "POST",
      headers: h({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body:    JSON.stringify({
        notification_id: notificationId,
        member_id:       memberId,
        read_at:         new Date().toISOString(),
        dismissed:       false,
      }),
    },
  );
  if (!res.ok) {
    const msg = await res.text();
    return { ok: false, error: `DB write failed: ${msg}` };
  }
  return { ok: true };
}

// ── Phase 9: team-scoped notification lookups + canonical Seen write ──────────
//
// Two pre-existing routes (announcements/[id]/reads, notifications/read)
// accepted a client-supplied notification/announcement id and acted on it
// with no check that it actually belonged to the caller's own team. Actor
// identity was always server-derived (via getTeamActor), so this couldn't
// leak identity, but it DID let a Team A actor write a junk read-receipt
// against a guessed Team B notification id, or a Team A staff member read
// Team B's reader names via a guessed Team B announcement id. Every
// lookup/write below is team-scoped before it touches the DB.

/** Pure, unit-testable: does a notification's actual team_id match the
 *  caller's authenticated team? Kept separate from the fetch that produces
 *  `actualTeamId` so this specific check can be tested without a live DB. */
export function notificationBelongsToTeam(actualTeamId: string | null, expectedTeamId: string): boolean {
  return actualTeamId !== null && actualTeamId === expectedTeamId;
}

async function getNotificationTeamId(notificationId: string): Promise<string | null> {
  const res = await fetch(
    `${BASE}/rest/v1/notifications?id=eq.${encodeURIComponent(notificationId)}&select=team_id&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return null;
  const rows: { team_id: string }[] = await res.json();
  return rows[0]?.team_id ?? null;
}

/** Team-scoped: resolves an announcement's linked notification id, but ONLY
 *  if that notification belongs to `teamId` — the single place both
 *  announcements/[id]/reads and announcements/[id]/seen resolve this, so
 *  the team check can't be forgotten in one of the two call sites. */
export async function getNotificationIdForAnnouncement(
  announcementId: string,
  teamId: string,
): Promise<string | null> {
  const res = await fetch(
    `${BASE}/rest/v1/notifications?reference_id=eq.${encodeURIComponent(announcementId)}&team_id=eq.${encodeURIComponent(teamId)}&select=id&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return null;
  const rows: { id: string }[] = await res.json();
  return rows[0]?.id ?? null;
}

/** Canonical Seen/read write — the ONE function that ever writes to
 *  notification_reads/notification_coach_reads for a given (actor,
 *  notification) pair. Both the viewport-triggered auto-Seen path
 *  (announcements/[id]/seen) and the existing tap-to-read path
 *  (notifications/read) call this, so there is exactly one write
 *  mechanism, not two competing ones. Verifies team ownership before
 *  writing — the client only ever supplies a notification id, never a
 *  viewer/team identity (that's always `actor`, resolved server-side by
 *  the caller via getTeamActor). Relies on the existing DB UNIQUE
 *  constraints (notification_id, member_id) / (notification_id, coach_id)
 *  for idempotency — repeated calls are always safe no-ops after the
 *  first successful write. */
export async function markNotificationSeen(
  actor: ActorFilter,
  notificationId: string,
  expectedTeamId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!actor) return { ok: false, error: "Unauthorized" };

  const actualTeamId = await getNotificationTeamId(notificationId);
  if (!notificationBelongsToTeam(actualTeamId, expectedTeamId)) {
    return { ok: false, error: "Not found" };
  }

  if (actor.kind === "coach") {
    await markNotificationReadCoach(notificationId, actor.id);
    return { ok: true };
  }
  return markNotificationRead(notificationId, actor.id);
}

export async function markNotificationReadCoach(
  notificationId: string,
  coachId: string,
): Promise<void> {
  await fetch(
    `${BASE}/rest/v1/notification_coach_reads?on_conflict=notification_id,coach_id`,
    {
      method:  "POST",
      headers: h({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body:    JSON.stringify({
        notification_id: notificationId,
        coach_id:        coachId,
        read_at:         new Date().toISOString(),
      }),
    },
  );
}

export async function markAllNotificationsRead(
  teamId: string,
  memberId: string,
): Promise<void> {
  const res = await fetch(
    `${BASE}/rest/v1/notifications?team_id=eq.${encodeURIComponent(teamId)}&select=id`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return;
  const notifs: { id: string }[] = await res.json();
  if (!notifs.length) return;

  const now = new Date().toISOString();
  await fetch(`${BASE}/rest/v1/notification_reads?on_conflict=notification_id,member_id`, {
    method:  "POST",
    headers: h({ Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify(
      notifs.map(n => ({
        notification_id: n.id,
        member_id:       memberId,
        read_at:         now,
        dismissed:       false,
      })),
    ),
  });
}

export async function dismissNotification(
  notificationId: string,
  memberId: string,
): Promise<void> {
  await fetch(`${BASE}/rest/v1/notification_reads?on_conflict=notification_id,member_id`, {
    method:  "POST",
    headers: h({ Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify({
      notification_id: notificationId,
      member_id:       memberId,
      read_at:         new Date().toISOString(),
      dismissed:       true,
    }),
  });
}

// ── Read receipts ─────────────────────────────────────────────────────────────

// Phase 9: `id`/`kind` (not `member_id`) so a receipt entry can represent
// either a member or a coach recipient — coach recipients were previously
// silently excluded from this entire panel (getReadReceipts only ever
// queried notification_reads, never notification_coach_reads), even
// though coaches are legitimate notification recipients (see
// getNotificationsForMember's coach branch, which already reads them).
export type ReadReceiptEntry = {
  id: string;
  kind: "member" | "coach";
  name: string;
  role: string;
  read_at: string;
};

export type ReadReceiptsResult = {
  scope: RecipientScope;
  reads: ReadReceiptEntry[];
  total_targeted: number;
};

export type RawMemberRead = { member_id: string; read_at: string };
export type RawCoachRead  = { coach_id: string; read_at: string };
export type NameLookup    = { id: string; name: string; role: string };

/**
 * Pure merge/aggregation step, split out from getReadReceipts specifically
 * so member+coach receipt aggregation is unit-testable without a live DB
 * (see notifications.test.ts). Drops any read row whose member/coach
 * couldn't be resolved (e.g. removed from the team since reading) rather
 * than showing a broken entry. Sorted chronologically by when each
 * recipient was seen, oldest first — matches the previous member-only
 * behavior's `order=read_at.asc`.
 */
export function mergeReadReceipts(
  rawMemberReads: RawMemberRead[],
  rawCoachReads: RawCoachRead[],
  members: NameLookup[],
  coaches: NameLookup[],
): ReadReceiptEntry[] {
  const memberMap = new Map(members.map(m => [m.id, m]));
  const coachMap  = new Map(coaches.map(c => [c.id, c]));

  const memberEntries: ReadReceiptEntry[] = rawMemberReads.flatMap(r => {
    const m = memberMap.get(r.member_id);
    if (!m) return [];
    return [{ id: r.member_id, kind: "member" as const, name: m.name, role: m.role, read_at: r.read_at }];
  });
  const coachEntries: ReadReceiptEntry[] = rawCoachReads.flatMap(r => {
    const c = coachMap.get(r.coach_id);
    if (!c) return [];
    return [{ id: r.coach_id, kind: "coach" as const, name: c.name, role: c.role, read_at: r.read_at }];
  });

  return [...memberEntries, ...coachEntries].sort((a, b) => a.read_at.localeCompare(b.read_at));
}

export async function getReadReceipts(
  notificationId: string,
  slug: string,
  scope: RecipientScope,
  recipientAthleteId: string | null,
): Promise<ReadReceiptsResult> {
  const [memberReadsRes, coachReadsRes] = await Promise.all([
    fetch(
      `${BASE}/rest/v1/notification_reads?notification_id=eq.${encodeURIComponent(notificationId)}&select=member_id,read_at&order=read_at.asc`,
      { headers: h(), cache: "no-store" },
    ),
    fetch(
      `${BASE}/rest/v1/notification_coach_reads?notification_id=eq.${encodeURIComponent(notificationId)}&select=coach_id,read_at&order=read_at.asc`,
      { headers: h(), cache: "no-store" },
    ),
  ]);
  const rawMemberReads: RawMemberRead[] = memberReadsRes.ok ? await memberReadsRes.json() : [];
  const rawCoachReads:  RawCoachRead[]  = coachReadsRes.ok  ? await coachReadsRes.json()  : [];

  const members: NameLookup[] = rawMemberReads.length
    ? await fetch(`${BASE}/rest/v1/team_members?id=in.(${rawMemberReads.map(r => r.member_id).join(",")})&select=id,name,role`, { headers: h(), cache: "no-store" })
        .then(r => r.ok ? r.json() : [])
    : [];
  const coaches: NameLookup[] = rawCoachReads.length
    ? await fetch(`${BASE}/rest/v1/team_coaches?id=in.(${rawCoachReads.map(r => r.coach_id).join(",")})&select=id,name,role`, { headers: h(), cache: "no-store" })
        .then(r => r.ok ? r.json() : [])
    : [];

  const reads = mergeReadReceipts(rawMemberReads, rawCoachReads, members, coaches);

  // Count targeted members — unchanged scope-filter logic.
  let countFilter = `campaign_slug=eq.${encodeURIComponent(slug)}`;
  if (scope === "athletes")  countFilter += `&role=eq.athlete`;
  if (scope === "parents")   countFilter += `&role=eq.parent`;
  if (scope === "boosters")  countFilter += `&role=eq.booster`;
  if (scope === "athlete_specific" && recipientAthleteId) {
    countFilter += `&athlete_id=eq.${encodeURIComponent(recipientAthleteId)}`;
  }

  // Coaches are never scope-filtered (see getNotificationsForMember's coach
  // branch — every coach sees every notification regardless of
  // recipient_scope, existing behavior preserved here) — so every coach on
  // the team counts toward the denominator for every announcement.
  const [memberCountRes, coachCountRes] = await Promise.all([
    fetch(`${BASE}/rest/v1/team_members?${countFilter}&select=id`, { headers: h({ Prefer: "count=exact" }), cache: "no-store" }),
    fetch(`${BASE}/rest/v1/team_coaches?campaign_slug=eq.${encodeURIComponent(slug)}&select=id`, { headers: h({ Prefer: "count=exact" }), cache: "no-store" }),
  ]);
  const memberTotal = parseInt((memberCountRes.headers.get("content-range") ?? "").split("/")[1] ?? "0", 10) || 0;
  const coachTotal  = parseInt((coachCountRes.headers.get("content-range")  ?? "").split("/")[1] ?? "0", 10) || 0;

  return { scope, reads, total_targeted: memberTotal + coachTotal };
}
