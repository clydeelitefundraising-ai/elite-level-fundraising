import { redirect, notFound } from "next/navigation";
import { getTeamActor, isStaff, isHeadCoach } from "@/lib/permissions.server";
import { getAthleteById, getTeamAthletes } from "@/lib/teamData";
import { getDonations, getCampaignSettings } from "@/lib/supabase";
import CoachAthleteView from "./CoachAthleteView";

export const dynamic = "force-dynamic";

const DEFAULT_GOAL_CENTS = 50_000;

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

type MemberRow = {
  id: string;
  name: string;
  role: string;
  athlete_id: string | null;
  campaign_slug: string;
};

async function getAthleteMembers(slug: string, athleteId: string): Promise<MemberRow[]> {
  const res = await fetch(
    `${BASE}/rest/v1/team_members?campaign_slug=eq.${encodeURIComponent(slug)}&athlete_id=eq.${encodeURIComponent(athleteId)}&select=id,name,role,athlete_id,campaign_slug`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return [];
  return res.json();
}

export default async function CoachAthletePage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;

  const [actor, athlete, settings] = await Promise.all([
    getTeamActor(slug),
    getAthleteById(id),
    getCampaignSettings(slug),
  ]);

  if (!isStaff(actor)) redirect(`/team/${slug}/athlete/${id}`);
  if (!athlete || athlete.campaign_slug !== slug) notFound();

  const [athletes, donations, members] = await Promise.all([
    getTeamAthletes(slug),
    getDonations(slug),
    getAthleteMembers(slug, id),
  ]);

  // Fundraising stats (same logic as athlete/[id]/page.tsx)
  const nameToId: Record<string, string> = {};
  for (const a of athletes) nameToId[a.name] = a.id;

  const totals: Record<string, number> = Object.fromEntries(athletes.map(a => [a.id, 0]));
  for (const d of donations) {
    if (d.athlete_id && totals[d.athlete_id] !== undefined) {
      totals[d.athlete_id] += d.amount_cents;
    } else if (!d.athlete_id && d.athlete_name) {
      const aid = nameToId[d.athlete_name];
      if (aid) totals[aid] = (totals[aid] ?? 0) + d.amount_cents;
    }
  }

  const raisedCents = totals[id] ?? 0;
  const donorCount = donations.filter(d =>
    d.athlete_id === id || (!d.athlete_id && d.athlete_name === athlete.name),
  ).length;

  const ranked = Object.entries(totals).sort(([, a], [, b]) => b - a);
  const rankIdx = ranked.findIndex(([aid]) => aid === id);
  const rank = rankIdx >= 0 ? rankIdx + 1 : athletes.length;

  const goalCents = athlete.goal_cents ?? settings?.default_athlete_goal_cents ?? DEFAULT_GOAL_CENTS;
  const primaryColor = settings?.primary_color ?? "#0b1e3d";

  return (
    <CoachAthleteView
      slug={slug}
      athlete={athlete}
      members={members}
      raisedCents={raisedCents}
      goalCents={goalCents}
      donorCount={donorCount}
      rank={rank}
      totalAthletes={athletes.length}
      primaryColor={primaryColor}
      canDelete={isHeadCoach(actor)}
    />
  );
}
