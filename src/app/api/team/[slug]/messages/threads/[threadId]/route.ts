import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import {
  getThreadById,
  getThreadParticipants,
  getMessagesForThread,
  isParticipant,
  type ActorKey,
} from "@/lib/messages";

type RouteCtx = { params: Promise<{ slug: string; threadId: string }> };

export async function GET(
  _req: NextRequest,
  { params }: RouteCtx,
) {
  const { slug, threadId } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind === "public") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorKey: ActorKey =
    actor.kind === "coach"
      ? { kind: "coach",  id: actor.session.id }
      : { kind: "member", id: actor.session.id };

  const [thread, participants, ok] = await Promise.all([
    getThreadById(threadId, slug),
    getThreadParticipants(threadId),
    isParticipant(threadId, actorKey),
  ]);

  if (!thread || !ok) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const messages = await getMessagesForThread(threadId, actorKey);
  return NextResponse.json({ thread, participants, messages });
}
