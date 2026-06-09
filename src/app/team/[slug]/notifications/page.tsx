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

  const memberId = checkIsMember(actor) ? actor.session.id : null;
  const notifications = teamId
    ? await getNotificationsForMember(teamId, memberId)
    : [];

  return (
    <NotificationsView
      slug={slug}
      initial={notifications}
      hasMember={checkIsMember(actor)}
    />
  );
}
