import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { logAudit, ADMIN_TOOL_ACTOR, ipOf } from "@/lib/platform/audit";
import { getSponsorRelationships, createSponsorRelationship } from "@/lib/platform/sponsors";
import { getCampaignSummary } from "@/lib/platform/campaigns";

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get("elf_admin")?.value);
}

export async function GET(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const businessId = req.nextUrl.searchParams.get("business_id") ?? undefined;
  const [relationships, campaigns] = await Promise.all([
    getSponsorRelationships(businessId),
    getCampaignSummary(),
  ]);

  // Enriched with school/sport for the detail panel's "Sports/Schools Supported"
  // summary — presentation-layer join, not a platform/sponsors.ts concern.
  const campaignsBySlug = new Map(campaigns.map(c => [c.campaign_slug, c]));
  const enriched = relationships.map(r => ({
    ...r,
    schoolName: r.campaign_slug ? campaignsBySlug.get(r.campaign_slug)?.school_name ?? null : null,
    sportName:  r.campaign_slug ? campaignsBySlug.get(r.campaign_slug)?.sport_name ?? null : null,
  }));

  return NextResponse.json(enriched);
}

export async function POST(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as Record<string, unknown>;
  const business_id = typeof body.business_id === "string" ? body.business_id : "";
  if (!business_id) {
    return NextResponse.json({ error: "business_id is required." }, { status: 400 });
  }

  let relationship;
  try {
    relationship = await createSponsorRelationship({
      business_id,
      campaign_slug:      typeof body.campaign_slug === "string" && body.campaign_slug.trim() !== "" ? body.campaign_slug.trim() : null,
      sponsorship_amount: typeof body.sponsorship_amount === "number" ? body.sponsorship_amount : null,
      sponsorship_level:  typeof body.sponsorship_level === "string" && body.sponsorship_level.trim() !== "" ? body.sponsorship_level.trim() : null,
      notes:              typeof body.notes === "string" && body.notes.trim() !== "" ? body.notes.trim() : null,
    });
  } catch (err) {
    return NextResponse.json({ error: `Failed to create sponsorship: ${err instanceof Error ? err.message : "unknown error"}` }, { status: 500 });
  }

  logAudit({
    actor: ADMIN_TOOL_ACTOR,
    action:        "sponsor_business.sponsorship_recorded",
    entity_type:   "sponsor_relationship",
    entity_id:     relationship.id,
    campaign_slug: relationship.campaign_slug ?? null,
    summary:       `Recorded sponsorship for business ${business_id}${relationship.campaign_slug ? ` on campaign ${relationship.campaign_slug}` : ""}`,
    new_value:     relationship,
    ip_address:    ipOf(req),
    user_agent:    req.headers.get("user-agent"),
  });

  return NextResponse.json(relationship);
}
