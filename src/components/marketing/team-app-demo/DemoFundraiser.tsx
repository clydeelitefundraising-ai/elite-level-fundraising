"use client";

import { ArrowUpRight, Users } from "lucide-react";
import type { TeamActor } from "@/lib/permissions";
import { resolveFundraiserRouteView } from "@/lib/fundraiserAccess";
import { buildCoachFollowUpRows, buildFollowUpRows } from "@/lib/followUps";
import { buildCoachShareText, buildCoachShareUrl } from "@/lib/shareCopy";
import { FullListView, AthleteRows, DonationRows, DonorRows } from "@/app/team/[slug]/fundraiser/DashboardParts";
import {
  DASHBOARD_PREVIEW_COUNT, MEMBER_TEAM_FEED_LIMIT, parseFundraiserListView, fundraiserHref,
  buildLeaderboard, buildTeamFeed, buildTeamStats, buildPace, buildAthleteProgress, buildTopDonors,
} from "@/app/team/[slug]/fundraiser/fundraiserData";
import { fmt } from "@/app/team/[slug]/fundraiser/fundraiserFormat";
import styles from "@/app/team/[slug]/fundraiser/Fundraiser.module.css";
import FundraiserView from "./DemoFundraiserView";
import FundraiserTabs from "./DemoFundraiserTabs";
import { CoachDashboard } from "./DemoTeamDashboards";
import FollowUpsWorkspaceView from "./DemoFollowUpsWorkspaceView";
import CoachShareButton from "./DemoCoachShareButton";
import ContactsView from "./DemoContactsView";
import { DEMO_SLUG } from "./demoData";
import { coachOwner, demoDisplayGoalCents } from "./fundraisingData";
import type { DemoDb } from "./demoApi";

// The Fundraiser tab, following fundraiser/page.tsx branch for branch with
// the demo's records in place of the database reads:
//
//   coach          FundraiserTabs — Overview (My Fundraiser for an active
//                  coach participant, then the CoachDashboard: Team
//                  Campaign, Share Campaign, Fundraising Pace, Athlete
//                  Progress, Recent Donations, Top Donors, Export Data)
//                  and Follow-Ups; ?view=athletes|donations|donors opens
//                  the full lists.
//   athlete/parent FundraiserView for the linked athlete (a parent with one
//                  child sees no selector, like the app); ?view=athletes|
//                  donations opens the leaderboard / the 15 most recent.
//
// Every number comes from the app's own builders (fundraiserData.ts,
// lib/followUps.ts) over the demo's donations, so the totals are exactly
// the sample campaign's: $9,840 raised toward $15,000 (the display goal is
// demoDisplayGoalCents, a restatement of getDisplayGoalCents — see
// fundraisingData.ts).

const DEFAULT_ATHLETE_GOAL_CENTS = 50_000;

// ── Copied verbatim from fundraiser/page.tsx (teamAppDemoTeam.test.ts
// compares them); its CoachShareButton is the twin, so sharing is a
// preview-only notice. ───────────────────────────────────────────────────────

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

// ── The page ────────────────────────────────────────────────────────────────

function listEyebrow(db: DemoDb): string {
  return [db.settings.school_name, db.settings.season].filter(Boolean).join(" · ");
}

export default function DemoFundraiser({ actor, db, search }: { actor: TeamActor; db: DemoDb; search: string }) {
  const slug = DEMO_SLUG;
  const { settings, athletes, donations } = db;
  const params = new URLSearchParams(search);
  const requestedView = params.get("view") ?? undefined;
  const routeView = resolveFundraiserRouteView(settings.fundraising_enabled ?? true, actor);
  if (routeView !== "dashboard" || actor.kind === "public" || actor.kind === "platform_admin") return null;

  // ── Coach ──
  if (actor.kind === "coach") {
    const raisedCents = donations.reduce((s, d) => s + d.amount_cents, 0);
    const athleteProgress = buildAthleteProgress(athletes, donations);
    const topDonors = buildTopDonors(athletes, donations);
    const allDonations = buildTeamFeed(athletes, donations, donations.length);

    const listView = parseFundraiserListView(requestedView, true);
    if (listView) {
      const backHref = fundraiserHref(slug);
      const eyebrow = listEyebrow(db);
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

    const participant = db.coachParticipants.find(p => p.coach_id === actor.session.id) ?? null;
    const coachRaised = (cid: string) => donations.filter(d => d.coach_id === cid).reduce((s, d) => s + d.amount_cents, 0);
    const myFundraiser = participant ? {
      raisedCents: coachRaised(actor.session.id),
      goalCents: participant.goal_cents,
      contactCount: db.contacts[coachOwner(actor.session.id)]?.length ?? 0,
      shareUrl: buildCoachShareUrl("", slug, actor.session.id),
      shareTitle: `Support Coach ${actor.session.name}`,
      shareText: buildCoachShareText(actor.session.name, settings.school_name, settings.sport_name),
    } : null;

    const teamStats = buildTeamStats(settings, donations, raisedCents);
    const pace = buildPace(settings, donations, teamStats);

    const contactCounts = Object.fromEntries(athletes.map(a => [a.id, db.contacts[a.id]?.length ?? 0]));
    const outreachMap = Object.fromEntries(Object.entries(db.outreach).filter(([k, v]) => !k.startsWith("coach:") && v.length).map(([k, v]) => [k, v[0]]));
    const coachRows = settings.allow_coach_fundraising
      ? buildCoachFollowUpRows(
          db.coachParticipants.map(p => ({ id: p.coach_id, name: p.name, role: p.role })),
          Object.fromEntries(db.coachParticipants.map(p => [p.coach_id, coachRaised(p.coach_id)])),
          Object.fromEntries(db.coachParticipants.map(p => [p.coach_id, db.contacts[coachOwner(p.coach_id)]?.length ?? 0])),
          Object.fromEntries(db.coachParticipants.filter(p => db.outreach[coachOwner(p.coach_id)]?.length).map(p => [p.coach_id, db.outreach[coachOwner(p.coach_id)][0]])),
        )
      : [];
    const followUpRows = [...buildFollowUpRows(athletes, donations, contactCounts, outreachMap), ...coachRows];

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
              displayGoalCents={demoDisplayGoalCents(settings.goal_cents ?? 0, raisedCents)}
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

  // ── Athlete / parent: their linked athlete ──
  const linkedAthleteIds = actor.session.athlete_id ? [actor.session.athlete_id] : [];
  const requestedAthleteId = params.get("athlete");
  const athleteId = requestedAthleteId && linkedAthleteIds.includes(requestedAthleteId) ? requestedAthleteId : linkedAthleteIds[0];
  const athlete = athletes.find(a => a.id === athleteId);
  if (!athlete) return <FundraiserView mode="claim" slug={slug} roster={athletes} settings={settings} />;

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
  const donorCount = donations.filter(d => d.athlete_id === athleteId || (!d.athlete_id && d.athlete_name === athlete.name)).length;
  const ranked = Object.entries(totals).sort(([, a], [, b]) => b - a);
  const rankIdx = ranked.findIndex(([aid]) => aid === athleteId);
  const rank = rankIdx >= 0 ? rankIdx + 1 : athletes.length;
  const goalCents = athlete.goal_cents ?? settings.default_athlete_goal_cents ?? DEFAULT_ATHLETE_GOAL_CENTS;
  const recentDonations = donations
    .filter(d => d.athlete_id === athleteId || (!d.athlete_id && d.athlete_name === athlete.name))
    .slice(0, 5)
    .map(d => ({ donor_name: d.donor_name, amount_cents: d.amount_cents, donation_message: d.donation_message, created_at: d.created_at }));
  const leaderboard = buildLeaderboard(athletes, donations);
  const teamFeed = buildTeamFeed(athletes, donations);

  const listView = parseFundraiserListView(requestedView, false);
  if (listView === "athletes" || listView === "donations") {
    return (
      <div className={styles.memberFundraiserDesktop}>
        {listView === "athletes" ? (
          <FullListView backHref={fundraiserHref(slug)} eyebrow={listEyebrow(db)} title={`Team Leaderboard (${leaderboard.length})`} testId="full-list-athletes">
            <AthleteRows entries={leaderboard} currentAthleteId={athleteId} />
          </FullListView>
        ) : (
          <FullListView
            backHref={fundraiserHref(slug)}
            eyebrow={listEyebrow(db)}
            title="Recent Team Donations"
            note={`The ${MEMBER_TEAM_FEED_LIMIT} most recent team donations.`}
            testId="full-list-donations"
          >
            <DonationRows donations={teamFeed.slice(0, MEMBER_TEAM_FEED_LIMIT)} />
          </FullListView>
        )}
      </div>
    );
  }

  const teamRaisedCents = donations.reduce((s, d) => s + d.amount_cents, 0);
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
      teamDisplayGoalCents={demoDisplayGoalCents(settings.goal_cents ?? 0, teamRaisedCents)}
    />
  );
}

/** Fundraising contacts (contacts/page.tsx): a participating coach's own
 *  list, or the linked athlete's for an athlete or parent. */
export function DemoContactsPage({ actor, db }: { actor: TeamActor; db: DemoDb }) {
  if (actor.kind === "coach" && db.coachParticipants.some(p => p.coach_id === actor.session.id)) {
    return <ContactsView slug={DEMO_SLUG} memberName={actor.session.name} memberRole={actor.session.role} primaryColor={db.settings.primary_color} />;
  }
  if (actor.kind !== "member" || !actor.session.athlete_id) return null;
  return (
    <ContactsView
      slug={DEMO_SLUG}
      memberName={actor.session.name}
      memberRole={actor.session.role}
      primaryColor={db.settings.primary_color}
      selectedAthleteId={actor.session.athlete_id}
    />
  );
}
