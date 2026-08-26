import { NextRequest, NextResponse } from "next/server";
import { getTeamActor, isHeadCoach } from "@/lib/permissions.server";
import { updateCampaignSettings } from "@/lib/supabase";
import { logAuditEvent, toAuditActor, ipOf } from "@/lib/auditLog";

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
  if (actor.kind !== "coach" && actor.kind !== "platform_admin") {
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

  logAuditEvent({
    actor: toAuditActor(actor),
    action: "team_settings.booster_visibility_changed",
    entity_type: "campaign_settings",
    entity_id: slug,
    campaign_slug: slug,
    summary: `Set show_booster_in_staff_roster=${body.show_booster_in_staff_roster} on ${slug}`,
    new_value: { show_booster_in_staff_roster: body.show_booster_in_staff_roster },
    ip_address: ipOf(req),
    user_agent: req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true, show_booster_in_staff_roster: body.show_booster_in_staff_roster });
}
