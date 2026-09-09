import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import { getAnnouncementMeta, getCalendarSignature } from "@/lib/teamData";
import { getTeamIdBySlug, getTeamNotificationMeta } from "@/lib/notifications";

// TeamRealtimeSync polling replacement (see the read-only design report
// this implements). Raw Supabase postgres_changes Realtime never worked
// here — all three watched tables have RLS enabled with zero policies, so
// the anon-key browser client (ELF has no Supabase Auth / bridged JWT)
// never received a single event. This endpoint is the authenticated
// substitute: same getTeamActor identity resolution every other team
// route already uses, returning only minimal change-detection metadata
// (counts + a content hash for calendar) — never announcement/event/
// notification row content.
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ slug: string }> };

export async function GET(_req: NextRequest, { params }: RouteCtx) {
  const { slug } = await params;

  // Same authorization path as every other authenticated team route (e.g.
  // messages/threads/[threadId]/route.ts): resolve identity from
  // elf_session (or legacy cookie fallback) via getTeamActor, which
  // internally re-validates coach/member sessions against this exact
  // slug — the slug alone is never trusted. Platform admin resolves
  // first and unconditionally inside getTeamActor, so it stays
  // first-class here with no special-casing needed.
  const actor = await getTeamActor(slug);
  if (actor.kind === "public") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const teamId = await getTeamIdBySlug(slug);

  const [announcements, calendar, notifications] = await Promise.all([
    getAnnouncementMeta(slug),
    getCalendarSignature(slug),
    teamId ? getTeamNotificationMeta(teamId) : Promise.resolve({ count: 0, latestAt: null }),
  ]);

  return NextResponse.json(
    {
      announcements: { count: announcements.count, latestAt: announcements.latestAt },
      calendar:      { count: calendar.count, signature: calendar.signature },
      notifications: { count: notifications.count, latestAt: notifications.latestAt },
    },
    { headers: { "Cache-Control": "no-store, must-revalidate" } },
  );
}
