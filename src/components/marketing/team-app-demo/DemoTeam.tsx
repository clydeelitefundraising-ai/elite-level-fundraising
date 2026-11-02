"use client";

import type { TeamActor } from "@/lib/permissions";
import { isHeadCoach, isStaff } from "@/lib/permissions";
import { canViewAthleteAttendance } from "@/lib/athleteAttendance";
import { canViewAthleteProfile } from "@/lib/athleteAccess";
import { isAthleteFundraisingVisible } from "@/lib/fundraiserAccess";
import { resolveTeamLogoUrl } from "@/lib/shareCopy";
import { isSeasonCompleted } from "@/lib/seasonState";
import { taskViewerFor } from "@/lib/teamTasks";
import { canViewCompletion, profileCompletionSource } from "@/lib/teamTaskCompletion";
import type { AthleteRosterState } from "@/app/team/[slug]/team/useAthleteRoster";
import { takeAttendanceHref } from "@/app/team/[slug]/team/takeAttendance";
import TeamTabs from "./DemoTeamTabs";
import RosterTabs from "./DemoRosterTabs";
import AthleteRosterGrid from "./DemoAthleteRosterGrid";
import OverviewView from "./DemoOverviewView";
import TeamStaffRosterView from "./DemoTeamStaffRosterView";
import TodoListView from "./DemoTodoListView";
import CoachAthleteView from "./DemoCoachAthleteView";
import AthleteProfileView from "./DemoAthleteProfileView";
import { DEMO_SLUG, JORDAN_ELLIS_ID } from "./demoData";
import { demoAthleteAttendance, type DemoAttendanceDb } from "./attendanceData";
import { demoLinkedMembers, type DemoDb } from "./demoApi";

// The Team tab — Overview / Roster (Athletes, Staff) / To-Do List — and
// both athlete profiles, composed exactly as team/page.tsx,
// team/[id]/page.tsx and athlete/[id]/page.tsx compose them, with the
// demo's records in place of the database reads:
//
//   generated twins  TeamTabs, RosterTabs, AthleteRosterGrid,
//                    TakeAttendanceLink, OverviewView, TeamStaffRosterView,
//                    TodoListView (+ its task, Resources and completion
//                    views), CoachAthleteView, AthleteProfileView — real
//                    files with only their imports rewritten; their API
//                    calls are answered by the demo (demoApi.ts)
//   reused as-is     AthleteAttendanceCard, takeAttendanceHref, the
//                    permission / access / completion helpers
//
// Roles follow the app: staff see Take Attendance (coaches only, via
// takeAttendanceHref → canViewAttendance), Add Athlete and edit controls;
// an athlete sees "My Profile" and a parent "My Athletes" pinned above the
// roster and can open only that profile; only the Head Coach edits the
// Overview, manages tasks and sees the Booster toggle.

type Notify = (message?: string) => void;

/** Athletes a parent is linked to (team/page.tsx's getLinkedAthleteIdsForMember). */
export function demoLinkedAthleteIds(actor: TeamActor): string[] {
  return actor.kind === "member" && actor.session.role === "parent" ? [JORDAN_ELLIS_ID] : [];
}

export default function DemoTeam({ actor, db, notify }: { actor: TeamActor; db: DemoDb; notify: Notify }) {
  const staffMode = isStaff(actor);
  const previewOnly = () => notify("Preview only — editing the roster isn't part of this demo.");
  const roster = {
    staffMode, canEdit: staffMode, canDelete: isHeadCoach(actor), seasonReadOnly: false,
    athletes: db.athletes,
    openAdd: previewOnly, openEdit: previewOnly, handleDelete: async () => previewOnly(),
  } as unknown as AthleteRosterState;
  const { settings } = db;

  return (
    <TeamTabs
      actor={actor}
      overview={
        <OverviewView
          slug={DEMO_SLUG}
          canEdit={isHeadCoach(actor) && !isSeasonCompleted(settings)}
          team={{
            school_name:     settings.school_name ?? "",
            sport_name:      settings.sport_name ?? "",
            season:          settings.season ?? "",
            logo_url:        resolveTeamLogoUrl(settings),
            team_banner_url: settings.team_banner_url ?? null,
            team_about:      settings.team_about ?? null,
            location:        settings.location ?? "",
            location_street: settings.location_street ?? null,
            location_zip:    settings.location_zip ?? null,
          }}
          orgAddress={null}
        />
      }
      roster={
        <RosterTabs
          actor={actor}
          athletes={
            <AthleteRosterGrid
              slug={DEMO_SLUG}
              roster={roster}
              actor={actor}
              pendingRequestCount={0}
              linkedAthleteIds={demoLinkedAthleteIds(actor)}
              attendanceHref={takeAttendanceHref(DEMO_SLUG, actor)}
            />
          }
          staff={<TeamStaffRosterView slug={DEMO_SLUG} />}
        />
      }
      clearance={<TodoListView slug={DEMO_SLUG} />}
    />
  );
}

/** Per-athlete totals, donor count and rank — the same arithmetic both
 *  profile pages do inline (id first, legacy name fallback). */
function athleteFundraising(db: DemoDb, athleteId: string) {
  const athlete = db.athletes.find(a => a.id === athleteId)!;
  const nameToId: Record<string, string> = {};
  for (const a of db.athletes) nameToId[a.name] = a.id;
  const totals: Record<string, number> = Object.fromEntries(db.athletes.map(a => [a.id, 0]));
  let teamRaisedCents = 0;
  for (const d of db.donations) {
    teamRaisedCents += d.amount_cents;
    if (d.athlete_id && totals[d.athlete_id] !== undefined) {
      totals[d.athlete_id] += d.amount_cents;
    } else if (!d.athlete_id && d.athlete_name) {
      const aid = nameToId[d.athlete_name];
      if (aid) totals[aid] = (totals[aid] ?? 0) + d.amount_cents;
    }
  }
  const mine = db.donations.filter(d => d.athlete_id === athleteId || (!d.athlete_id && d.athlete_name === athlete.name));
  const ranked = Object.entries(totals).sort(([, a], [, b]) => b - a);
  const rankIdx = ranked.findIndex(([aid]) => aid === athleteId);
  const top = [...mine].sort((a, b) => b.amount_cents - a.amount_cents)[0] ?? null;
  return {
    athlete,
    raisedCents: totals[athleteId] ?? 0,
    teamRaisedCents,
    donorCount: mine.length,
    rank: rankIdx >= 0 ? rankIdx + 1 : db.athletes.length,
    goalCents: athlete.goal_cents ?? db.settings.default_athlete_goal_cents ?? 50_000,
    topSupporter: top ? { name: top.donor_name, amount_cents: top.amount_cents } : null,
  };
}

/** team/[id] — the coach's view of an athlete (staff only; others are sent
 *  to the member profile, like the page's redirect). */
export function DemoCoachAthleteProfile({ actor, athleteId, db, attendanceDb }: { actor: TeamActor; athleteId: string; db: DemoDb; attendanceDb: DemoAttendanceDb }) {
  if (!isStaff(actor)) return <DemoMemberAthleteProfile actor={actor} athleteId={athleteId} db={db} attendanceDb={attendanceDb} />;
  if (!db.athletes.some(a => a.id === athleteId)) return null;
  const f = athleteFundraising(db, athleteId);
  const attendance = canViewAthleteAttendance(actor, athleteId, []) ? demoAthleteAttendance(attendanceDb, athleteId) : null;
  return (
    <CoachAthleteView
      slug={DEMO_SLUG}
      athlete={f.athlete}
      members={demoLinkedMembers(athleteId)}
      membersUnavailable={false}
      fundraisingActive={isAthleteFundraisingVisible(db.settings)}
      // The demo keeps its Communications → Messages destination (the app
      // resolves the athlete's own conversation server-side).
      messagesHref={`/team/${DEMO_SLUG}/communications?tab=messages`}
      raisedCents={f.raisedCents}
      goalCents={f.goalCents}
      donorCount={f.donorCount}
      rank={f.rank}
      totalAthletes={db.athletes.length}
      primaryColor={db.settings.primary_color ?? "#0b1e3d"}
      canDelete={isHeadCoach(actor)}
      showTaskCompletion={canViewCompletion(taskViewerFor(actor))}
      attendance={attendance}
    />
  );
}

/** athlete/[id] — the athlete's own profile, or a linked parent's view. */
export function DemoMemberAthleteProfile({ actor, athleteId, db, attendanceDb }: { actor: TeamActor; athleteId: string; db: DemoDb; attendanceDb: DemoAttendanceDb }) {
  const linkedAthleteIds = demoLinkedAthleteIds(actor);
  const allowed = canViewAthleteProfile({
    isStaffActor: isStaff(actor),
    memberRole: actor.kind === "member" ? (actor.session.role as "athlete" | "parent" | "booster") : null,
    selfAthleteId: actor.kind === "member" ? actor.session.athlete_id ?? null : null,
    linkedAthleteIds,
    athleteId,
  });
  if (!allowed || !db.athletes.some(a => a.id === athleteId)) return null;
  const f = athleteFundraising(db, athleteId);
  const attendance = canViewAthleteAttendance(actor, athleteId, linkedAthleteIds) ? demoAthleteAttendance(attendanceDb, athleteId) : null;
  return (
    <AthleteProfileView
      slug={DEMO_SLUG}
      athlete={f.athlete}
      athleteId={athleteId}
      settings={db.settings}
      fundraisingActive={isAthleteFundraisingVisible(db.settings)}
      athleteRaisedCents={f.raisedCents}
      teamRaisedCents={f.teamRaisedCents}
      goalCents={f.goalCents}
      rank={f.rank}
      totalAthletes={db.athletes.length}
      donorCount={f.donorCount}
      topSupporter={f.topSupporter}
      taskCompletion={profileCompletionSource(actor.kind, taskViewerFor(actor))}
      attendance={attendance}
    />
  );
}
