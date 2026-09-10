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
