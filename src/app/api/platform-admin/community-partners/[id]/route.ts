import { NextRequest, NextResponse } from "next/server";
import { getPlatformAdminSession } from "@/lib/platformAdminSession";
import { getCommunityPartner, updateCommunityPartner, validateCommunityPartnerFields, findPartnerByLockedPosition } from "@/lib/platform/communityPartners";
import { RestError } from "@/lib/platform/_client";
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

  // Phase 2.2D-1 — a position LOCK (not an unlock/null, and only when the
  // lock is actually changing) gets a friendly pre-check naming the
  // conflicting partner. This is a courtesy for the common case; it does
  // NOT replace the database's partial unique index as the real guard —
  // see the catch block below, which still handles a genuine race (two
  // concurrent PATCHes) via the 23505 the write itself would throw.
  if (typeof result.value.locked_position === "number" && result.value.locked_position !== existing.locked_position) {
    const holder = await findPartnerByLockedPosition(result.value.locked_position);
    if (holder && holder.id !== id) {
      return NextResponse.json(
        { error: `Position ${result.value.locked_position} is already locked to "${holder.business_name}".` },
        { status: 409 },
      );
    }
  }

  let partner;
  try {
    partner = await updateCommunityPartner(id, result.value);
  } catch (err) {
    // A genuine race lost to the database's unique index — the pre-check
    // above found nothing free a moment ago, but another admin's PATCH
    // won the write in between. Still a clean 409, never a 500, and the
    // partner's lock is NOT silently reassigned or dropped (the write
    // failed outright, this partner's row is untouched).
    if (err instanceof RestError && err.code === "23505" && err.constraint === "community_partners_locked_position_unique_idx") {
      return NextResponse.json(
        { error: "That position was just locked by another request. Please choose a different position." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Failed to update partner. Please try again." }, { status: 500 });
  }

  logAuditEvent({
    actor:          { type: "platform_admin", id: admin.platformAdminId, email: admin.email, name: admin.name },
    action:         "community_partner.updated",
    entity_type:    "community_partner",
    entity_id:      id,
    summary:        `Updated ELF Community Partner "${partner.business_name}"`,
    previous_value: { is_active: existing.is_active, is_featured: existing.is_featured, display_order: existing.display_order, locked_position: existing.locked_position },
    new_value:      result.value as Record<string, unknown>,
    ip_address:     ipOf(req),
    user_agent:     req.headers.get("user-agent"),
  });

  return NextResponse.json(partner);
}
