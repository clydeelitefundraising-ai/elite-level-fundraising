import { NextResponse } from "next/server";
import { getDonations, getCampaignSettings, getAthletes, getSponsors } from "@/lib/supabase";

const SLUG = "paradise-valley-track-field-live";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const donations = await getDonations();
    console.log(`[campaign-stats] fetched ${donations.length} donations`);

    const raised = donations.reduce((sum, d) => sum + d.amount_cents, 0) / 100;
    const donors = donations.length;

    const athleteTotals: Record<string, number> = {};
    for (const d of donations) {
      if (d.athlete_name) {
        athleteTotals[d.athlete_name] =
          (athleteTotals[d.athlete_name] ?? 0) + d.amount_cents / 100;
      }
    }

    const recentDonations = donations.slice(0, 5).map((d) => ({
      name:    d.donor_name ?? "Anonymous",
      amount:  d.amount_cents / 100,
      message: d.donation_message ?? "",
      time:    timeAgo(d.created_at),
    }));

    // Fetch dynamic campaign data — fail gracefully so public page always loads
    let goal: number | undefined;
    let daysLeft: number | undefined;
    let schoolName: string | undefined;
    let sportName: string | undefined;
    let mascot: string | undefined;
    let primaryColor: string | undefined;
    let secondaryColor: string | undefined;
    let location: string | undefined;
    let season: string | undefined;
    let logoUrl: string | undefined;
    let athletes: { name: string; event: string }[] | undefined;
    let sponsors: { name: string; url: string; tier: string }[] | undefined;

    try {
      const settings = await getCampaignSettings(SLUG);
      if (settings) {
        goal = settings.goal_cents / 100;
        const deadline = new Date(settings.deadline);
        daysLeft = Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / 86400000));
        if (settings.school_name)    schoolName    = settings.school_name;
        if (settings.sport_name)     sportName     = settings.sport_name;
        if (settings.mascot)         mascot        = settings.mascot;
        if (settings.primary_color)   primaryColor   = settings.primary_color;
        if (settings.secondary_color) secondaryColor = settings.secondary_color;
        if (settings.location)        location       = settings.location;
        if (settings.season)          season         = settings.season;
        if (settings.logo_url)        logoUrl        = settings.logo_url;
      }
    } catch { /* keep undefined — tables may not exist yet */ }

    try {
      const rows = await getAthletes(SLUG);
      if (rows.length > 0) athletes = rows.map(a => ({ name: a.name, event: a.event }));
    } catch { /* keep undefined */ }

    try {
      const rows = await getSponsors(SLUG);
      if (rows.length > 0) sponsors = rows.map(s => ({ name: s.name, url: s.url, tier: s.tier }));
    } catch { /* keep undefined */ }

    return NextResponse.json({
      raised, donors, athleteTotals, recentDonations,
      ...(goal       !== undefined && { goal }),
      ...(daysLeft   !== undefined && { daysLeft }),
      ...(schoolName !== undefined && { school_name: schoolName }),
      ...(sportName  !== undefined && { sport_name:  sportName }),
      ...(mascot         !== undefined && { mascot }),
      ...(primaryColor   !== undefined && { primary_color:   primaryColor }),
      ...(secondaryColor !== undefined && { secondary_color: secondaryColor }),
      ...(location       !== undefined && { location }),
      ...(season         !== undefined && { season }),
      ...(logoUrl        !== undefined && { logo_url: logoUrl }),
      ...(athletes       !== undefined && { athletes }),
      ...(sponsors   !== undefined && { sponsors }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load stats";
    console.error("[campaign-stats]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function timeAgo(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60)    return "just now";
  if (sec < 3600)  return `${Math.floor(sec / 60)} minutes ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} hours ago`;
  return `${Math.floor(sec / 86400)} days ago`;
}
