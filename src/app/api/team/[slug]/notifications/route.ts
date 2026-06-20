import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import { getTeamIdBySlug, getNotificationsForMember } from "@/lib/notifications";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind === "public") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const teamId = await getTeamIdBySlug(slug);
  if (!teamId) return NextResponse.json([], { status: 200 });

  const actorFilter =
    actor.kind === "member"
      ? { kind: "member" as const, id: actor.session.id, role: actor.session.role, athlete_id: actor.session.athlete_id }
      : actor.kind === "coach"
      ? { kind: "coach" as const, id: actor.session.id }
      : null;
  const notifications = await getNotificationsForMember(teamId, actorFilter);
  return NextResponse.json(notifications);
}
