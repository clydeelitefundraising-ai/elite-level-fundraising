import { redirect, notFound } from "next/navigation";
import { getTeamActor, isStaff, isHeadCoach } from "@/lib/permissions.server";
import { getAthleteById, getTeamAthletes } from "@/lib/teamData";
import { getDonations, getCampaignSettings } from "@/lib/supabase";
import { isAthleteFundraisingVisible } from "@/lib/fundraiserAccess";
import { getAthleteLinkedMembers } from "@/lib/athleteLinkedMembers";
import { taskViewerFor } from "@/lib/teamTasks";
import { canViewCompletion } from "@/lib/teamTaskCompletion";
import { canViewAthleteAttendance, type AthleteAttendanceState } from "@/lib/athleteAttendance";
import { getAthleteAbsences } from "@/lib/teamAttendanceStore";
import CoachAthleteView from "./CoachAthleteView";

export const dynamic = "force-dynamic";

const DEFAULT_GOAL_CENTS = 50_000;

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

  // Attendance section: Head/Assistant Coaches and platform admins only on
  // this staff page — boosters keep the rest of the profile but not this.
  const showAttendance = canViewAthleteAttendance(actor, athlete.id, []);

  const [athletes, donations, members, absences] = await Promise.all([
    getTeamAthletes(slug),
    getDonations(slug),
    // Legacy athlete_id links AND team_member_athletes (second/later
    // children), merged; a failed read is shown as such, not as "none".
    getAthleteLinkedMembers(slug, athlete.id),
    showAttendance ? getAthleteAbsences(slug, athlete.id) : Promise.resolve(null),
  ]);
  const attendance: AthleteAttendanceState | null = absences === null ? null
    : absences.ok ? { ok: true, summary: absences.value } : { ok: false };

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

  // Phase 1.2 — single shared source of truth (see fundraiserAccess.ts);
  // no second definition of "active" introduced here.
  const fundraisingActive = isAthleteFundraisingVisible(settings);

  return (
    <CoachAthleteView
      slug={slug}
      athlete={athlete}
      members={members.ok ? members.members : []}
      membersUnavailable={!members.ok}
      fundraisingActive={fundraisingActive}
      raisedCents={raisedCents}
      goalCents={goalCents}
      donorCount={donorCount}
      rank={rank}
      totalAthletes={athletes.length}
      primaryColor={primaryColor}
      canDelete={isHeadCoach(actor)}
      // Phase 3C-2: To-Do completion is for Head/Assistant Coaches and
      // platform admins only — never boosters, who can open this page.
      // The completion API enforces the same rule on the server.
      showTaskCompletion={canViewCompletion(taskViewerFor(actor))}
      attendance={attendance}
    />
  );
}
