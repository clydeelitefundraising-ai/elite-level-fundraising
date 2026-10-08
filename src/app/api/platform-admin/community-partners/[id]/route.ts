import { NextRequest, NextResponse } from "next/server";
import { getPlatformAdminSession } from "@/lib/platformAdminSession";
import { getCommunityPartner, updateCommunityPartner, validateCommunityPartnerFields } from "@/lib/platform/communityPartners";
import { logAuditEvent, ipOf } from "@/lib/auditLog";

type RouteContext = { params: Promise<{ id: string }> };

// Phase 2.2A — Platform-Admin-only, independently re-verified here (not
// only in the /platform-admin/* page layout, which API routes bypass
// entirely). No DELETE handler exists on this route — deactivation
// (PATCH { is_active: false }) is the only supported retirement path,
// matching campaign_settings.archived's existing soft-retirement
// convention; see the migration's own header comment for the rationale.
export async function GET(req: NextRequest, { params }: RouteContext) {
  const admin = await getPlatformAdminSession();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const partner = await getCommunityPartner(id);
  if (!partner) return NextResponse.json({ error: "Partner not found." }, { status: 404 });
  return NextResponse.json(partner);
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const admin = await getPlatformAdminSession();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await getCommunityPartner(id);
  if (!existing) return NextResponse.json({ error: "Partner not found." }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const result = validateCommunityPartnerFields(body, { requireName: false });
  if (!result.ok) return NextResponse.json({ error: "Invalid input.", errors: result.errors }, { status: 400 });

  if (Object.keys(result.value).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  let partner;
  try {
    partner = await updateCommunityPartner(id, result.value);
  } catch {
    return NextResponse.json({ error: "Failed to update partner. Please try again." }, { status: 500 });
  }

  logAuditEvent({
    actor:          { type: "platform_admin", id: admin.platformAdminId, email: admin.email, name: admin.name },
    action:         "community_partner.updated",
    entity_type:    "community_partner",
    entity_id:      id,
    summary:        `Updated ELF Community Partner "${partner.business_name}"`,
    previous_value: { is_active: existing.is_active, is_featured: existing.is_featured, display_order: existing.display_order },
    new_value:      result.value as Record<string, unknown>,
    ip_address:     ipOf(req),
    user_agent:     req.headers.get("user-agent"),
  });

  return NextResponse.json(partner);
}
