import { getTeamAthletes, getContactCountsByAthlete, getOutreachMap } from "@/lib/teamData";
import { getLinkedAthleteIdsForMember } from "@/lib/familyRelationships";
import { getDonations, getCampaignSettings } from "@/lib/supabase";
import { resolveTeamLogoUrl } from "@/lib/shareCopy";
import { getOrganizationAddress } from "@/lib/teamOverview.server";
import { isSeasonCompleted } from "@/lib/seasonState";
import { attributeDonationsToAthletes } from "@/lib/donationAttribution";
import { requireTeamMembership } from "@/lib/permissions.server";
import { isHeadCoach } from "@/lib/permissions";
import { getPendingRequestCount } from "@/lib/platform/athleteRequests";
import TeamView from "./TeamView";
import TeamTabs from "./TeamTabs";
import RosterTabs from "./RosterTabs";
import OverviewView from "./OverviewView";
import TeamStaffRosterView from "./TeamStaffRosterView";
import TodoListView from "./TodoListView";
import { takeAttendanceHref } from "./takeAttendance";
import { canPreviewSeason, isSeasonPreviewEnabled } from "@/lib/seasonPreview";
import CompleteSeasonEntry from "./complete-season/CompleteSeasonEntry";
import { ActiveSeasonOnly } from "../_components/SeasonStatus";

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

  // Which athlete(s) this actor may open from the roster — used by
  // AthleteRosterGrid to suppress the click affordance for rows a parent/
  // athlete isn't authorized to view (canViewAthleteProfile is the real
  // server-side boundary enforced on the destination page itself; this is
  // only what drives the UI, computed the same way).
  const linkedAthleteIds = actor.kind === "member" && actor.session.role === "parent"
    ? await getLinkedAthleteIdsForMember(actor.session.id, actor.session.athlete_id)
    : [];

  // D3 — desktop roster table data. All three helpers already exist and
  // are already used elsewhere (Home/Fundraiser) exactly like this; no
  // new query, no new backend work. Fetched unconditionally (like
  // getTeamAthletes itself) rather than gated by role, since the desktop
  // table's own eligibility check (shouldShowDesktopRoster) already
  // decides whether any of this is ever rendered — this just avoids a
  // client-side waterfall for the actors who ARE eligible.
  const [donations, contactCounts, outreachMap, settings] = await Promise.all([
    getDonations(slug),
    getContactCountsByAthlete(slug),
    getOutreachMap(slug),
    getCampaignSettings(slug),
  ]);
  const attribution = attributeDonationsToAthletes(athletes, donations);

  // Phase T6: Overview reads the team's existing identity (same logo
  // precedence as TeamHeader via resolveTeamLogoUrl) plus the new optional
  // banner/about/location columns; the school's address is a read-only
  // fallback for the Location card.
  const orgAddress = await getOrganizationAddress(settings?.organization_id);
  const overview = settings ? (
    <OverviewView
      slug={slug}
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
      orgAddress={orgAddress}
    />
  ) : null;

  // Phase 7: Team Hub — Overview | Roster | Clearance, with Roster split
  // into Athletes | Staff. Phase D3 added a desktop-only roster table
  // alongside the original mobile athlete grid (see TeamView.tsx) — the
  // mobile experience itself (AthleteRosterGrid.tsx) is unchanged.
  // Team Management Phase 2: the Clearance tab is now the To-Do List
  // (tasks + the unchanged Clearance resources as "Resources").
  return (
    <TeamTabs
      actor={actor}
      overview={overview}
      roster={
        <RosterTabs
          actor={actor}
          athletes={
            <TeamView
              slug={slug}
              initialAthletes={athletes}
              actor={actor}
              pendingRequestCount={pendingRequestCount}
              attribution={attribution}
              contactCounts={contactCounts}
              outreachMap={outreachMap}
              linkedAthleteIds={linkedAthleteIds}
              attendanceHref={takeAttendanceHref(slug, actor)}
            />
          }
          staff={<TeamStaffRosterView slug={slug} />}
        />
      }
      clearance={
        <>
          <TodoListView slug={slug} />
          {/* Complete Season Phase 3: preview entry for the Head Coach /
              platform admin, behind COMPLETE_SEASON_PREVIEW (off by default).
              Phase 4: not shown on a season that is already completed. */}
          {isSeasonPreviewEnabled() && canPreviewSeason(actor) && (
            <ActiveSeasonOnly><CompleteSeasonEntry slug={slug} /></ActiveSeasonOnly>
          )}
        </>
      }
    />
  );
}
