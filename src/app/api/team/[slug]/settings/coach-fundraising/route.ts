import { NextRequest, NextResponse } from "next/server";
import { getTeamActor, isHeadCoach } from "@/lib/permissions.server";
import { updateCampaignSettings } from "@/lib/supabase";
import { logAuditEvent, toAuditActor, ipOf } from "@/lib/auditLog";

type RouteContext = { params: Promise<{ slug: string }> };

// Head-Coach-only campaign-level toggle for the "allow coaches to
// participate in fundraising" flag — the Team-App-side counterpart to
// Platform Admin's existing control over the same field
// (campaign_settings.allow_coach_fundraising, via /api/admin/campaign).
// Same auth pattern as the sibling branding route: isHeadCoach() also
// accepts platform_admin, then a second narrowing check before
// toAuditActor() (which only accepts "coach" | "platform_admin").
//
// Turning this OFF does not delete campaign_coach_fundraisers rows or any
// donation/contact/outreach history — validateCoachForCampaign() already
// checks this flag on every read/write path, so flipping it off simply
// stops new attribution and hides participants from the public
// leaderboard/donation selector going forward.
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (!isHeadCoach(actor)) {
    return NextResponse.json({ error: "Only this team's Head Coach can change coach fundraising settings." }, { status: 403 });
  }
  if (actor.kind !== "coach" && actor.kind !== "platform_admin") {
    return NextResponse.json({ error: "Only this team's Head Coach can change coach fundraising settings." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || typeof body.allow_coach_fundraising !== "boolean") {
    return NextResponse.json({ error: "allow_coach_fundraising (boolean) is required." }, { status: 400 });
  }

  const allow_coach_fundraising = body.allow_coach_fundraising as boolean;

  try {
    await updateCampaignSettings(slug, { allow_coach_fundraising });
  } catch {
    return NextResponse.json({ error: "Failed to save coach fundraising settings." }, { status: 500 });
  }

  logAuditEvent({
    actor: toAuditActor(actor),
    action: "team_settings.coach_fundraising_toggled",
    entity_type: "campaign_settings",
    entity_id: slug,
    campaign_slug: slug,
    summary: `${allow_coach_fundraising ? "Enabled" : "Disabled"} coach fundraising on ${slug}`,
    new_value: { allow_coach_fundraising },
    ip_address: ipOf(req),
    user_agent: req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true, allow_coach_fundraising });
}
