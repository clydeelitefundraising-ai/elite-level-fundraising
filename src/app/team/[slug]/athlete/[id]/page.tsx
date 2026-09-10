import { notFound } from "next/navigation";
import { getDonations, getCampaignSettings } from "@/lib/supabase";
import { getAthleteById, getTeamAthletes } from "@/lib/teamData";
import { requireTeamMembership, canAccessAthleteProfile } from "@/lib/permissions.server";
import AthleteProfileView from "./AthleteProfileView";

export const dynamic = "force-dynamic";

const DEFAULT_ATHLETE_GOAL_CENTS = 50_000; // $500

// This is the internal, member-facing athlete profile (fundraising detail,
// donor list, etc.) — NOT the public donor/share page, which is
// /campaign/[slug]?athlete=[id] and intentionally stays unauthenticated.
// Access here is restricted to staff, the athlete themself, or a parent
// linked to this athlete — see canAccessAthleteProfile() for the exact
// rule. Hiding the roster's click affordance for unauthorized rows
// (TeamView.tsx) is a UX nicety only; this check is the real boundary.
export default async function AthleteProfilePage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;

  const actor = await requireTeamMembership(slug);
  if (!(await canAccessAthleteProfile(actor, id))) notFound();

  const [athlete, athletes, donations, settings] = await Promise.all([
    getAthleteById(id),
    getTeamAthletes(slug),
    getDonations(slug),
    getCampaignSettings(slug),
  ]);

  if (!athlete || athlete.campaign_slug !== slug) notFound();

  // Assign each donation to an athlete:
  // - new donations: matched by athlete_id
  // - old donations (no athlete_id): matched by athlete_name → roster id
  const nameToId: Record<string, string> = {};
  for (const a of athletes) nameToId[a.name] = a.id;

  // Per-roster-athlete totals keyed by athlete.id
  const totals: Record<string, number> = Object.fromEntries(athletes.map(a => [a.id, 0]));
  let teamRaisedCents = 0;

  for (const d of donations) {
    teamRaisedCents += d.amount_cents;
    if (d.athlete_id && totals[d.athlete_id] !== undefined) {
      totals[d.athlete_id] += d.amount_cents;
    } else if (!d.athlete_id && d.athlete_name) {
      const aid = nameToId[d.athlete_name];
      if (aid) totals[aid] = (totals[aid] ?? 0) + d.amount_cents;
    }
  }

  const athleteRaisedCents = totals[id] ?? 0;

  // Count donors attributed to this athlete (same id-first logic)
  const donorCount = donations.filter(d =>
    d.athlete_id === id || (!d.athlete_id && d.athlete_name === athlete.name),
  ).length;

  // Rank among all roster athletes (including those with $0), 1-indexed
  const ranked = Object.entries(totals)
    .sort(([, a], [, b]) => b - a);
  const rankIdx = ranked.findIndex(([aid]) => aid === id);
  const rank = rankIdx >= 0 ? rankIdx + 1 : athletes.length;

  const goalCents = athlete.goal_cents ?? settings?.default_athlete_goal_cents ?? DEFAULT_ATHLETE_GOAL_CENTS;

  const topSupporterDonation = donations
    .filter(d => d.athlete_id === id || (!d.athlete_id && d.athlete_name === athlete.name))
    .sort((a, b) => b.amount_cents - a.amount_cents)[0] ?? null;
  const topSupporter = topSupporterDonation
    ? { name: topSupporterDonation.donor_name, amount_cents: topSupporterDonation.amount_cents }
    : null;

  return (
    <AthleteProfileView
      slug={slug}
      athlete={athlete}
      athleteId={id}
      settings={settings}
      athleteRaisedCents={athleteRaisedCents}
      teamRaisedCents={teamRaisedCents}
      goalCents={goalCents}
      rank={rank}
      totalAthletes={athletes.length}
      donorCount={donorCount}
      topSupporter={topSupporter}
    />
  );
}
