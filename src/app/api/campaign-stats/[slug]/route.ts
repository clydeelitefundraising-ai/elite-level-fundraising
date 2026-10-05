import { NextResponse } from "next/server";
import { getDonations, getCampaignSettings, getAthletes, getSponsors, getFundUses } from "@/lib/supabase";
import type { CampaignSettings } from "@/lib/supabase";
import { getDisplayGoalCents } from "@/lib/platform/donations";
import { resolveTeamLogoUrl } from "@/lib/shareCopy";
import { getActiveCoachFundraisers, getCoachTotals } from "@/lib/platform/coachFundraising";
import { resolvePublicCampaignState } from "@/lib/fundraiserAccess";

export const dynamic = "force-dynamic";

// Phase F1c — the minimum public payload needed to render the existing
// "campaign ended" (archived) or "Fundraising hasn't started yet"
// (fundraising_enabled=false) branded states in CampaignPageClient.tsx.
// Both of those branches only ever read school_name/sport_name/season (plus
// the ElfMark static brand logo, not team branding) — never donations,
// leaderboard, athlete totals, sponsor data, or fund-use copy — so none of
// that is fetched or returned here. `raised`/`donors`/`athleteTotals`/
// `recentDonations` are still present (zeroed/empty) because
// CampaignPageClient's fetch handler requires `typeof data.raised ===
// "number"` before it processes the response at all; omitting them would
// make the response silently ignored and leave the client's state at its
// stale/default values instead of rendering the inactive state.
function buildInactiveCampaignStatsPayload(settings: CampaignSettings) {
  return {
    raised:          0,
    donors:          0,
    athleteTotals:   {},
    recentDonations: [],
    school_name:     settings.school_name,
    sport_name:      settings.sport_name,
    season:          settings.season,
    archived:        settings.archived ?? false,
    fundraising_enabled: settings.fundraising_enabled ?? true,
    allow_coach_fundraising: false,
  };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  try {
    // Phase F1c — campaign state is resolved FIRST, before any donation/
    // athlete/sponsor/fund-use/coach-fundraising query, so an archived or
    // not-yet-active campaign triggers none of that work (data
    // minimization + query reduction). A missing settings row falls
    // through to the existing full-fetch path unchanged — this route has
    // never validated campaign existence beyond "if settings exist, use
    // them," and F1c isn't scoped to change that.
    const settingsForState = await getCampaignSettings(slug);
    if (settingsForState && resolvePublicCampaignState(settingsForState) !== "live") {
      return NextResponse.json(buildInactiveCampaignStatsPayload(settingsForState));
    }

    const donations = await getDonations(slug);

    const raisedCents = donations.reduce((sum, d) => sum + d.amount_cents, 0);
    const raised = raisedCents / 100;
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
    let displayGoal: number | undefined;
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
    let description: string | undefined;
    let archived: boolean | undefined;
    let fundraisingEnabled: boolean | undefined;
    let layoutVariant: "classic" | "premium" | undefined;
    let visibility: Record<string, boolean> | undefined;
    let athletes: { id: string; name: string; event: string | null; class_year: string | null }[] | undefined;
    let sponsors: { name: string; url: string; tier: string; logo_url: string | null; description: string | null }[] | undefined;
    let fundUses: { icon: string; title: string; description: string }[] | undefined;
    let coaches: { id: string; name: string; role: "head_coach" | "assistant_coach"; raised: number; goal_cents: number | null }[] | undefined;
    let allowCoachFundraising = false;

    try {
      // Phase F1c: reuse the row already fetched above to resolve the
      // campaign state — never re-fetch it. At this point it's either
      // null (invalid/missing campaign, unchanged pre-F1c behavior) or a
      // "live" (not archived, fundraising_enabled) row, since anything
      // else already returned the minimal payload above.
      const settings = settingsForState;
      if (settings) {
        goal = settings.goal_cents / 100;
        // Phase 3D: additive, fundraising-facing-only field — derived
        // from the same base goal_cents, never written back to it.
        displayGoal = getDisplayGoalCents(settings.goal_cents, raisedCents) / 100;
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
        // Same team_photo-over-logo_url precedence as TeamHeader.tsx's
        // header logo and the OG-image share preview (resolveTeamLogoUrl)
        // — one authoritative team-logo source across the whole app.
        const resolvedLogo = resolveTeamLogoUrl(settings);
        if (resolvedLogo)             logoUrl        = resolvedLogo;
        if (settings.description)     description    = settings.description;
        archived = settings.archived ?? false;
        // Phase F1b: orthogonal to `archived` (that one takes precedence —
        // see CampaignPageClient.tsx's rendering order). Defaults to true
        // for a campaign that predates the F1a column (matching the F1a
        // backfill, which set every pre-existing row to true), so an
        // older campaign row shape never regresses to the new "not
        // started" empty state.
        fundraisingEnabled = settings.fundraising_enabled ?? true;
        allowCoachFundraising = settings.allow_coach_fundraising ?? false;
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
      // id is exposed (Phase 3A-1 share-path fix) so the public campaign
      // page's athlete selector can be preselected via a stable id, not a
      // free-text name — /api/checkout independently re-validates it.
      if (rows.length > 0) athletes = rows.map(a => ({ id: a.id, name: a.name, event: a.event, class_year: a.class_year ?? null }));
    } catch { /* keep undefined */ }

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

    // Coach fundraising participation — only ever populated when the
    // campaign has explicitly opted in (allow_coach_fundraising=true);
    // getActiveCoachFundraisers itself re-checks that flag, never
    // inferring participation solely from row existence.
    if (allowCoachFundraising) {
      try {
        const [participants, coachTotals] = await Promise.all([
          getActiveCoachFundraisers(slug),
          getCoachTotals(slug),
        ]);
        if (participants.length > 0) {
          coaches = participants.map(p => ({
            id: p.coach_id,
            name: p.name,
            role: p.role as "head_coach" | "assistant_coach",
            raised: (coachTotals[p.coach_id] ?? 0) / 100,
            goal_cents: p.goal_cents,
          }));
        }
      } catch { /* keep undefined */ }
    }

    return NextResponse.json({
      raised, donors, athleteTotals, recentDonations,
      ...(goal           !== undefined && { goal }),
      ...(displayGoal    !== undefined && { displayGoal }),
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
      ...(description    !== undefined && { description }),
      ...(athletes       !== undefined && { athletes }),
      ...(sponsors       !== undefined && { sponsors }),
      ...(archived       !== undefined && { archived }),
      ...(fundraisingEnabled !== undefined && { fundraising_enabled: fundraisingEnabled }),
      ...(layoutVariant  !== undefined && { layout_variant: layoutVariant }),
      ...(visibility     !== undefined && visibility),
      ...(fundUses    !== undefined && { fund_uses: fundUses }),
      ...(coaches     !== undefined && { coaches }),
      allow_coach_fundraising: allowCoachFundraising,
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
