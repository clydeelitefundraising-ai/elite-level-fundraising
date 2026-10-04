import { notFound } from "next/navigation";
import { getCampaignSettings } from "@/lib/supabase";
import { getTeamActor } from "@/lib/permissions.server";
import {
  getThreadById,
  getThreadParticipants,
  getMessagesForThread,
  isParticipant,
  canManageGroupThread,
  type ActorKey,
} from "@/lib/messages";
import ThreadView from "./ThreadView";

export const dynamic = "force-dynamic";

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ slug: string; threadId: string }>;
}) {
  const { slug, threadId } = await params;

  const [settings, actor] = await Promise.all([
    getCampaignSettings(slug),
    getTeamActor(slug),
  ]);
  if (!settings) notFound();
  if (actor.kind === "public") notFound();

  const actorKey: ActorKey =
    actor.kind === "coach"          ? { kind: "coach",          id: actor.session.id } :
    actor.kind === "platform_admin" ? { kind: "platform_admin", id: actor.session.platformAdminId } :
    { kind: "member", id: actor.session.id };

  const [thread, participants, ok] = await Promise.all([
    getThreadById(threadId, slug),
    getThreadParticipants(threadId),
    isParticipant(threadId, actorKey),
  ]);

  if (!thread || !ok) notFound();

  const messages = await getMessagesForThread(threadId, actorKey);

  // Group Messaging G2 — computed server-side, exactly matching the G1
  // management endpoints' own authorization (canManageGroupThread), so the
  // UI's "Manage Group" entry point can never show for an actor the server
  // would reject. canManageGroupThread() is a pure function from the
  // server-only lib/messages.ts module (reads node:crypto/service-role env
  // at module scope) — safe to call here in a server component, but it
  // cannot be imported into ThreadView.tsx itself ("use client"), hence
  // passing the already-resolved boolean down instead of the raw thread
  // metadata needed to recompute it client-side.
  const canManageGroup =
    thread.thread_type === "group" &&
    actor.kind === "coach" &&
    (actor.session.role === "head_coach" || actor.session.role === "assistant_coach") &&
    canManageGroupThread(actor.session.role, actor.session.id, thread);
  const canArchiveGroup = thread.thread_type === "group" && actor.kind === "coach" && actor.session.role === "head_coach";

  return (
    <ThreadView
      slug={slug}
      thread={thread}
      participants={participants}
      initialMessages={messages}
      actorKind={actorKey.kind}
      actorId={actorKey.id}
      actorName={actor.session.name}
      primaryColor={settings.primary_color}
      canManageGroup={canManageGroup}
      canArchiveGroup={canArchiveGroup}
    />
  );
}
