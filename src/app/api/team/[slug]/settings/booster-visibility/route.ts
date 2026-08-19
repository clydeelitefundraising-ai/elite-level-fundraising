import { NextRequest, NextResponse } from "next/server";
import { getTeamActor, isHeadCoach } from "@/lib/permissions.server";
import { updateCampaignSettings } from "@/lib/supabase";

type RouteContext = { params: Promise<{ slug: string }> };

// Head-Coach-only. Display-only preference — see supabase/migrations/
// phase_7_team_hub.sql and CampaignSettings.show_booster_in_staff_roster
// for the "never referenced by permissions" guarantee. This route only
// ever writes that one column.
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (!isHeadCoach(actor)) {
    return NextResponse.json({ error: "Only this team's Head Coach can change this setting." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.show_booster_in_staff_roster !== "boolean") {
    return NextResponse.json({ error: "show_booster_in_staff_roster (boolean) is required." }, { status: 400 });
  }

  try {
    await updateCampaignSettings(slug, { show_booster_in_staff_roster: body.show_booster_in_staff_roster });
  } catch {
    return NextResponse.json({ error: "Failed to update setting." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, show_booster_in_staff_roster: body.show_booster_in_staff_roster });
}
