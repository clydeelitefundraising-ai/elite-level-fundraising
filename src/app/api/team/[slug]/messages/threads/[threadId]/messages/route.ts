import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import {
  isParticipant,
  getThreadById,
  getThreadParticipants,
  insertMessage,
  updateThreadMeta,
  syncRequiredThreadParticipants,
  ParticipantSyncError,
  type ActorKey,
} from "@/lib/messages";
import { sendPushToParticipants } from "@/lib/push";

type RouteCtx = { params: Promise<{ slug: string; threadId: string }> };

export async function POST(
  req: NextRequest,
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

  const [thread, ok] = await Promise.all([
    getThreadById(threadId, slug),
    isParticipant(threadId, actorKey),
  ]);

  if (!thread || !ok) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const msgBody: string = body?.body ?? "";
  if (!msgBody.trim()) {
    return NextResponse.json({ error: "body required" }, { status: 400 });
  }
  if (msgBody.length > 3000) {
    return NextResponse.json({ error: "Message too long." }, { status: 400 });
  }

  // Self-healing: a parent linked to this athlete after the thread was
  // created gets added here, before the new message is sent — additive
  // only, never removes an existing (even since-unlinked) participant.
  // If this fails, the family/oversight integrity rule is authoritative:
  // do not silently continue and send a message into a thread that's
  // missing a required parent. Fail cleanly, thread and messages
  // untouched — the reply was never inserted.
  try {
    await syncRequiredThreadParticipants(threadId, slug);
  } catch (err) {
    if (err instanceof ParticipantSyncError) {
      return NextResponse.json({ error: "Unable to send message right now. Please try again." }, { status: 500 });
    }
    throw err;
  }

  const msg = await insertMessage(threadId, actorKey, msgBody.trim(), actor.session.name, actor.session.role);
  if (!msg) {
    return NextResponse.json({ error: "Failed to send message." }, { status: 500 });
  }

  void updateThreadMeta(threadId, msgBody.trim());

  // Push to other participants
  void (async () => {
    try {
      const participants = await getThreadParticipants(threadId);
      const senderKey = `${actorKey.kind}:${actorKey.id}`;
      await sendPushToParticipants(slug, participants, senderKey, {
        title: `New message from ${actor.session.name}`,
        body:  msgBody.trim().slice(0, 100),
        url:   `/team/${slug}/messages/${threadId}`,
      });
    } catch {}
  })();

  return NextResponse.json(msg, { status: 201 });
}
