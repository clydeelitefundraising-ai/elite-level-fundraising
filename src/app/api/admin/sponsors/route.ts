import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { getSponsors, addSponsor } from "@/lib/supabase";

const SLUG = "paradise-valley-track-field-live";

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get("elf_admin")?.value);
}

export async function GET() {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sponsors = await getSponsors(SLUG);
  return NextResponse.json(sponsors);
}

export async function POST(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { name, url, tier } = await req.json();
  if (!name?.trim() || !url?.trim() || !["gold", "silver", "bronze"].includes(tier)) {
    return NextResponse.json({ error: "name, url, and tier (gold/silver/bronze) are required" }, { status: 400 });
  }
  const sponsor = await addSponsor({ campaign_slug: SLUG, name: name.trim(), url: url.trim(), tier });
  return NextResponse.json(sponsor);
}
