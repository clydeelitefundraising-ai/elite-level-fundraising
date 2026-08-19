import { NextRequest, NextResponse } from "next/server";
import { getTeamActor, isHeadCoach } from "@/lib/permissions.server";
import { getTeamStaffDisplay } from "@/lib/staffAggregation";
import { getCampaignSettings } from "@/lib/supabase";

type RouteContext = { params: Promise<{ slug: string }> };

// Phase 7: read-only aggregated Staff roster for Team -> Roster -> Staff.
// Any authenticated team actor may read (coach, member — matches the rest
// of Team Hub). Distinct from GET /api/team/[slug]/staff (Phase A28's
// management-focused endpoint, still Head-Coach-only to reach via its
// page) — this one is display-safe for every role and already applies the
// Booster visibility filter + account_id-only dedup.
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind === "public") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [staff, settings] = await Promise.all([
    getTeamStaffDisplay(slug),
    getCampaignSettings(slug),
  ]);

  return NextResponse.json({
    staff,
    canManageBoosterVisibility: isHeadCoach(actor),
    showBoosterInStaffRoster: settings?.show_booster_in_staff_roster !== false,
  });
}
