import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { getCampaignSettings, updateCampaignSettings } from "@/lib/supabase";

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get("elf_admin")?.value);
}

export async function GET(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug is required" }, { status: 400 });
  const settings = await getCampaignSettings(slug);
  return NextResponse.json(settings);
}

export async function PUT(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const { slug, school_name, sport_name, mascot, goal_cents, deadline, primary_color, secondary_color, location, season, logo_url, archived, show_leaderboard, show_program_identity, show_share_section, show_fund_uses, show_recent_donations, show_sponsors, show_donation_card, layout_variant, default_athlete_goal_cents } = body;
  if (!slug) return NextResponse.json({ error: "slug is required" }, { status: 400 });
  const patch = { school_name, sport_name, mascot, goal_cents, deadline, primary_color, secondary_color, location, season, logo_url, archived, show_leaderboard, show_program_identity, show_share_section, show_fund_uses, show_recent_donations, show_sponsors, show_donation_card, layout_variant, default_athlete_goal_cents: default_athlete_goal_cents || null };
  try {
    await updateCampaignSettings(slug, patch);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
