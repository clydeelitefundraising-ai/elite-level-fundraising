import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import {
  getTeamIdBySlug,
  markNotificationRead,
  markNotificationReadCoach,
  markAllNotificationsRead,
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
      await markNotificationReadCoach(body.id, actor.session.id);
    }
    // markAll for coaches: mark each visible notification — skip for MVP
    // (coaches don't have a bell so "mark all" is low priority)
    return NextResponse.json({ ok: true });
  }

  // ── Member path ───────────────────────────────────────────────────────────
  if (typeof body.id === "string" && body.id) {
    const result = await markNotificationRead(body.id, actor.session.id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
  } else {
    await markAllNotificationsRead(teamId, actor.session.id);
  }

  return NextResponse.json({ ok: true });
}
