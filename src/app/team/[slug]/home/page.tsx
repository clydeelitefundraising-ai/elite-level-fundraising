import { getAnnouncements, getCalendarEvents } from "@/lib/teamData";
import { getTeamActor } from "@/lib/permissions.server";
import HomeView from "./HomeView";

export default async function HomePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [announcements, upcoming, actor] = await Promise.all([
    getAnnouncements(slug),
    getCalendarEvents(slug, true),
    getTeamActor(slug),
  ]);
  return (
    <HomeView
      slug={slug}
      initialAnnouncements={announcements}
      initialUpcoming={upcoming}
      actor={actor}
    />
  );
}
