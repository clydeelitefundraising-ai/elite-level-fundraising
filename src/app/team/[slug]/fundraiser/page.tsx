import { notFound } from "next/navigation";
import { ArrowUpRight, Users } from "lucide-react";
import { getCampaignSettings, getDonations } from "@/lib/supabase";
import type { CampaignSettings } from "@/lib/supabase";
import { getAthleteById, getTeamAthletes, getOutreachMap, getContactCountsByAthlete } from "@/lib/teamData";
import { getLinkedAthleteIdsForMember } from "@/lib/familyRelationships";
import { getTeamActor } from "@/lib/permissions.server";
import { isStaff } from "@/lib/permissions";
import { resolveFundraiserRouteView } from "@/lib/fundraiserAccess";
import { getDisplayGoalCents } from "@/lib/platform/donations";
import { buildFollowUpRows, buildCoachFollowUpRows } from "@/lib/followUps";
import type { FollowUpRow } from "@/lib/followUps";
import {
  validateCoachForCampaign, getCoachFundraiserById, getCoachTotals, getContactCountsByCoach,
  getActiveCoachFundraisers, getOutreachMapByCoach,
} from "@/lib/platform/coachFundraising";
import { buildCoachShareUrl, buildCoachShareText } from "@/lib/shareCopy";
import CoachShareButton from "./CoachShareButton";
import FundraisingInquiryState from "./FundraisingInquiryState";
import FundraiserView from "./FundraiserView";
import FundraiserTabs from "./FundraiserTabs";
import { CoachDashboard, TeamDashboard } from "./TeamDashboards";
import { FullListView, AthleteRows, DonationRows, DonorRows } from "./DashboardParts";
import {
  DASHBOARD_PREVIEW_COUNT, MEMBER_TEAM_FEED_LIMIT, parseFundraiserListView, fundraiserHref,
  buildLeaderboard, buildTeamFeed, buildTeamStats, buildPace, buildAthleteProgress, buildTopDonors,
} from "./fundraiserData";
import type { FundraiserListView } from "./fundraiserData";
import type { LeaderboardEntry, FeedDonation } from "./FundraiserView";
import { fmt } from "./fundraiserFormat";
import FollowUpsWorkspaceView from "./FollowUpsWorkspaceView";
import styles from "./Fundraiser.module.css";

export const dynamic = "force-dynamic";

// ── Merged Follow-Ups rows (Phase A35) ──────────────────────────────────
// Appends active coach-fundraiser rows to the existing roster-first
// athlete rows. getActiveCoachFundraisers already returns [] when
// allow_coach_fundraising is false (checked internally), so this is
// naturally a no-op on a campaign that hasn't opted in — no redundant
// flag check needed here, but we skip the extra fetches entirely as a
// minor efficiency win when the flag is off.
async function withCoachFollowUpRows(
  slug: string,
  allowCoachFundraising: boolean,
  athleteRows: FollowUpRow[],
): Promise<FollowUpRow[]> {
  if (!allowCoachFundraising) return athleteRows;

  const [participants, coachTotals, coachContactCounts, coachOutreachMap] = await Promise.all([
    getActiveCoachFundraisers(slug),
    getCoachTotals(slug),
    getContactCountsByCoach(slug),
    getOutreachMapByCoach(slug),
  ]);
  // upsertCoachParticipant() already refuses to activate a booster, so
  // this filter should never actually drop anything in practice — kept as
  // a cheap runtime safety net (defense in depth) rather than trusting
  // the type-level role narrowing alone.
  const eligible = participants.filter(
    (p): p is typeof p & { role: "head_coach" | "assistant_coach" } => p.role === "head_coach" || p.role === "assistant_coach",
  );
  if (eligible.length === 0) return athleteRows;

  const coachRows = buildCoachFollowUpRows(
    eligible.map(p => ({ id: p.coach_id, name: p.name, role: p.role })),
    coachTotals,
    coachContactCounts,
    coachOutreachMap,
  );
  return [...athleteRows, ...coachRows];
}

// ── Coach's own personal fundraiser (Phase A35) ────────────────────────────────
// Shown only when THIS coach is an active fundraising participant
// (validateCoachForCampaign) — otherwise simply absent, not an error
// state. A fundraising function attached to the existing coach identity,
// not a separate coach-profile page, so it lives inline in the same
// Overview tab the coach already lands on for the team campaign view.
function MyCoachFundraiserCard({
  slug, raisedCents, goalCents, contactCount, shareUrl, shareTitle, shareText,
}: {
  slug: string;
  raisedCents: number;
  goalCents: number | null;
  contactCount: number;
  shareUrl: string;
  shareTitle: string;
  shareText: string;
}) {
  const pct = goalCents && goalCents > 0 ? Math.min(100, Math.round((raisedCents / goalCents) * 100)) : null;
  return (
    <div style={{ background: "var(--surface-light)", borderRadius: 14, overflow: "hidden", border: "1px solid var(--border-app)", marginBottom: ".875rem" }}>
      <div style={{ padding: ".875rem 1rem .5rem", borderBottom: "1px solid var(--border-app)" }}>
        <div style={{ fontSize: ".72rem", fontWeight: 700, color: "var(--text-muted-app)", textTransform: "uppercase", letterSpacing: ".08em" }}>
          My Fundraiser
        </div>
      </div>
      <div style={{ padding: "1rem" }}>
        <div style={{ marginBottom: ".75rem" }}>
          <span style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--text-primary-app)" }}>{fmt(raisedCents)}</span>
          {goalCents != null && (
            <span style={{ fontSize: ".85rem", color: "var(--text-muted-app)", marginLeft: ".35rem" }}>of {fmt(goalCents)} goal</span>
          )}
        </div>
        {pct !== null && (
          <div style={{ marginBottom: ".9rem" }}>
            <div style={{ height: 10, background: "var(--surface-light-elevated)", borderRadius: 100, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: "var(--team-primary)", borderRadius: 100, transition: "width .4s ease" }} />
            </div>
            <div style={{ marginTop: ".35rem", fontSize: ".72rem", fontWeight: 700, color: "var(--team-primary)" }}>{pct}% funded</div>
          </div>
        )}
        <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap", marginBottom: ".9rem" }}>
          <div style={{ flex: 1, minWidth: 90, textAlign: "center", padding: ".6rem", background: "var(--surface-light-elevated)", borderRadius: 10 }}>
            <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "var(--text-primary-app)" }}>{contactCount}</div>
            <div style={{ fontSize: ".65rem", color: "var(--text-muted-app)" }}>contact{contactCount !== 1 ? "s" : ""}</div>
          </div>
        </div>
        <a
          href={`/team/${slug}/contacts`}
          style={{ display: "flex", alignItems: "center", gap: ".6rem", padding: ".75rem .9rem", background: "var(--surface-light-elevated)", borderRadius: 10, border: "1px solid var(--border-app)", textDecoration: "none", marginBottom: ".5rem" }}
        >
          <Users size={16} strokeWidth={2} style={{ color: "var(--text-muted-app)", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: ".78rem", fontWeight: 700, color: "var(--text-primary-app)", marginBottom: ".1rem" }}>Manage My Contacts</div>
            <div style={{ fontSize: ".68rem", color: "var(--text-muted-app)" }}>{contactCount} contact{contactCount !== 1 ? "s" : ""}</div>
          </div>
          <ArrowUpRight size={14} strokeWidth={2} style={{ color: "var(--text-muted-app)", flexShrink: 0 }} />
        </a>
        <CoachShareButton shareUrl={shareUrl} shareTitle={shareTitle} shareText={shareText} />
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const DEFAULT_ATHLETE_GOAL_CENTS = 50_000;

function listEyebrow(settings: CampaignSettings): string {
  return [settings.school_name, settings.season].filter(Boolean).join(" · ");
}

// ── Full-list views (?view=) ──────────────────────────────────────────────────
// Rendered on the server from the same data the dashboard already loaded
// for this actor, so a full list is one page load (no extra API) and can
// never contain more than the actor's branch was authorized to load.

/** Athletes, parents, boosters and the public team view: the full
 *  leaderboard (same ranking) or the existing 15-most-recent team
 *  donations — never more donor history than the dashboard allowed. */
function TeamListPage({
  view, settings, leaderboard, teamFeed, backHref, currentAthleteId,
}: {
  view:              Exclude<FundraiserListView, "donors">;
  settings:          CampaignSettings;
  leaderboard:       LeaderboardEntry[];
  teamFeed:          FeedDonation[];
  backHref:          string;
  currentAthleteId?: string;
}) {
  if (view === "athletes") {
    return (
      <FullListView backHref={backHref} eyebrow={listEyebrow(settings)} title={`Team Leaderboard (${leaderboard.length})`} testId="full-list-athletes">
        <AthleteRows entries={leaderboard} currentAthleteId={currentAthleteId} />
      </FullListView>
    );
  }
  return (
    <FullListView
      backHref={backHref}
      eyebrow={listEyebrow(settings)}
      title="Recent Team Donations"
      note={`The ${MEMBER_TEAM_FEED_LIMIT} most recent team donations.`}
      testId="full-list-donations"
    >
      <DonationRows donations={teamFeed.slice(0, MEMBER_TEAM_FEED_LIMIT)} />
    </FullListView>
  );
}

export default async function FundraiserPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ athlete?: string; view?: string | string[] }>;
}) {
  const { slug } = await params;
  const { athlete: requestedAthleteId, view: requestedView } = await searchParams;

  const [settings, actor] = await Promise.all([
    getCampaignSettings(slug),
    getTeamActor(slug),
  ]);

  if (!settings) notFound();

  // Phase F1b — single shared decision (src/lib/fundraiserAccess.ts) for
  // every branch below. "dashboard" is byte-for-byte the pre-F1b behavior
  // (all 8 production campaigns have fundraising_enabled=true today — see
  // phase_f1a_fundraising_toggle.sql's backfill). Never relies on the nav
  // being hidden as the actual security boundary — this is it. Fallback is
  // `?? true`, matching layout.tsx's showFundraiser computation (and
  // /api/campaign-stats/[slug] for the public page) — a missing column
  // must fail toward the existing visible behavior, never toward silently
  // locking every member out of a team whose fundraiser is actually fine.
  const routeView = resolveFundraiserRouteView(settings.fundraising_enabled ?? true, actor);

  // ── Public visitor — read-only campaign view (no analytics, no donate modal) ──
  if (actor.kind === "public") {
    if (routeView !== "dashboard") notFound();

    const [athletes, donations] = await Promise.all([
      getTeamAthletes(slug),
      getDonations(slug),
    ]);
    const raisedCents = donations.reduce((s, d) => s + d.amount_cents, 0);
    const leaderboard = buildLeaderboard(athletes, donations);
    const teamFeed    = buildTeamFeed(athletes, donations);
    const listView    = parseFundraiserListView(requestedView, false);
    if (listView === "athletes" || listView === "donations") {
      return <TeamListPage view={listView} settings={settings} leaderboard={leaderboard} teamFeed={teamFeed} backHref={fundraiserHref(slug)} />;
    }
    return (
      <TeamDashboard
        settings={settings}
        raisedCents={raisedCents}
        donationCount={donations.length}
        leaderboard={leaderboard}
        teamFeed={teamFeed}
        displayGoalCents={getDisplayGoalCents(settings.goal_cents ?? 0, raisedCents)}
      />
    );
  }

  // ── Coach, fundraising OFF ── Platform Admin always resolves to
  // "dashboard" (see resolveFundraiserRouteView) — the locked product
  // decision is "Platform Admin behavior remains unchanged" regardless of
  // fundraising_enabled, since they're the ones who control the toggle.
  // Never loads athletes/donations/analytics — this is a feature-not-
  // yet-on state, not a degraded dashboard.
  if (routeView === "coach-inquiry") {
    return <FundraisingInquiryState slug={slug} />;
  }

  // ── Coach / staff / platform admin ── (read-only analytics view; no
  // actor-identity fields are used inside this branch, so a platform
  // admin gets the exact same coach-equivalent view with no special-casing)
  if (actor.kind === "coach" || actor.kind === "platform_admin") {
    const [athletes, donations, outreachMap, contactCounts] = await Promise.all([
      getTeamAthletes(slug),
      getDonations(slug),
      getOutreachMap(slug),
      getContactCountsByAthlete(slug),
    ]);

    const raisedCents = donations.reduce((s, d) => s + d.amount_cents, 0);
    const teamGoalCents = settings.goal_cents ?? 0;
    const athleteProgress = buildAthleteProgress(athletes, donations);
    const topDonors       = buildTopDonors(athletes, donations);
    // Decision 2: coaches/platform admins keep the complete donation
    // history (they can already export it) — the only branch that does.
    const allDonations    = buildTeamFeed(athletes, donations, donations.length);

    const listView = parseFundraiserListView(requestedView, true);
    if (listView) {
      const backHref = fundraiserHref(slug);
      const eyebrow  = listEyebrow(settings);
      if (listView === "athletes") {
        return (
          <FullListView backHref={backHref} eyebrow={eyebrow} title={`Athlete Progress (${athleteProgress.length})`} testId="full-list-athletes">
            <AthleteRows entries={athleteProgress} detail="progress" />
          </FullListView>
        );
      }
      if (listView === "donors") {
        return (
          <FullListView backHref={backHref} eyebrow={eyebrow} title={`Top Donors (${topDonors.length})`} note="Donors grouped by name, highest total first. Anonymous gifts are grouped together." testId="full-list-donors">
            <DonorRows donors={topDonors} />
          </FullListView>
        );
      }
      return (
        <FullListView backHref={backHref} eyebrow={eyebrow} title={`All Donations (${allDonations.length})`} note="Every donation to this campaign, newest first." testId="full-list-donations">
          <DonationRows donations={allDonations} />
        </FullListView>
      );
    }

    // Personal fundraising view — absent (not an error state) unless this
    // specific coach is an ACTIVE participant. A platform admin has no
    // team_coaches row to be a participant under, so this is always
    // absent for them (matches "this is a fundraising function attached
    // to their coach identity").
    let myFundraiser: { raisedCents: number; goalCents: number | null; contactCount: number; shareUrl: string; shareTitle: string; shareText: string } | null = null;
    if (actor.kind === "coach") {
      const isParticipant = await validateCoachForCampaign(actor.session.id, slug);
      if (isParticipant) {
        const [participant, coachTotals, coachContactCounts] = await Promise.all([
          getCoachFundraiserById(actor.session.id, slug),
          getCoachTotals(slug),
          getContactCountsByCoach(slug),
        ]);
        myFundraiser = {
          raisedCents:  coachTotals[actor.session.id] ?? 0,
          goalCents:    participant?.goal_cents ?? null,
          contactCount: coachContactCounts[actor.session.id] ?? 0,
          // Relative path (empty origin) — CoachShareButton passes this
          // straight to navigator.share/clipboard as a same-origin URL;
          // buildCoachShareUrl's origin param exists for external share
          // text that needs an absolute URL, which isn't the case here.
          shareUrl:     buildCoachShareUrl("", slug, actor.session.id),
          shareTitle:   `Support Coach ${actor.session.name}`,
          shareText:    buildCoachShareText(actor.session.name, settings.school_name, settings.sport_name),
        };
      }
    }

    // ── Analytics data ────────────────────────────────────────────────────────
    // Same calculations as before, moved into fundraiserData.ts unchanged.
    const teamStats = buildTeamStats(settings, donations, raisedCents);
    const pace      = buildPace(settings, donations, teamStats);

    // Phase 6: roster-first Follow-Ups rows — starts from `athletes`
    // (every roster row), enriched by athlete id from contactCounts/
    // donations/outreachMap. Never derived from those three datasets.
    // Phase A35: active coach-fundraiser rows are appended alongside the
    // athlete rows (same Follow-Ups workspace, not a separate system) —
    // see withCoachFollowUpRows above.
    const followUpRows = await withCoachFollowUpRows(
      slug, settings.allow_coach_fundraising ?? false,
      buildFollowUpRows(athletes, donations, contactCounts, outreachMap),
    );

    // Only the first DASHBOARD_PREVIEW_COUNT rows of each list are
    // rendered (and serialized); the rest open in the ?view= full lists.
    return (
      <FundraiserTabs
        actor={actor}
        overview={
          <div className={styles.overviewDesktopWrap}>
            {myFundraiser && (
              <MyCoachFundraiserCard
                slug={slug}
                raisedCents={myFundraiser.raisedCents}
                goalCents={myFundraiser.goalCents}
                contactCount={myFundraiser.contactCount}
                shareUrl={myFundraiser.shareUrl}
                shareTitle={myFundraiser.shareTitle}
                shareText={myFundraiser.shareText}
              />
            )}
            <CoachDashboard
              slug={slug}
              settings={settings}
              raisedCents={raisedCents}
              donationCount={teamStats.donorCount}
              displayGoalCents={getDisplayGoalCents(teamGoalCents, raisedCents)}
              pace={pace}
              athleteProgress={athleteProgress}
              topDonors={topDonors}
              recentDonations={allDonations}
            />
          </div>
        }
        followUps={
          <FollowUpsWorkspaceView slug={slug} settings={settings} initialRows={followUpRows} actor={actor} />
        }
      />
    );
  }

  // ── Booster (staff member, not a team_coaches row) — Follow-Ups access
  // only. Deliberately narrower than the coach branch above: gives the
  // same public-safe team view (TeamDashboard) as Overview, but NOT the coach analytics
  // (which contains coach-only donor/pace/needs-attention tooling) —
  // isStaff() alone must never widen access to that existing surface.
  if (actor.kind === "member" && isStaff(actor)) {
    // Phase F1b: a booster always resolves to "unavailable" when
    // fundraising is off (resolveFundraiserRouteView) — hidden from nav
    // too (shouldShowFundraisingNav), so a direct URL visit must not
    // expose the dashboard either. No inquiry state for boosters — that's
    // coach-only.
    if (routeView !== "dashboard") notFound();

    const [athletes, donations, outreachMap, contactCounts] = await Promise.all([
      getTeamAthletes(slug),
      getDonations(slug),
      getOutreachMap(slug),
      getContactCountsByAthlete(slug),
    ]);

    const raisedCents = donations.reduce((s, d) => s + d.amount_cents, 0);
    const leaderboard = buildLeaderboard(athletes, donations);
    const teamFeed    = buildTeamFeed(athletes, donations);
    // Decision 2: no Top Donors list and no donation history beyond the
    // existing 15 for boosters — "donors" is not a valid view here.
    const listView    = parseFundraiserListView(requestedView, false);
    if (listView === "athletes" || listView === "donations") {
      return <TeamListPage view={listView} settings={settings} leaderboard={leaderboard} teamFeed={teamFeed} backHref={fundraiserHref(slug)} />;
    }
    // Phase A35: a booster's Follow-Ups access is otherwise unchanged
    // (still no AnalyticsView, per the comment above) — but boosters
    // already record outreach for anyone via the same staff-gated
    // outreach routes (isStaff(), not isHeadCoach()/isCoachOnly()), so
    // they should see coach-fundraiser rows here too, exactly like the
    // coach branch above. Boosters still can never BE a participant
    // themselves; this only affects what they can help follow up on.
    const followUpRows = await withCoachFollowUpRows(
      slug, settings.allow_coach_fundraising ?? false,
      buildFollowUpRows(athletes, donations, contactCounts, outreachMap),
    );

    return (
      <FundraiserTabs
        actor={actor}
        overview={
          <div className={styles.overviewDesktopWrap}>
            <TeamDashboard
              settings={settings}
              raisedCents={raisedCents}
              donationCount={donations.length}
              leaderboard={leaderboard}
              teamFeed={teamFeed}
              displayGoalCents={getDisplayGoalCents(settings.goal_cents ?? 0, raisedCents)}
            />
          </div>
        }
        followUps={
          <FollowUpsWorkspaceView slug={slug} settings={settings} initialRows={followUpRows} actor={actor} />
        }
      />
    );
  }

  // ── Member (athlete/parent) ── Phase F1b: a plain member always
  // resolves to "unavailable" when fundraising is off (hidden from nav
  // too, per shouldShowFundraisingNav), so a direct URL visit must not
  // expose the athlete/claim dashboard either — checked before any
  // athlete/donation data is fetched.
  if (routeView !== "dashboard") notFound();

  // Family Relationships Phase B: a parent may be approved for more than
  // one athlete on this team (legacy single athlete_id column + additional
  // team_member_athletes links) — resolve the full canonical set rather
  // than trusting session.athlete_id alone, so a second/third linked child
  // is never silently invisible here. An athlete-role member's own row
  // always links only to themselves, so this is a no-op for them.
  const linkedAthleteIds = await getLinkedAthleteIdsForMember(actor.session.id, actor.session.athlete_id);

  if (linkedAthleteIds.length === 0) {
    const roster = await getTeamAthletes(slug);
    return <FundraiserView mode="claim" slug={slug} roster={roster} settings={settings} />;
  }

  // The requested athlete must belong to this actor's own canonical linked
  // set — a client-supplied ?athlete= for an unrelated athlete is silently
  // ignored (falls back to the default) rather than honored, so a parent
  // can never view a child they aren't approved for by editing the URL.
  const athleteId = requestedAthleteId && linkedAthleteIds.includes(requestedAthleteId)
    ? requestedAthleteId
    : linkedAthleteIds[0];

  const [athlete, athletes, donations] = await Promise.all([
    getAthleteById(athleteId),
    getTeamAthletes(slug),
    getDonations(slug),
  ]);

  if (!athlete) {
    const roster = await getTeamAthletes(slug);
    return <FundraiserView mode="claim" slug={slug} roster={roster} settings={settings} />;
  }

  // Only built (and only passed down) when there's an actual choice to
  // make — single-child parents and athletes see exactly the same view as
  // before this phase, no selector UI at all.
  const linkedAthletes = linkedAthleteIds.length > 1
    ? linkedAthleteIds.map(id => ({ id, name: athletes.find(a => a.id === id)?.name ?? "Unknown" }))
    : undefined;

  // Per-athlete totals (id-first, name fallback for legacy donations)
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

  const athleteRaisedCents = totals[athleteId] ?? 0;

  const donorCount = donations.filter(d =>
    d.athlete_id === athleteId || (!d.athlete_id && d.athlete_name === athlete.name),
  ).length;

  const ranked  = Object.entries(totals).sort(([, a], [, b]) => b - a);
  const rankIdx = ranked.findIndex(([id]) => id === athleteId);
  const rank    = rankIdx >= 0 ? rankIdx + 1 : athletes.length;

  const goalCents = athlete.goal_cents ?? settings.default_athlete_goal_cents ?? DEFAULT_ATHLETE_GOAL_CENTS;

  const recentDonations = donations
    .filter(d => d.athlete_id === athleteId || (!d.athlete_id && d.athlete_name === athlete.name))
    .slice(0, 5)
    .map(d => ({
      donor_name:       d.donor_name,
      amount_cents:     d.amount_cents,
      donation_message: d.donation_message,
      created_at:       d.created_at,
    }));

  const leaderboard = buildLeaderboard(athletes, donations);
  const teamFeed    = buildTeamFeed(athletes, donations);
  // A parent with several linked athletes keeps the selected (and
  // server-revalidated) athlete across the full lists and Back.
  const selectedParam = linkedAthletes ? athleteId : undefined;

  const listView = parseFundraiserListView(requestedView, false);
  if (listView === "athletes" || listView === "donations") {
    return (
      <div className={styles.memberFundraiserDesktop}>
        <TeamListPage
          view={listView}
          settings={settings}
          leaderboard={leaderboard}
          teamFeed={teamFeed}
          backHref={fundraiserHref(slug, undefined, selectedParam)}
          currentAthleteId={athleteId}
        />
      </div>
    );
  }

  const teamRaisedCents = donations.reduce((s, d) => s + d.amount_cents, 0);

  // Only the top five leaderboard rows and five team donations go to the
  // client; "View All" opens the server-rendered full lists above.
  return (
    <FundraiserView
      mode="athlete"
      slug={slug}
      athlete={athlete}
      settings={settings}
      athleteRaisedCents={athleteRaisedCents}
      goalCents={goalCents}
      rank={rank}
      totalAthletes={athletes.length}
      donorCount={donorCount}
      recentDonations={recentDonations}
      leaderboard={leaderboard.slice(0, DASHBOARD_PREVIEW_COUNT)}
      teamFeed={teamFeed.slice(0, DASHBOARD_PREVIEW_COUNT)}
      teamFeedTotal={teamFeed.length}
      teamRaisedCents={teamRaisedCents}
      teamDonationCount={donations.length}
      teamDisplayGoalCents={getDisplayGoalCents(settings.goal_cents ?? 0, teamRaisedCents)}
      selectedAthleteParam={selectedParam}
      linkedAthletes={linkedAthletes}
    />
  );
}
