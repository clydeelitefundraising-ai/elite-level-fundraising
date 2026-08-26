import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import {
  isParticipant,
  getThreadById,
  markThreadReadForActor,
  type ActorKey,
} from "@/lib/messages";

type RouteCtx = { params: Promise<{ slug: string; threadId: string }> };

export async function POST(
  _req: NextRequest,
  { params }: RouteCtx,
) {
  const { slug, threadId } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind === "public") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorKey: ActorKey =
    actor.kind === "coach"          ? { kind: "coach",          id: actor.session.id } :
    actor.kind === "platform_admin" ? { kind: "platform_admin", id: actor.session.platformAdminId } :
    { kind: "member", id: actor.session.id };

  const [thread, ok] = await Promise.all([
    getThreadById(threadId, slug),
    isParticipant(threadId, actorKey),
  ]);
  if (!thread || !ok) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  await markThreadReadForActor(threadId, actorKey);
  return NextResponse.json({ ok: true });
}
