import { getTeamAthletes, getContactCountsByAthlete, getOutreachMap } from "@/lib/teamData";
import { getDonations } from "@/lib/supabase";
import { attributeDonationsToAthletes } from "@/lib/donationAttribution";
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

  // D3 — desktop roster table data. All three helpers already exist and
  // are already used elsewhere (Home/Fundraiser) exactly like this; no
  // new query, no new backend work. Fetched unconditionally (like
  // getTeamAthletes itself) rather than gated by role, since the desktop
  // table's own eligibility check (shouldShowDesktopRoster) already
  // decides whether any of this is ever rendered — this just avoids a
  // client-side waterfall for the actors who ARE eligible.
  const [donations, contactCounts, outreachMap] = await Promise.all([
    getDonations(slug),
    getContactCountsByAthlete(slug),
    getOutreachMap(slug),
  ]);
  const attribution = attributeDonationsToAthletes(athletes, donations);

  // Phase 7: Team Hub — Overview | Roster | Clearance, with Roster split
  // into Athletes | Staff. Phase D3 added a desktop-only roster table
  // alongside the original mobile athlete grid (see TeamView.tsx) — the
  // mobile experience itself (AthleteRosterGrid.tsx) is unchanged.
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
              attribution={attribution}
              contactCounts={contactCounts}
              outreachMap={outreachMap}
            />
          }
          staff={<TeamStaffRosterView slug={slug} />}
        />
      }
      clearance={<ClearanceView slug={slug} />}
    />
  );
}
