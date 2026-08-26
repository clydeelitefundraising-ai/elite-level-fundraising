import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import {
  getTeamIdBySlug,
  markNotificationSeen,
  markAllNotificationsRead,
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
  // Platform admin mirrors the coach path exactly: single-id mark-seen only,
  // no "mark all" — same MVP rationale (no bell UI drives that action for
  // either), writing to its own notification_platform_admin_reads table
  // (phase_a30) rather than a shared one.
  if (actor.kind === "coach" || actor.kind === "platform_admin") {
    if (typeof body.id === "string" && body.id) {
      // Phase 9: routed through the canonical markNotificationSeen, which
      // verifies the notification actually belongs to this team before
      // writing (previously this trusted body.id with no team check — a
      // Team A coach could write a junk read against a guessed Team B
      // notification id).
      const actorFilter: ActorFilter = actor.kind === "coach"
        ? { kind: "coach", id: actor.session.id }
        : { kind: "platform_admin", id: actor.session.platformAdminId };
      await markNotificationSeen(actorFilter, body.id, teamId);
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
