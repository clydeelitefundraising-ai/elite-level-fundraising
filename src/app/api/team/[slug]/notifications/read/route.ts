import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import {
  getTeamIdBySlug,
  markNotificationSeen,
  markAllNotificationsRead,
  markAllNotificationsReadForCoach,
  type ActorFilter,
} from "@/lib/notifications";

type RouteContext = { params: Promise<{ slug: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { slug } = await params;

  const actor = await getTeamActor(slug);
  if (actor.kind === "public") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const teamId = await getTeamIdBySlug(slug);
  if (!teamId) return NextResponse.json({ error: "team not found" }, { status: 404 });

  // ── Coach / platform admin path ─────────────────────────────────────────────
  // Single-id mark-seen: routed through the canonical markNotificationSeen
  // (verifies the notification actually belongs to this team before
  // writing — a Team A coach can't write a junk read against a guessed
  // Team B notification id), for both coach and platform admin.
  //
  // Bulk "mark all" (no id): coach-only. Platform admin is deliberately NOT
  // extended here — see markAllNotificationsReadForCoach's header comment
  // in notifications.ts for the pre-existing read/write table mismatch
  // (getNotificationsForMember reads platform-admin state from
  // notification_coach_reads, but the single-mark-read path above writes
  // platform-admin reads to the separate notification_platform_admin_reads
  // table) that makes a platform-admin bulk action unsafe to add without
  // first resolving that inconsistency, which is out of scope here.
  if (actor.kind === "coach" || actor.kind === "platform_admin") {
    if (typeof body.id === "string" && body.id) {
      const actorFilter: ActorFilter = actor.kind === "coach"
        ? { kind: "coach", id: actor.session.id }
        : { kind: "platform_admin", id: actor.session.platformAdminId };
      await markNotificationSeen(actorFilter, body.id, teamId);
    } else if (actor.kind === "coach") {
      await markAllNotificationsReadForCoach(teamId, actor.session.id);
    }
    return NextResponse.json({ ok: true });
  }

  // ── Member path ───────────────────────────────────────────────────────────
  if (typeof body.id === "string" && body.id) {
    const actorFilter: ActorFilter = {
      kind: "member", id: actor.session.id, role: actor.session.role, athlete_id: actor.session.athlete_id,
    };
    const result = await markNotificationSeen(actorFilter, body.id, teamId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.error === "Not found" ? 404 : 500 });
    }
  } else {
    await markAllNotificationsRead(teamId, actor.session.id);
  }

  return NextResponse.json({ ok: true });
}
