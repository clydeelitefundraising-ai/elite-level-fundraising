import { getCalendarEvents } from "@/lib/teamData";
import { requireTeamMembership } from "@/lib/permissions.server";
import CalendarView from "./CalendarView";

export default async function CalendarPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // Phase 4A: Calendar is a private Team Hub page, not a public-facing one
  // (unlike Fundraiser/the athlete donor profile) — gate it the same way
  // Home/Team/Communications already do.
  const actor = await requireTeamMembership(slug);
  const events = await getCalendarEvents(slug);
  return <CalendarView slug={slug} initialEvents={events} actor={actor} />;
}
