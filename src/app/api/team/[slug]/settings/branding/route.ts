import { NextRequest, NextResponse } from "next/server";
import { getTeamActor, isHeadCoach } from "@/lib/permissions.server";
import { updateCampaignSettings } from "@/lib/supabase";
import { logAuditEvent, toAuditActor, ipOf } from "@/lib/auditLog";
import { normalizeHexColor, buildBrandingSavePayload, buildBrandingResetPayload } from "@/lib/theme/brandingValidation";

type RouteContext = { params: Promise<{ slug: string }> };

// Head-Coach-only (isHeadCoach() also accepts platform_admin, per the
// existing permission model — see permissions.ts). Server-side enforcement
// is the actual security boundary; the Settings UI additionally hides these
// controls from non-head-coach staff, but that's a convenience, not the
// guard. This route intentionally never touches logo_url — logo changes are
// a fully independent action (see the sibling branding/logo route) and must
// never flip branding_customized as a side effect.
//
// Two distinct operations, both scoped to this one route:
//   - Save Team Colors: { primary_color, secondary_color } -> writes both
//     colors and sets branding_customized = true.
//   - Reset to ELF Branding: { reset: true } -> writes ONLY
//     branding_customized = false. Stored colors are deliberately left
//     untouched (see phase_a32_team_branding_customized.sql / teamTheme.ts)
//     so a coach can re-enable their previous choice later without
//     re-entering it, and so a malformed "erase" step can never happen.
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (!isHeadCoach(actor)) {
    return NextResponse.json({ error: "Only this team's Head Coach can change team branding." }, { status: 403 });
  }
  // isHeadCoach() is also true for platform_admin, and toAuditActor() only
  // accepts "coach" | "platform_admin" — this narrows for the audit call
  // below without changing the authorization decision above.
  if (actor.kind !== "coach" && actor.kind !== "platform_admin") {
    return NextResponse.json({ error: "Only this team's Head Coach can change team branding." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body required." }, { status: 400 });
  }

  if (body.reset === true) {
    const payload = buildBrandingResetPayload();
    try {
      await updateCampaignSettings(slug, payload);
    } catch {
      return NextResponse.json({ error: "Failed to reset branding." }, { status: 500 });
    }

    logAuditEvent({
      actor: toAuditActor(actor),
      action: "team_settings.branding_reset",
      entity_type: "campaign_settings",
      entity_id: slug,
      campaign_slug: slug,
      summary: `Reset team branding to ELF defaults on ${slug}`,
      new_value: { branding_customized: false },
      ip_address: ipOf(req),
      user_agent: req.headers.get("user-agent"),
    });

    return NextResponse.json({ ok: true, branding_customized: false });
  }

  const rawPrimary = typeof body.primary_color === "string" ? body.primary_color : "";
  const rawSecondary = typeof body.secondary_color === "string" ? body.secondary_color : "";
  const primary_color = normalizeHexColor(rawPrimary);
  const secondary_color = normalizeHexColor(rawSecondary);

  if (!primary_color || !secondary_color) {
    return NextResponse.json(
      { error: "primary_color and secondary_color must be valid #RRGGBB colors." },
      { status: 400 },
    );
  }

  const payload = buildBrandingSavePayload(primary_color, secondary_color);
  try {
    await updateCampaignSettings(slug, payload);
  } catch {
    return NextResponse.json({ error: "Failed to save team branding." }, { status: 500 });
  }

  logAuditEvent({
    actor: toAuditActor(actor),
    action: "team_settings.branding_saved",
    entity_type: "campaign_settings",
    entity_id: slug,
    campaign_slug: slug,
    summary: `Saved custom team branding on ${slug}`,
    new_value: { primary_color, secondary_color, branding_customized: true },
    ip_address: ipOf(req),
    user_agent: req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true, primary_color, secondary_color, branding_customized: true });
}
