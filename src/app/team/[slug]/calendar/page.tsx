import { getCalendarEvents } from "@/lib/teamData";
import { getTeamActor } from "@/lib/permissions.server";
import CalendarView from "./CalendarView";

export default async function CalendarPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [events, actor] = await Promise.all([
    getCalendarEvents(slug),
    getTeamActor(slug),
  ]);
  return <CalendarView slug={slug} initialEvents={events} actor={actor} />;
}
