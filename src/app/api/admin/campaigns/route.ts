import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { createCampaignSettings } from "@/lib/supabase";

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get("elf_admin")?.value);
}

export async function POST(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const {
    campaign_slug, school_name, sport_name, mascot,
    goal_cents, deadline,
    primary_color, secondary_color,
    location, season, logo_url,
  } = await req.json();

  if (!campaign_slug?.trim()) {
    return NextResponse.json({ error: "campaign_slug is required." }, { status: 400 });
  }
  if (!/^[a-z0-9-]+$/.test(campaign_slug.trim())) {
    return NextResponse.json({ error: "Slug must be lowercase letters, numbers, and hyphens only." }, { status: 400 });
  }

  try {
    await createCampaignSettings({
      campaign_slug:  campaign_slug.trim(),
      school_name:    school_name    ?? "",
      sport_name:     sport_name     ?? "",
      mascot:         mascot         ?? "",
      goal_cents:     goal_cents     ?? 0,
      deadline:       deadline       ?? "",
      primary_color:  primary_color  ?? "#1B4FA8",
      secondary_color: secondary_color ?? "#C4A35A",
      location:       location       ?? "",
      season:         season         ?? "",
      logo_url:       logo_url       ?? "",
    });
    return NextResponse.json({ ok: true, slug: campaign_slug.trim() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create campaign.";
    const status = message.includes("already exists") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
