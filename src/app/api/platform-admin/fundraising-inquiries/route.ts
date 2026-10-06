import { NextResponse } from "next/server";
import { getPlatformAdminSession } from "@/lib/platformAdminSession";
import {
  listFundraisingInquiries, getCampaignContextsForSlugs, resolveFundraisingInquiryRequesterNames,
} from "@/lib/platform/fundraisingInquiries";

// Phase F1d. Cross-campaign queue, same shape as /api/platform-admin/reports
// — gated by the real elf_accounts-backed platform_admins identity
// (getPlatformAdminSession), NOT the legacy shared-password /admin tool,
// since F1d's status-transition route needs a real account id to attribute
// a resolution to (see the [id]/route.ts PATCH handler).
export async function GET() {
  const admin = await getPlatformAdminSession();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const inquiries = await listFundraisingInquiries();
  if (inquiries.length === 0) return NextResponse.json({ inquiries: [] });

  const [contextsBySlug, namesByAccountId] = await Promise.all([
    getCampaignContextsForSlugs(inquiries.map(i => i.campaign_slug)),
    resolveFundraisingInquiryRequesterNames(inquiries.map(i => i.requested_by_account_id)),
  ]);

  const result = inquiries.map(i => {
    const context = contextsBySlug[i.campaign_slug];
    return {
      id:                 i.id,
      campaign_slug:      i.campaign_slug,
      school_name:        context?.school_name ?? null,
      sport_name:         context?.sport_name  ?? null,
      season:             context?.season      ?? null,
      requested_by_role:  i.requested_by_role,
      // Never the raw requested_by_account_id — the UI falls back to a
      // generic "Coach" label itself when this is null.
      requester_name:     namesByAccountId[i.requested_by_account_id] ?? null,
      status:             i.status,
      created_at:         i.created_at,
      decided_at:         i.decided_at,
    };
  });

  return NextResponse.json({ inquiries: result });
}
