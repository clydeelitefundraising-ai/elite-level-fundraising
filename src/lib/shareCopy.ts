// Shared "Share Fundraiser" copy builder — reused by every share entry
// point (athlete's own Fundraiser tab, the internal athlete profile, the
// public campaign page) so the wording is defined once. Always builds from
// real campaign data (athlete first name + school + sport); never a
// hardcoded example.
export function buildShareText(athleteFirstName: string, schoolName: string, sportName: string): string {
  const team = [schoolName, sportName].filter(Boolean).join(" ");
  return team
    ? `Support ${athleteFirstName} and ${team} this season! Every donation helps the team.`
    : `Support ${athleteFirstName} this season! Every donation helps.`;
}

// Public donor-facing campaign URL for an athlete — the ONLY link that
// should ever be shared externally (SMS, Messages, Instagram, etc.).
// /team/[slug]/athlete/[id] is the internal, authenticated member profile
// and must never be shared with donors.
export function buildAthleteShareUrl(origin: string, slug: string, athleteId: string): string {
  return `${origin}/campaign/${slug}?athlete=${athleteId}`;
}

// Open Graph / Twitter title+description for the public campaign page —
// used by campaign/[slug]/page.tsx's generateMetadata. Pure so it's unit
// testable without mocking Next's metadata resolution. teamLabel is
// pre-joined (school + mascot + sport) since callers already build it.
export function buildCampaignMetadata(input: {
  athleteName: string | null;
  teamLabel: string;
  schoolName: string;
  sportName: string;
}): { title: string; description: string } {
  const { athleteName, teamLabel, schoolName, sportName } = input;
  if (athleteName) {
    return {
      title: `Support ${athleteName} — ${teamLabel || "Elite Level Fundraising"}`,
      description: buildShareText(athleteName.split(" ")[0], schoolName, sportName),
    };
  }
  return {
    title: `Support ${teamLabel || "Our Team"} | Elite Level Fundraising`,
    description: `Support ${teamLabel || "our team"} this season! Every donation helps the team.`,
  };
}

// Resolves the team's own logo image, if one is configured — the exact
// same precedence TeamHeader.tsx / DesktopSidebar.tsx already use to
// render the team logo in the Team App header (team_photo, the
// Platform-Admin-set per-campaign photo, overrides logo_url, the
// coach-uploaded one). Used by /api/og so a fundraiser share-link preview
// shows the same team identity as the header — never a second,
// independently-configured logo, and never an ELF logo standing in for it.
// null (both team_photo and logo_url unset) means the caller should fall
// back to the same initials-badge treatment the header falls back to.
export function resolveTeamLogoUrl(
  settings: { team_photo?: string | null; logo_url?: string | null } | null | undefined,
): string | null {
  return settings?.team_photo || settings?.logo_url || null;
}
