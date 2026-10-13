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
  if (!body || typeof body.show_community_partners !== "boolean") {
    return NextResponse.json({ error: "show_community_partners must be a boolean." }, { status: 400 });
  }

  // Fetch-before-write: confirms the organization exists (404 vs a
  // zero-row-matched PATCH, which PostgREST would otherwise report as a
  // silent 200) and captures the real previous value for the audit log,
  // same two-purpose pattern as community-partners/[id]/route.ts's PATCH.
  const existing = await getSchoolAdvertisingSetting(id);
  if (!existing) return NextResponse.json({ error: "School not found." }, { status: 404 });

  const nextValue = body.show_community_partners as boolean;

  let school;
  try {
    school = await setSchoolAdvertisingSetting(id, nextValue);
  } catch {
    // RestError from _client.ts already carries a safe, generic message —
    // never forward raw PostgREST error text (e.g. a pre-migration "column
    // does not exist" failure) to the caller.
    return NextResponse.json({ error: "Failed to update setting. Please try again." }, { status: 500 });
  }
  if (!school) return NextResponse.json({ error: "School not found." }, { status: 404 });

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

  return NextResponse.json(school);
}
