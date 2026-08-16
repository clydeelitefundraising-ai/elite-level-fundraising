import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import { getCalendarEvents } from "@/lib/teamData";
import { getCampaignSettings } from "@/lib/supabase";
import { buildIcsCalendar } from "@/lib/ics";

// Phase 4C: authenticated one-time .ics download — any team member (coach
// or member), same membership bar as the Calendar page itself, not
// staff-only. Locked scope: ALL FUTURE events from the current Arizona
// date forward (not just the currently displayed month — that's Print's
// job). Reuses getCalendarEvents(slug, upcomingOnly=true), which already
// filters on the Arizona-canonical today via arizonaTodayISO() — no
// second date system introduced here.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind === "public") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [settings, events] = await Promise.all([
    getCampaignSettings(slug),
    getCalendarEvents(slug, /* upcomingOnly */ true),
  ]);
  if (!settings) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const calName = `${settings.school_name} ${settings.sport_name}`.trim() || "ELF Team Calendar";
  const ics = buildIcsCalendar(events, calName);
  const filename = `${slug}-calendar.ics`;

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
