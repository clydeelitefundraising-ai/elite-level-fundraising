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

  const memberId = actor.kind === "member" ? actor.session.id : null;
  const notifications = await getNotificationsForMember(teamId, memberId);
  return NextResponse.json(notifications);
}
