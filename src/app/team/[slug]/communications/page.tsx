import { notFound } from "next/navigation";
import { getCampaignSettings } from "@/lib/supabase";
import { getAnnouncements, getTeamFiles, getTeamAthletes } from "@/lib/teamData";
import { requireTeamMembership, isStaff } from "@/lib/permissions.server";
import { getThreadsForActor, type ActorKey } from "@/lib/messages";
import CommunicationsView from "./CommunicationsView";

export const dynamic = "force-dynamic";

export default async function CommunicationsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // Not a public-facing route — gate it to logged-in members of this team.
  const actor = await requireTeamMembership(slug);
  const settings = await getCampaignSettings(slug);
  if (!settings) notFound();

  const [updates, files, athletes] = await Promise.all([
    getAnnouncements(slug),
    getTeamFiles(slug),
    getTeamAthletes(slug),
  ]);

  const actorKey: ActorKey = actor.kind === "coach"
    ? { kind: "coach", id: actor.session.id }
    : { kind: "member", id: actor.session.id };
  const threads = await getThreadsForActor(slug, actorKey);

  return (
    <CommunicationsView
      slug={slug}
      initialUpdates={updates}
      initialFiles={files}
      actor={actor}
      athletes={athletes.map(a => ({ id: a.id, name: a.name }))}
      initialThreads={threads}
      actorKind={actorKey.kind}
      actorId={actorKey.id}
      actorName={actor.session.name}
      isStaff={isStaff(actor)}
      primaryColor={settings.primary_color}
    />
  );
}
