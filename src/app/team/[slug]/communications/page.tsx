import { notFound } from "next/navigation";
import { getCampaignSettings } from "@/lib/supabase";
import { getAnnouncements, getTeamFiles, getTeamAthletes } from "@/lib/teamData";
import { getTeamActor, isStaff } from "@/lib/permissions.server";
import { getThreadsForActor, type ActorKey } from "@/lib/messages";
import CommunicationsView from "./CommunicationsView";

export const dynamic = "force-dynamic";

export default async function CommunicationsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [settings, actor] = await Promise.all([
    getCampaignSettings(slug),
    getTeamActor(slug),
  ]);
  if (!settings) notFound();

  const [updates, files, athletes] = await Promise.all([
    getAnnouncements(slug),
    getTeamFiles(slug),
    getTeamAthletes(slug),
  ]);

  // Messages are private — same restriction MessagesView's page.tsx enforced
  // before this merge. Updates has no such restriction, so Section 1 loads
  // regardless of actor kind.
  let threads: Awaited<ReturnType<typeof getThreadsForActor>> = [];
  let actorKey: ActorKey | null = null;
  if (actor.kind !== "public") {
    actorKey = actor.kind === "coach"
      ? { kind: "coach", id: actor.session.id }
      : { kind: "member", id: actor.session.id };
    threads = await getThreadsForActor(slug, actorKey);
  }

  return (
    <CommunicationsView
      slug={slug}
      initialUpdates={updates}
      initialFiles={files}
      actor={actor}
      athletes={athletes.map(a => ({ id: a.id, name: a.name }))}
      initialThreads={threads}
      actorKind={actorKey?.kind ?? null}
      actorId={actorKey?.id ?? null}
      actorName={actor.kind !== "public" ? actor.session.name : null}
      isStaff={isStaff(actor)}
      primaryColor={settings.primary_color}
    />
  );
}
