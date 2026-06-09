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

export type NotificationType = "announcement" | "file_upload" | "calendar_event" | "fundraiser";

export type NotificationRow = {
  id: string;
  team_id: string;
  type: NotificationType;
  title: string;
  body: string;
  reference_id: string | null;
  reference_url: string | null;
  created_at: string;
  read_at: string | null;
  dismissed: boolean;
};

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
  },
): Promise<void> {
  await fetch(`${BASE}/rest/v1/notifications`, {
    method: "POST",
    headers: h({ Prefer: "return=minimal" }),
    body: JSON.stringify({
      team_id:       teamId,
      type:          payload.type,
      title:         payload.title,
      body:          payload.body ?? "",
      reference_id:  payload.reference_id  ?? null,
      reference_url: payload.reference_url ?? null,
    }),
  });
}

// ── Read ──────────────────────────────────────────────────────────────────────

type RawNotifRow = Omit<NotificationRow, "read_at" | "dismissed">;
type ReadRow     = { notification_id: string; read_at: string | null; dismissed: boolean };

/**
 * Fetch notifications for a team, merged with per-member read/dismiss state.
 * Dismissed notifications are filtered out of the result.
 * If memberId is null (coach / public), all notifications are returned as unread.
 */
export async function getNotificationsForMember(
  teamId: string,
  memberId: string | null,
  limit = 50,
): Promise<NotificationRow[]> {
  const res = await fetch(
    `${BASE}/rest/v1/notifications?team_id=eq.${encodeURIComponent(teamId)}&order=created_at.desc&limit=${limit}`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return [];
  const notifs: RawNotifRow[] = await res.json();
  if (!notifs.length) return [];

  if (!memberId) {
    return notifs.map(n => ({ ...n, read_at: null, dismissed: false }));
  }

  const ids = notifs.map(n => n.id).join(",");
  const readRes = await fetch(
    `${BASE}/rest/v1/notification_reads?member_id=eq.${encodeURIComponent(memberId)}&notification_id=in.(${ids})&select=notification_id,read_at,dismissed`,
    { headers: h(), cache: "no-store" },
  );
  const reads: ReadRow[] = readRes.ok ? await readRes.json() : [];
  const readMap = new Map(reads.map(r => [r.notification_id, r]));

  return notifs
    .map(n => {
      const read = readMap.get(n.id);
      return { ...n, read_at: read?.read_at ?? null, dismissed: read?.dismissed ?? false };
    })
    .filter(n => !n.dismissed);
}

/**
 * Count notifications for a team that this member has not acknowledged at all
 * (no row in notification_reads — dismissed items are also acknowledged).
 */
export async function getUnreadCount(
  teamId: string,
  memberId: string,
): Promise<number> {
  const [notifRes, readRes] = await Promise.all([
    fetch(
      `${BASE}/rest/v1/notifications?team_id=eq.${encodeURIComponent(teamId)}&select=id`,
      { headers: h(), cache: "no-store" },
    ),
    fetch(
      `${BASE}/rest/v1/notification_reads?member_id=eq.${encodeURIComponent(memberId)}&select=notification_id`,
      { headers: h(), cache: "no-store" },
    ),
  ]);
  const notifs: { id: string }[]             = notifRes.ok ? await notifRes.json() : [];
  const reads: { notification_id: string }[] = readRes.ok  ? await readRes.json() : [];
  console.log("[DEBUG getUnreadCount] teamId=", teamId, "memberId=", memberId);
  console.log("[DEBUG getUnreadCount] notifRes.status=", notifRes.status, "total notifications=", notifs.length, "ids=", notifs.map(n => n.id));
  console.log("[DEBUG getUnreadCount] readRes.status=", readRes.status, "read rows=", reads.length, "notification_ids=", reads.map(r => r.notification_id));
  const readSet = new Set(reads.map(r => r.notification_id));
  const count = notifs.filter(n => !readSet.has(n.id)).length;
  console.log("[DEBUG getUnreadCount] computed unread count=", count);
  return count;
}

// ── Mark read / dismiss ───────────────────────────────────────────────────────

export async function markNotificationRead(
  notificationId: string,
  memberId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  console.log("[DEBUG] markNotificationRead: notificationId=", notificationId, "memberId=", memberId);

  // Check if a row already exists for this (notification, member) pair
  const checkRes = await fetch(
    `${BASE}/rest/v1/notification_reads?notification_id=eq.${encodeURIComponent(notificationId)}&member_id=eq.${encodeURIComponent(memberId)}&select=id&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  const existing: { id: string }[] = checkRes.ok ? await checkRes.json() : [];
  console.log("[DEBUG] markNotificationRead: existing rows=", existing.length);

  let writeRes: Response;

  if (existing.length > 0) {
    // Row exists — PATCH to update read_at
    console.log("[DEBUG] markNotificationRead: PATCHing existing row id=", existing[0].id);
    writeRes = await fetch(
      `${BASE}/rest/v1/notification_reads?notification_id=eq.${encodeURIComponent(notificationId)}&member_id=eq.${encodeURIComponent(memberId)}`,
      {
        method:  "PATCH",
        headers: h({ Prefer: "return=minimal" }),
        body:    JSON.stringify({ read_at: new Date().toISOString(), dismissed: false }),
      },
    );
  } else {
    // No row — INSERT fresh
    console.log("[DEBUG] markNotificationRead: INSERTing new row");
    writeRes = await fetch(`${BASE}/rest/v1/notification_reads`, {
      method:  "POST",
      headers: h({ Prefer: "return=minimal" }),
      body:    JSON.stringify({
        notification_id: notificationId,
        member_id:       memberId,
        read_at:         new Date().toISOString(),
        dismissed:       false,
      }),
    });
  }

  console.log("[DEBUG] markNotificationRead: write status=", writeRes.status);
  if (!writeRes.ok) {
    const errText = await writeRes.text();
    console.error("[DEBUG] markNotificationRead: write FAILED:", errText);
    return { ok: false, error: `DB write failed (${writeRes.status}): ${errText}` };
  }

  // Verify row landed in DB
  const verifyRes = await fetch(
    `${BASE}/rest/v1/notification_reads?notification_id=eq.${encodeURIComponent(notificationId)}&member_id=eq.${encodeURIComponent(memberId)}&select=id,read_at,dismissed`,
    { headers: h(), cache: "no-store" },
  );
  const verifyRows: unknown[] = verifyRes.ok ? await verifyRes.json() : [];
  console.log("[DEBUG] markNotificationRead: verified rows=", JSON.stringify(verifyRows));

  if (verifyRows.length === 0) {
    return { ok: false, error: "Write appeared to succeed but row not found in DB" };
  }

  return { ok: true };
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
    method: "POST",
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
    method: "POST",
    headers: h({ Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify({
      notification_id: notificationId,
      member_id:       memberId,
      read_at:         new Date().toISOString(),
      dismissed:       true,
    }),
  });
}
