import { seasonWriteBlocked } from "@/lib/seasonWritable";
import { NextRequest, NextResponse } from "next/server";
import { getSponsors, addSponsor } from "@/lib/supabase";
import { logAuditEvent, ipOf } from "@/lib/auditLog";
import { getAdminAccess, adminUnauthorized, adminAuditActor } from "@/lib/adminAccess";

const DEFAULT_SLUG = "paradise-valley-track-field-live";

export async function GET(req: NextRequest) {
  const access = await getAdminAccess();
  if (!access) return adminUnauthorized();
  const slug = req.nextUrl.searchParams.get("slug") ?? DEFAULT_SLUG;
  const sponsors = await getSponsors(slug);
  return NextResponse.json(sponsors);
}

export async function POST(req: NextRequest) {
  const access = await getAdminAccess();
  if (!access) return adminUnauthorized();
  const { campaign_slug, name, url, tier } = await req.json();
  const slug = campaign_slug ?? DEFAULT_SLUG;
  const seasonBlocked = await seasonWriteBlocked(slug);
  if (seasonBlocked) return seasonBlocked;
  if (!name?.trim() || !url?.trim() || !["gold", "silver", "bronze"].includes(tier)) {
    return NextResponse.json({ error: "name, url, and tier (gold/silver/bronze) are required" }, { status: 400 });
  }
  const sponsor = await addSponsor({ campaign_slug: slug, name: name.trim(), url: url.trim(), tier });
  logAuditEvent({
    actor: adminAuditActor(access),
    action:        "sponsor.added",
    entity_type:   "sponsor",
    entity_id:     sponsor?.id ?? undefined,
    campaign_slug: slug,
    summary:       `Added ${tier} sponsor "${name.trim()}" to ${slug}`,
    new_value:     { name: name.trim(), url: url.trim(), tier, campaign_slug: slug },
    ip_address:    ipOf(req),
    user_agent:    req.headers.get("user-agent"),
  });
  return NextResponse.json(sponsor);
}
