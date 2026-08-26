import { notFound } from "next/navigation";
import { getCampaignSettings } from "@/lib/supabase";
import { getTeamActor } from "@/lib/permissions.server";
import {
  getThreadById,
  getThreadParticipants,
  getMessagesForThread,
  isParticipant,
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
    />
  );
}
