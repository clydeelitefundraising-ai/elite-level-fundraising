import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { getSponsors, addSponsor } from "@/lib/supabase";

const DEFAULT_SLUG = "paradise-valley-track-field-live";

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get("elf_admin")?.value);
}

export async function GET(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const slug = req.nextUrl.searchParams.get("slug") ?? DEFAULT_SLUG;
  const sponsors = await getSponsors(slug);
  return NextResponse.json(sponsors);
}

export async function POST(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { campaign_slug, name, url, tier } = await req.json();
  const slug = campaign_slug ?? DEFAULT_SLUG;
  if (!name?.trim() || !url?.trim() || !["gold", "silver", "bronze"].includes(tier)) {
    return NextResponse.json({ error: "name, url, and tier (gold/silver/bronze) are required" }, { status: 400 });
  }
  const sponsor = await addSponsor({ campaign_slug: slug, name: name.trim(), url: url.trim(), tier });
  return NextResponse.json(sponsor);
}
