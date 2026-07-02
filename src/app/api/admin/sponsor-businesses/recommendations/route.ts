import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { recommendSponsors } from "@/lib/platform/sponsors";

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get("elf_admin")?.value);
}

// Recommendations are computed on demand (per selected campaign) rather than
// precomputed for every campaign on page load — keeps the Intelligence
// dashboard's initial fetch cheap while still reusing the same scoring
// context internally (see platform/sponsors.ts's loadScoringContext()).
export async function GET(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const campaignSlug = req.nextUrl.searchParams.get("campaign_slug");
  if (!campaignSlug) {
    return NextResponse.json({ error: "campaign_slug is required." }, { status: 400 });
  }

  return NextResponse.json(await recommendSponsors(campaignSlug));
}
