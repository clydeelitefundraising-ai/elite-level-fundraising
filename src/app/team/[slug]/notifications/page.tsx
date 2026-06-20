import { notFound } from "next/navigation";
import { getCampaignSettings } from "@/lib/supabase";
import { getTeamActor, isMember as checkIsMember } from "@/lib/permissions.server";
import { getTeamIdBySlug, getNotificationsForMember } from "@/lib/notifications";
import NotificationsView from "./NotificationsView";

export const dynamic = "force-dynamic";

export default async function NotificationsPage({
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
  if (actor.kind === "public") notFound();

  const teamId = settings.team_id
    ? settings.team_id
    : await getTeamIdBySlug(slug);

  const actorFilter =
    actor.kind === "member"
      ? { kind: "member" as const, id: actor.session.id, role: actor.session.role, athlete_id: actor.session.athlete_id }
      : actor.kind === "coach"
      ? { kind: "coach" as const, id: actor.session.id }
      : null;
  const notifications = teamId
    ? await getNotificationsForMember(teamId, actorFilter)
    : [];

  return (
    <NotificationsView
      slug={slug}
      initial={notifications}
      hasMember={checkIsMember(actor)}
      isCoach={actor.kind === "coach"}
    />
  );
}
