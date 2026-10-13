import { NextRequest, NextResponse } from "next/server";
import { getPlatformAdminSession } from "@/lib/platformAdminSession";
import { getSchoolAdvertisingSetting, setSchoolAdvertisingSetting, isValidOrganizationId } from "@/lib/platform/schoolAdvertising";
import { logAuditEvent, ipOf } from "@/lib/auditLog";

type RouteContext = { params: Promise<{ id: string }> };

// Phase 2.2B — Platform-Admin-only, independently re-verified here, same
// contract as /api/platform-admin/community-partners. Deliberately scoped
// to this one setting rather than a general organizations CRUD surface —
// see schoolAdvertising.ts's setSchoolAdvertisingSetting, which can only
// ever write show_community_partners, never any other organizations column
// (branding, address, AD contact, etc. stay reachable only through the
// legacy /api/admin/organization route, untouched by this phase).
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const admin = await getPlatformAdminSession();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!isValidOrganizationId(id)) return NextResponse.json({ error: "Invalid organization id." }, { status: 400 });

  const school = await getSchoolAdvertisingSetting(id);
  if (!school) return NextResponse.json({ error: "School not found." }, { status: 404 });
  return NextResponse.json(school);
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const admin = await getPlatformAdminSession();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!isValidOrganizationId(id)) return NextResponse.json({ error: "Invalid organization id." }, { status: 400 });

  const body = await req.json().catch(() => null);
  const hasAppField = body && typeof body.show_community_partners === "boolean";
  const hasPublicField = body && typeof body.show_community_partners_public === "boolean";
  if (!body || (!hasAppField && !hasPublicField)) {
    return NextResponse.json(
      { error: "At least one of show_community_partners or show_community_partners_public must be a boolean." },
      { status: 400 },
    );
  }

  // Fetch-before-write: confirms the organization exists (404 vs a
  // zero-row-matched PATCH, which PostgREST would otherwise report as a
  // silent 200) and captures the real previous value for the audit log,
  // same two-purpose pattern as community-partners/[id]/route.ts's PATCH.
  const existing = await getSchoolAdvertisingSetting(id);
  if (!existing) return NextResponse.json({ error: "School not found." }, { status: 404 });

  // Phase 2.2E-2 — the two toggles are independent; the request patches
  // only whichever field(s) it actually sent, never both just because one
  // was present (see schoolAdvertising.ts's SchoolAdvertisingPatch).
  const patch: { show_community_partners?: boolean; show_community_partners_public?: boolean } = {};
  if (hasAppField) patch.show_community_partners = body.show_community_partners as boolean;
  if (hasPublicField) patch.show_community_partners_public = body.show_community_partners_public as boolean;

  let school;
  try {
    school = await setSchoolAdvertisingSetting(id, patch);
  } catch {
    // RestError from _client.ts already carries a safe, generic message —
    // never forward raw PostgREST error text (e.g. a pre-migration "column
    // does not exist" failure) to the caller.
    return NextResponse.json({ error: "Failed to update setting. Please try again." }, { status: 500 });
  }
  if (!school) return NextResponse.json({ error: "School not found." }, { status: 404 });

  // Audit each changed field independently so the log reflects exactly
  // what was toggled, never implying the other field changed too.
  if (hasAppField) {
    const nextValue = patch.show_community_partners as boolean;
    logAuditEvent({
      actor:          { type: "platform_admin", id: admin.platformAdminId, email: admin.email, name: admin.name },
      action:         "school.community_partners_toggled",
      entity_type:    "organization",
      entity_id:      id,
      summary:        `${nextValue ? "Enabled" : "Disabled"} ELF Community Partners advertising for "${existing.school_name}"`,
      previous_value: { show_community_partners: existing.show_community_partners },
      new_value:      { show_community_partners: nextValue },
      ip_address:     ipOf(req),
      user_agent:     req.headers.get("user-agent"),
    });
  }
  if (hasPublicField) {
    const nextValue = patch.show_community_partners_public as boolean;
    logAuditEvent({
      actor:          { type: "platform_admin", id: admin.platformAdminId, email: admin.email, name: admin.name },
      action:         "school.community_partners_public_toggled",
      entity_type:    "organization",
      entity_id:      id,
      summary:        `${nextValue ? "Enabled" : "Disabled"} public-page ELF Community Partners advertising for "${existing.school_name}"`,
      previous_value: { show_community_partners_public: existing.show_community_partners_public },
      new_value:      { show_community_partners_public: nextValue },
      ip_address:     ipOf(req),
      user_agent:     req.headers.get("user-agent"),
    });
  }

  return NextResponse.json(school);
}
