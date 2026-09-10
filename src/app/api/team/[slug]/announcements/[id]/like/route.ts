import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import type { ActorKey } from "@/lib/messages";
import { getLikeStatus, toggleLike } from "@/lib/platform/postLikes";

type RouteCtx = { params: Promise<{ slug: string; id: string }> };

// Any authenticated team actor (coach or member) of THIS campaign may
// like/unlike — same gate as the comments GET route (every role listed in
// the spec: Head Coach, Assistant Coach, Booster, Parent, Athlete), not
// the narrower isHeadCoach() moderation gate. Public/unauthenticated is
// the only exclusion — a non-team-member has no ActorKey to attribute a
// like to at all.
export async function GET(_req: NextRequest, { params }: RouteCtx) {
  const { slug, id } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind === "public") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorKey: ActorKey =
    actor.kind === "coach"          ? { kind: "coach",          id: actor.session.id } :
    actor.kind === "platform_admin" ? { kind: "platform_admin", id: actor.session.platformAdminId } :
    { kind: "member", id: actor.session.id };

  const status = await getLikeStatus(id, slug, actorKey);
  return NextResponse.json(status);
}

export async function POST(_req: NextRequest, { params }: RouteCtx) {
  const { slug, id } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind === "public") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorKey: ActorKey =
    actor.kind === "coach"          ? { kind: "coach",          id: actor.session.id } :
    actor.kind === "platform_admin" ? { kind: "platform_admin", id: actor.session.platformAdminId } :
    { kind: "member", id: actor.session.id };

  const result = await toggleLike(id, slug, actorKey);
  if (!result.ok) {
    return NextResponse.json({ error: "Announcement not found." }, { status: 404 });
  }
  return NextResponse.json({ liked: result.liked, ...result.status });
}
