import { getAnnouncements, getCalendarEvents, getTeamSponsors } from "@/lib/teamData";
import type { SponsorRow } from "@/lib/teamData";
import { getTeamActor } from "@/lib/permissions.server";
import HomeView from "./HomeView";

export default async function HomePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [announcements, upcoming, actor, allSponsors] = await Promise.all([
    getAnnouncements(slug),
    getCalendarEvents(slug, true),
    getTeamActor(slug),
    getTeamSponsors(slug),
  ]);
  const sponsors: SponsorRow[] = allSponsors.filter(s => s.visible !== false);
  return (
    <HomeView
      slug={slug}
      initialAnnouncements={announcements}
      initialUpcoming={upcoming}
      actor={actor}
      sponsors={sponsors}
    />
  );
}
