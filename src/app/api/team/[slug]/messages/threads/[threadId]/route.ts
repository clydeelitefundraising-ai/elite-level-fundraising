import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import {
  getThreadById,
  getThreadParticipants,
  getMessagesForThread,
  getGroupRosterAssignments,
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
    actor.kind === "coach"          ? { kind: "coach",          id: actor.session.id } :
    actor.kind === "platform_admin" ? { kind: "platform_admin", id: actor.session.platformAdminId } :
    { kind: "member", id: actor.session.id };

  const [thread, participants, ok] = await Promise.all([
    getThreadById(threadId, slug),
    getThreadParticipants(threadId),
    isParticipant(threadId, actorKey),
  ]);

  if (!thread || !ok) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const messages = await getMessagesForThread(threadId, actorKey);

  // Group Messaging G3B: Manage Group must represent GROUP ASSIGNMENT
  // (message_thread_athletes — G3A), not merely current
  // message_thread_participants — a roster-only (never-joined) athlete has
  // no participant row at all. Reuses the existing read this route already
  // serves (ManageGroupModal already fetches this exact endpoint) rather
  // than adding a second request. Omitted (undefined) for a DM, which never
  // has roster assignments at all.
  const rosterAssignments = thread.thread_type === "group"
    ? await getGroupRosterAssignments(threadId, slug)
    : undefined;

  return NextResponse.json({ thread, participants, messages, rosterAssignments });
}
