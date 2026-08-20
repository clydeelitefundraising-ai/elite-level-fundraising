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
  | "message";

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

  // No actor → return all as unread
  if (!actor) {
    return notifs.map(n => ({ ...n, read_at: null, dismissed: false }));
  }

  // Members: filter by recipient scope
  if (actor.kind === "member") {
    notifs = notifs.filter(n => isVisibleToMember(n, actor));
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

  // Coaches: no scope filter, merge with notification_coach_reads
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
