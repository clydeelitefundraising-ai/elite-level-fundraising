import { getAnnouncements, getCalendarEvents } from "@/lib/teamData";
import { getCoachSession } from "@/lib/teamSession";
import HomeView from "./HomeView";

export default async function HomePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [announcements, upcoming, coach] = await Promise.all([
    getAnnouncements(slug),
    getCalendarEvents(slug, true),
    getCoachSession(slug),
  ]);
  return (
    <HomeView
      slug={slug}
      initialAnnouncements={announcements}
      initialUpcoming={upcoming}
      coach={coach}
    />
  );
}
