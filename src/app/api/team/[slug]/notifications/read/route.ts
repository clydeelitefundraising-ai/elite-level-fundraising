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

  // ── Coach path ────────────────────────────────────────────────────────────
  if (actor.kind === "coach") {
    if (typeof body.id === "string" && body.id) {
      // Phase 9: routed through the canonical markNotificationSeen, which
      // verifies the notification actually belongs to this team before
      // writing (previously this trusted body.id with no team check — a
      // Team A coach could write a junk read against a guessed Team B
      // notification id).
      const actorFilter: ActorFilter = { kind: "coach", id: actor.session.id };
      await markNotificationSeen(actorFilter, body.id, teamId);
    }
    // markAll for coaches: mark each visible notification — skip for MVP
    // (coaches don't have a bell so "mark all" is low priority)
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
