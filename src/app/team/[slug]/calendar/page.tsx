import { getCalendarEvents } from "@/lib/teamData";
import { getCoachSession } from "@/lib/teamSession";
import CalendarView from "./CalendarView";

export default async function CalendarPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [events, coach] = await Promise.all([
    getCalendarEvents(slug),
    getCoachSession(slug),
  ]);
  return <CalendarView slug={slug} initialEvents={events} coach={coach} />;
}
