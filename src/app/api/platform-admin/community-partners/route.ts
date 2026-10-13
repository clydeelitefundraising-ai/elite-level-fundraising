import { NextRequest, NextResponse } from "next/server";
import { getPlatformAdminSession } from "@/lib/platformAdminSession";
import { listCommunityPartners, createCommunityPartner, validateCommunityPartnerFields } from "@/lib/platform/communityPartners";
import { logAuditEvent, ipOf } from "@/lib/auditLog";

// Phase 2.2A — Platform-Admin-only. Gated independently of the
// /platform-admin/* layout (API routes bypass layouts entirely), same
// pattern as /api/platform-admin/fundraising-inquiries. Never reachable by
// a coach/booster/parent/athlete session regardless of what a manually
// constructed request claims.
export async function GET() {
  const admin = await getPlatformAdminSession();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const partners = await listCommunityPartners();
  return NextResponse.json({ partners });
}

export async function POST(req: NextRequest) {
  const admin = await getPlatformAdminSession();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const result = validateCommunityPartnerFields(body, { requireName: true });
  if (!result.ok) return NextResponse.json({ error: "Invalid input.", errors: result.errors }, { status: 400 });

  let partner;
  try {
    partner = await createCommunityPartner({
      business_name:     result.value.business_name!,
      short_description: result.value.short_description ?? null,
      website_url:       result.value.website_url ?? null,
      logo_url:          result.value.logo_url ?? null,
    });
  } catch {
    // RestError from _client.ts already carries a safe, generic message —
    // never forward raw PostgREST error text to the caller.
    return NextResponse.json({ error: "Failed to create partner. Please try again." }, { status: 500 });
  }

  logAuditEvent({
    actor:         { type: "platform_admin", id: admin.platformAdminId, email: admin.email, name: admin.name },
    action:        "community_partner.created",
    entity_type:   "community_partner",
    entity_id:     partner.id,
    summary:       `Created ELF Community Partner "${partner.business_name}"`,
    new_value:     { business_name: partner.business_name, website_url: partner.website_url },
    ip_address:    ipOf(req),
    user_agent:    req.headers.get("user-agent"),
  });

  return NextResponse.json(partner);
}
