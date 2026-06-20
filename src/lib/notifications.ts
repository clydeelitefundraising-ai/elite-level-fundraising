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

export type ReadReceiptEntry = {
  member_id: string;
  name: string;
  role: string;
  read_at: string;
};

export type ReadReceiptsResult = {
  scope: RecipientScope;
  reads: ReadReceiptEntry[];
  total_targeted: number;
};

export async function getReadReceipts(
  notificationId: string,
  slug: string,
  scope: RecipientScope,
  recipientAthleteId: string | null,
): Promise<ReadReceiptsResult> {
  // Fetch raw reads
  const readsRes = await fetch(
    `${BASE}/rest/v1/notification_reads?notification_id=eq.${encodeURIComponent(notificationId)}&select=member_id,read_at&order=read_at.asc`,
    { headers: h(), cache: "no-store" },
  );
  const rawReads: { member_id: string; read_at: string }[] =
    readsRes.ok ? await readsRes.json() : [];

  // Batch-fetch member names
  let reads: ReadReceiptEntry[] = [];
  if (rawReads.length > 0) {
    const ids = rawReads.map(r => r.member_id).join(",");
    const membersRes = await fetch(
      `${BASE}/rest/v1/team_members?id=in.(${ids})&select=id,name,role`,
      { headers: h(), cache: "no-store" },
    );
    const members: { id: string; name: string; role: string }[] =
      membersRes.ok ? await membersRes.json() : [];
    const memberMap = new Map(members.map(m => [m.id, m]));

    reads = rawReads.flatMap(r => {
      const m = memberMap.get(r.member_id);
      if (!m) return [];
      return [{ member_id: r.member_id, name: m.name, role: m.role, read_at: r.read_at }];
    });
  }

  // Count targeted members
  let countFilter = `campaign_slug=eq.${encodeURIComponent(slug)}`;
  if (scope === "athletes")  countFilter += `&role=eq.athlete`;
  if (scope === "parents")   countFilter += `&role=eq.parent`;
  if (scope === "boosters")  countFilter += `&role=eq.booster`;
  if (scope === "athlete_specific" && recipientAthleteId) {
    countFilter += `&athlete_id=eq.${encodeURIComponent(recipientAthleteId)}`;
  }

  const countRes = await fetch(
    `${BASE}/rest/v1/team_members?${countFilter}&select=id`,
    { headers: h({ Prefer: "count=exact" }), cache: "no-store" },
  );
  const contentRange = countRes.headers.get("content-range") ?? "";
  const totalTargeted = parseInt(contentRange.split("/")[1] ?? "0", 10) || 0;

  return { scope, reads, total_targeted: totalTargeted };
}
