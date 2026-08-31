import { getCalendarEvents } from "@/lib/teamData";
import { getCampaignSettings } from "@/lib/supabase";
import { requireTeamMembership } from "@/lib/permissions.server";
import CalendarWorkspaceView from "./CalendarWorkspaceView";

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
  const [events, settings] = await Promise.all([
    getCalendarEvents(slug),
    getCampaignSettings(slug),
  ]);
  // Phase 4C: team display name for print branding and the .ics
  // X-WR-CALNAME — settings is already fetched by the layout too, but that
  // value isn't threaded through props today, so this is a second small
  // read rather than a layout-prop-drilling change.
  const teamName = settings ? `${settings.school_name} ${settings.sport_name}`.trim() : "";
  return <CalendarWorkspaceView slug={slug} initialEvents={events} actor={actor} teamName={teamName} />;
}
