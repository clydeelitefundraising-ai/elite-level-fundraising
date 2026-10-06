import { NextRequest, NextResponse } from "next/server";
import { getPlatformAdminSession } from "@/lib/platformAdminSession";
import { updateFundraisingInquiryStatus } from "@/lib/platform/fundraisingInquiries";
import { logAuditEvent } from "@/lib/auditLog";

type RouteCtx = { params: Promise<{ id: string }> };

const VALID_TARGET_STATUSES = ["contacted", "resolved"] as const;

// Phase F1d. The only write path for an inquiry's status after creation.
// Platform Admin authorization is independently re-verified server-side
// (getPlatformAdminSession, never a client-supplied admin flag) — same
// pattern as /api/platform-admin/reports/[id]. decided_by_account_id (set
// only on the resolved transition) always comes from this resolved admin's
// own elf_accounts id, never from the request body.
export async function PATCH(req: NextRequest, { params }: RouteCtx) {
  const admin = await getPlatformAdminSession();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || !VALID_TARGET_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: "status must be 'contacted' or 'resolved'." }, { status: 400 });
  }

  const result = await updateFundraisingInquiryStatus(id, body.status, admin.accountId);
  if (!result.ok) {
    if (result.error === "not_found") {
      return NextResponse.json({ error: "Inquiry not found." }, { status: 404 });
    }
    // invalid_transition — e.g. attempting to move a resolved inquiry
    // anywhere, or re-requesting a status it's already past.
    return NextResponse.json(
      { error: "This inquiry's status can no longer be changed from here." },
      { status: 409 },
    );
  }

  logAuditEvent({
    actor:         { type: "platform_admin", id: admin.platformAdminId, email: admin.email, name: admin.name },
    action:        "fundraising_inquiry.status_changed",
    entity_type:   "fundraising_inquiries",
    entity_id:     id,
    campaign_slug: result.inquiry.campaign_slug,
    summary:       `Fundraising inquiry marked ${body.status}`,
  });

  return NextResponse.json({ inquiry: result.inquiry });
}
