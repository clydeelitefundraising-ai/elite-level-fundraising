import { seasonWriteBlocked } from "@/lib/seasonWritable";
import { NextRequest, NextResponse } from "next/server";
import { getTeamActor, isHeadCoach } from "@/lib/permissions.server";
import { updateCampaignSettings } from "@/lib/supabase";
import { logAuditEvent, toAuditActor, ipOf } from "@/lib/auditLog";
import { normalizeAbout, validateLocation } from "@/lib/teamOverview";

type RouteContext = { params: Promise<{ slug: string }> };

const FORBIDDEN = "Only this team's Head Coach can edit the team overview.";

// Phase T6 — Team -> Overview text: "About Our Team" and the Location card.
// Head-Coach-only (isHeadCoach also admits platform admins, same as every
// other team-settings route); completed seasons are read-only. Accepts
// exactly one of { team_about } or { location: { street, city_state, zip } }
// and writes only that section's columns — never branding, fundraising or
// anything else on the row.
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { slug } = await params;
  const seasonBlocked = await seasonWriteBlocked(slug);
  if (seasonBlocked) return seasonBlocked;
  const actor = await getTeamActor(slug);
  if (!isHeadCoach(actor) || (actor.kind !== "coach" && actor.kind !== "platform_admin")) {
    return NextResponse.json({ error: FORBIDDEN }, { status: 403 });
  }

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const hasAbout = !!body && Object.prototype.hasOwnProperty.call(body, "team_about");
  const hasLocation = !!body && Object.prototype.hasOwnProperty.call(body, "location");
  if (!body || hasAbout === hasLocation) {
    return NextResponse.json({ error: "Send either team_about or location." }, { status: 400 });
  }

  let patch: Record<string, string | null>;
  let action: string;
  if (hasAbout) {
    const r = normalizeAbout(body.team_about);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    patch = { team_about: r.value };
    action = "team_overview.about_updated";
  } else {
    const r = validateLocation(body.location);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    patch = { ...r.value };
    action = "team_overview.location_updated";
  }

  try {
    await updateCampaignSettings(slug, patch);
  } catch {
    return NextResponse.json({ error: "Failed to save. Please try again." }, { status: 500 });
  }

  logAuditEvent({
    actor: toAuditActor(actor),
    action,
    entity_type: "campaign_settings",
    entity_id: slug,
    campaign_slug: slug,
    summary: hasAbout ? `Updated About Our Team on ${slug}` : `Updated team location on ${slug}`,
    new_value: hasAbout ? { team_about_chars: patch.team_about?.length ?? 0 } : patch,
    ip_address: ipOf(req),
    user_agent: req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true, ...patch });
}
