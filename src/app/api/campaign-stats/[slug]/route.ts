import { NextResponse } from "next/server";
import { getDonations, getCampaignSettings, getAthletes, getSponsors, getFundUses } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  try {
    const donations = await getDonations(slug);

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

    let goal: number | undefined;
    let daysLeft: number | undefined;
    let schoolName: string | undefined;
    let sportName: string | undefined;
    let mascot: string | undefined;
    let primaryColor: string | undefined;
    let secondaryColor: string | undefined;
    let themePrimaryColor: string | undefined;
    let themeSecondaryColor: string | undefined;
    let themeAccentColor: string | undefined;
    let themeButtonColor: string | undefined;
    let location: string | undefined;
    let season: string | undefined;
    let logoUrl: string | undefined;
    let archived: boolean | undefined;
    let layoutVariant: "classic" | "premium" | undefined;
    let visibility: Record<string, boolean> | undefined;
    // Always a real array (never omitted, never undefined) — an empty
    // roster is real data, not something for the client to paper over
    // with placeholder athletes.
    let athletes: { id: string; name: string; event: string | null; class_year: string | null }[] = [];
    let sponsors: { name: string; url: string; tier: string; logo_url: string | null; description: string | null }[] | undefined;
    let fundUses: { icon: string; title: string; description: string }[] | undefined;

    try {
      const settings = await getCampaignSettings(slug);
      if (settings) {
        goal = settings.goal_cents / 100;
        const deadline = new Date(settings.deadline);
        daysLeft = Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / 86400000));
        if (settings.school_name)     schoolName     = settings.school_name;
        if (settings.sport_name)      sportName      = settings.sport_name;
        if (settings.mascot)          mascot         = settings.mascot;
        if (settings.primary_color)   primaryColor   = settings.primary_color;
        if (settings.secondary_color) secondaryColor = settings.secondary_color;
        // Campaign theme colors fall back to team colors when never
        // configured — every existing campaign renders identically.
        themePrimaryColor   = settings.theme_primary_color   || settings.primary_color;
        themeSecondaryColor = settings.theme_secondary_color || settings.secondary_color;
        themeAccentColor    = settings.theme_accent_color    || themeSecondaryColor;
        themeButtonColor    = settings.theme_button_color    || themePrimaryColor;
        if (settings.location)        location       = settings.location;
        if (settings.season)          season         = settings.season;
        if (settings.logo_url)        logoUrl        = settings.logo_url;
        archived = settings.archived ?? false;
        layoutVariant = settings.layout_variant ?? "classic";
        visibility = {
          show_leaderboard:      settings.show_leaderboard      ?? true,
          show_program_identity: settings.show_program_identity ?? true,
          show_share_section:    settings.show_share_section    ?? true,
          show_fund_uses:        settings.show_fund_uses        ?? true,
          show_recent_donations: settings.show_recent_donations ?? true,
          show_sponsors:         settings.show_sponsors         ?? true,
          show_donation_card:    settings.show_donation_card    ?? true,
        };
      }
    } catch { /* keep undefined — settings may not exist yet */ }

    try {
      const rows = await getAthletes(slug);
      athletes = rows.map(a => ({ id: a.id, name: a.name, event: a.event, class_year: a.class_year ?? null }));
    } catch { /* keep [] — a fetch failure is still "no athletes to show", not undefined */ }

    try {
      const rows = await getSponsors(slug);
      if (rows.length > 0) sponsors = rows.map(s => ({
        name:        s.name,
        url:         s.url,
        tier:        s.tier,
        logo_url:    s.logo_url    ?? null,
        description: s.description ?? null,
      }));
    } catch { /* keep undefined */ }

    try {
      const rows = await getFundUses(slug);
      if (rows.length > 0) fundUses = rows.map(f => ({ icon: f.icon, title: f.title, description: f.description }));
    } catch { /* keep undefined */ }

    return NextResponse.json({
      raised, donors, athleteTotals, recentDonations,
      ...(goal           !== undefined && { goal }),
      ...(daysLeft       !== undefined && { daysLeft }),
      ...(schoolName     !== undefined && { school_name:     schoolName }),
      ...(sportName      !== undefined && { sport_name:      sportName }),
      ...(mascot         !== undefined && { mascot }),
      ...(primaryColor   !== undefined && { primary_color:   primaryColor }),
      ...(secondaryColor !== undefined && { secondary_color: secondaryColor }),
      ...(themePrimaryColor   !== undefined && { theme_primary_color:   themePrimaryColor }),
      ...(themeSecondaryColor !== undefined && { theme_secondary_color: themeSecondaryColor }),
      ...(themeAccentColor    !== undefined && { theme_accent_color:    themeAccentColor }),
      ...(themeButtonColor    !== undefined && { theme_button_color:    themeButtonColor }),
      ...(location       !== undefined && { location }),
      ...(season         !== undefined && { season }),
      ...(logoUrl        !== undefined && { logo_url:        logoUrl }),
      athletes,
      ...(sponsors       !== undefined && { sponsors }),
      ...(archived       !== undefined && { archived }),
      ...(layoutVariant  !== undefined && { layout_variant: layoutVariant }),
      ...(visibility     !== undefined && visibility),
      ...(fundUses    !== undefined && { fund_uses: fundUses }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load stats";
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
