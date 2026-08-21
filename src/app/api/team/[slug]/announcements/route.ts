import { NextRequest, NextResponse } from "next/server";
import { getTeamActor, isStaff } from "@/lib/permissions.server";
import { staffRoleLabel } from "@/lib/permissions";
import { sendPushToScope } from "@/lib/push";
import { getTeamIdBySlug, createNotification } from "@/lib/notifications";
import type { RecipientScope } from "@/lib/notifications";
import { getAccountIdsForScope } from "@/lib/pushRecipients";
import { dispatchApnsPush } from "@/lib/apns";

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

const VALID_CATEGORIES = new Set([
  "schedule", "fundraiser", "travel", "meet-info", "team-alert", "team",
]);
const VALID_PRIORITIES = new Set(["normal", "high", "pinned"]);
const VALID_SCOPES = new Set<RecipientScope>([
  "everyone", "athletes", "parents", "boosters", "athlete_specific",
]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind === "public" || !isStaff(actor)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { title, body: msgBody, category, priority, attachment_id, push_enabled } = body;

  if (!title?.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const safeCategory         = VALID_CATEGORIES.has(category) ? category : "team";
  const safePriority         = VALID_PRIORITIES.has(priority)  ? priority : "normal";
  const rawScope             = body.recipient_scope as string | undefined;
  const safeScope: RecipientScope = VALID_SCOPES.has(rawScope as RecipientScope)
    ? (rawScope as RecipientScope)
    : "everyone";
  const recipientAthleteId: string | null =
    safeScope === "athlete_specific" && typeof body.recipient_athlete_id === "string"
      ? body.recipient_athlete_id
      : null;
  const shouldPush  = push_enabled !== false; // default true
  const authorName  = actor.session.name;
  const authorRole  = staffRoleLabel(actor.session.role);
  // coach_id references team_coaches.id — only set for coach-kind actors
  const coachId     = actor.kind === "coach" ? actor.session.id : null;

  const payload: Record<string, unknown> = {
    campaign_slug:        slug,
    title:                title.trim(),
    body:                 msgBody?.trim() ?? "",
    category:             safeCategory,
    priority:             safePriority,
    author_name:          authorName,
    author_role:          authorRole,
    coach_id:             coachId,
    recipient_scope:      safeScope,
    recipient_athlete_id: recipientAthleteId,
  };
  if (attachment_id) payload.attachment_id = attachment_id;

  const res = await fetch(`${BASE}/rest/v1/announcements`, {
    method: "POST",
    headers: h({ Prefer: "return=representation" }),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const msg = await res.text();
    return NextResponse.json({ error: `Failed to create announcement: ${msg}` }, { status: 500 });
  }

  const rows = await res.json();
  const newAnnouncement = rows[0];

  // Fire-and-forget: in-app notification + scoped push.
  void (async () => {
    try {
      const teamId = await getTeamIdBySlug(slug);
      if (teamId) {
        await createNotification(teamId, {
          // Phase 10: was "message" — a pre-existing mislabel (this route
          // predates the "message" type's real meaning, added later for
          // DM notifications). Corrected here because it's now load-bearing:
          // Phase 10's message-type notifications are restricted to actual
          // thread participants (see notifications.ts's
          // filterMessageNotifications), which would have made every
          // announcement invisible to everyone if this stayed "message".
          // Harmless to correct — nothing reads `type` for announcement
          // resolution (getNotificationIdForAnnouncement matches on
          // reference_id only), so this doesn't change any existing
          // announcement/Seen-tracking behavior.
          type:                 "announcement",
          title:                title.trim(),
          body:                 (msgBody?.trim() ?? "").slice(0, 140),
          reference_id:         newAnnouncement.id,
          reference_url:        `/team/${slug}/notifications`,
          recipient_scope:      safeScope,
          recipient_athlete_id: recipientAthleteId,
        });
      }
    } catch (err) {
      console.error("[announcements] createNotification failed:", err);
    }

    if (shouldPush) {
      try {
        await sendPushToScope(slug, safeScope, recipientAthleteId, {
          title: "New Update",
          body:  title.trim().slice(0, 100),
          url:   `/team/${slug}/notifications`,
        });
      } catch (err) {
        console.error("[announcements] sendPushToScope failed:", err);
      }

      try {
        const accountIds = await getAccountIdsForScope(slug, safeScope, recipientAthleteId);
        await dispatchApnsPush({
          accountIds,
          category: "team_updates",
          kind: "announcement",
          ctx: { actorName: authorName },
          url: `/team/${slug}/notifications`,
        });
      } catch (err) {
        console.error("[announcements] dispatchApnsPush failed:", err);
      }
    }
  })();

  return NextResponse.json(newAnnouncement);
}
