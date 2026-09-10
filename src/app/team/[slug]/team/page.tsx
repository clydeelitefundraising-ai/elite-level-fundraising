import { getTeamAthletes, getLinkedAthleteIds } from "@/lib/teamData";
import { requireTeamMembership } from "@/lib/permissions.server";
import { isHeadCoach } from "@/lib/permissions";
import { getPendingRequestCount } from "@/lib/platform/athleteRequests";
import TeamView from "./TeamView";
import TeamTabs from "./TeamTabs";
import RosterTabs from "./RosterTabs";
import OverviewView from "./OverviewView";
import TeamStaffRosterView from "./TeamStaffRosterView";
import ClearanceView from "./ClearanceView";

export default async function TeamPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // Not a public-facing route — gate it to logged-in members of this team.
  const actor = await requireTeamMembership(slug);
  const athletes = await getTeamAthletes(slug);
  // Head-Coach-only — matches layout.tsx's/AthleteRequestsPanel's own
  // gating; same canonical count function reused everywhere (Phase 3B-1).
  const pendingRequestCount = isHeadCoach(actor) ? await getPendingRequestCount(slug) : 0;

  // Which athlete(s) this actor may open from the roster card grid — used
  // by TeamView to suppress the click affordance for rows a parent/athlete
  // isn't authorized to view (canAccessAthleteProfile is the real
  // server-side boundary enforced on the destination page itself; this is
  // only what drives the UI, computed the same way).
  const linkedAthleteIds = actor.kind === "member" && actor.session.role === "parent"
    ? await getLinkedAthleteIds(actor.session.id, actor.session.athlete_id)
    : [];

  // Phase 7: Team Hub — Overview | Roster | Clearance, with Roster split
  // into Athletes | Staff. The pre-existing athlete roster experience
  // (TeamView) is unchanged and unmodified, now nested as Roster's
  // "Athletes" section.
  return (
    <TeamTabs
      overview={<OverviewView />}
      roster={
        <RosterTabs
          athletes={
            <TeamView
              slug={slug}
              initialAthletes={athletes}
              actor={actor}
              pendingRequestCount={pendingRequestCount}
              linkedAthleteIds={linkedAthleteIds}
            />
          }
          staff={<TeamStaffRosterView slug={slug} />}
        />
      }
      clearance={<ClearanceView slug={slug} />}
    />
  );
}
