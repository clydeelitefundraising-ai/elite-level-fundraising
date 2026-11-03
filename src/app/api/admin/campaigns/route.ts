import { NextRequest, NextResponse } from "next/server";
import { createCampaignSettings } from "@/lib/supabase";
import { getAdminAccess, adminUnauthorized, adminAuditActor } from "@/lib/adminAccess";
import { logAuditEvent, ipOf } from "@/lib/auditLog";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
function h() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

export async function GET() {
  const access = await getAdminAccess();
  if (!access) return adminUnauthorized();

  const [campaignsRes, donationsRes, athletesRes] = await Promise.all([
    fetch(`${BASE}/rest/v1/campaign_settings?select=*&order=campaign_slug.asc`, { headers: h(), cache: "no-store" }),
    fetch(`${BASE}/rest/v1/donations?select=campaign_slug,amount_cents`, { headers: h(), cache: "no-store" }),
    fetch(`${BASE}/rest/v1/athletes?select=id,campaign_slug`, { headers: h(), cache: "no-store" }),
  ]);

  const campaigns = campaignsRes.ok ? await campaignsRes.json() : [];
  const donations: { campaign_slug: string | null; amount_cents: number }[] = donationsRes.ok ? await donationsRes.json() : [];
  const athletes: { id: string; campaign_slug: string }[] = athletesRes.ok ? await athletesRes.json() : [];

  // Aggregate per campaign
  const raisedMap: Record<string, number> = {};
  const donorMap: Record<string, number> = {};
  for (const d of donations) {
    if (!d.campaign_slug) continue;
    raisedMap[d.campaign_slug] = (raisedMap[d.campaign_slug] ?? 0) + d.amount_cents;
    donorMap[d.campaign_slug] = (donorMap[d.campaign_slug] ?? 0) + 1;
  }
  const athleteCountMap: Record<string, number> = {};
  for (const a of athletes) {
    athleteCountMap[a.campaign_slug] = (athleteCountMap[a.campaign_slug] ?? 0) + 1;
  }

  const enriched = campaigns.map((c: { campaign_slug: string }) => ({
    ...c,
    raised_cents:  raisedMap[c.campaign_slug] ?? 0,
    donor_count:   donorMap[c.campaign_slug]  ?? 0,
    athlete_count: athleteCountMap[c.campaign_slug] ?? 0,
  }));

  return NextResponse.json(enriched);
}

export async function POST(req: NextRequest) {
  const access = await getAdminAccess();
  if (!access) return adminUnauthorized();

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
    logAuditEvent({
      actor:         adminAuditActor(access),
      action:        "campaign.created",
      entity_type:   "campaign_settings",
      entity_id:     campaign_slug.trim(),
      campaign_slug: campaign_slug.trim(),
      summary:       `Campaign ${campaign_slug.trim()} created`,
      ip_address:    ipOf(req),
      user_agent:    req.headers.get("user-agent"),
    });
    return NextResponse.json({ ok: true, slug: campaign_slug.trim() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create campaign.";
    const status = message.includes("already exists") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
