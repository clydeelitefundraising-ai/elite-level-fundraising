import { seasonWriteBlocked } from "@/lib/seasonWritable";
import { NextRequest, NextResponse } from "next/server";
import { getFundUses, addFundUse } from "@/lib/supabase";
import { logAuditEvent, ipOf } from "@/lib/auditLog";
import { getAdminAccess, adminUnauthorized, adminAuditActor } from "@/lib/adminAccess";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const access = await getAdminAccess();
  if (!access) return adminUnauthorized();
  const slug = req.nextUrl.searchParams.get("slug") ?? "";
  if (!slug) return NextResponse.json([]);
  const items = await getFundUses(slug);
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const access = await getAdminAccess();
  if (!access) return adminUnauthorized();
  const { campaign_slug, title, description, icon, sort_order } = await req.json();
  const seasonBlocked = await seasonWriteBlocked(campaign_slug);
  if (seasonBlocked) return seasonBlocked;
  const item = await addFundUse({ campaign_slug, title, description, icon: icon || "💰", sort_order: sort_order ?? 0 });
  logAuditEvent({
    actor: adminAuditActor(access),
    action:        "fund_use.added",
    entity_type:   "fund_use",
    entity_id:     item?.id ?? undefined,
    campaign_slug: campaign_slug ?? null,
    summary:       `Added fund use "${title}" to ${campaign_slug}`,
    new_value:     { title, description, icon: icon || "💰", campaign_slug },
    ip_address:    ipOf(req),
    user_agent:    req.headers.get("user-agent"),
  });
  return NextResponse.json(item);
}
