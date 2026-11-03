import { NextRequest, NextResponse } from "next/server";
import { recommendSponsors } from "@/lib/platform/sponsors";
import { getAdminAccess, adminUnauthorized } from "@/lib/adminAccess";

// Recommendations are computed on demand (per selected campaign) rather than
// precomputed for every campaign on page load — keeps the Intelligence
// dashboard's initial fetch cheap while still reusing the same scoring
// context internally (see platform/sponsors.ts's loadScoringContext()).
export async function GET(req: NextRequest) {
  const access = await getAdminAccess();
  if (!access) return adminUnauthorized();

  const campaignSlug = req.nextUrl.searchParams.get("campaign_slug");
  if (!campaignSlug) {
    return NextResponse.json({ error: "campaign_slug is required." }, { status: 400 });
  }

  return NextResponse.json(await recommendSponsors(campaignSlug));
}
