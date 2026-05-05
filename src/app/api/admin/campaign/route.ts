import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { getCampaignSettings, updateCampaignSettings } from "@/lib/supabase";

const DEFAULT_SLUG = "paradise-valley-track-field-live";

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get("elf_admin")?.value);
}

export async function GET(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const slug = req.nextUrl.searchParams.get("slug") ?? DEFAULT_SLUG;
  const settings = await getCampaignSettings(slug);
  return NextResponse.json(settings);
}

export async function PUT(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { slug: bodySlug, school_name, sport_name, mascot, goal_cents, deadline, primary_color, secondary_color, location, season, logo_url, archived } = await req.json();
  const slug = bodySlug ?? DEFAULT_SLUG;
  await updateCampaignSettings(slug, { school_name, sport_name, mascot, goal_cents, deadline, primary_color, secondary_color, location, season, logo_url, archived });
  return NextResponse.json({ ok: true });
}
