// Compact Fundraiser Overview layouts for the coach and booster/public
// branches of page.tsx. page.tsx still loads the data and decides the role;
// these only arrange already-authorized data: one Campaign Overview card,
// Share near the top, top-five lists with "View All", and collapsed Pace /
// Export sections.
import { ArrowUpRight } from "lucide-react";
import type { CampaignSettings } from "@/lib/supabase";
import type { PaceData, AthleteProgress, TopDonor } from "../analytics/AnalyticsView";
import { PaceRows, PaceStatusBadge, ExportActions } from "../analytics/AnalyticsView";
import type { LeaderboardEntry, FeedDonation } from "./FundraiserView";
import CampaignOverviewCard from "./CampaignOverviewCard";
import { SectionCard, CollapsibleSection, ViewAllLink, AthleteRows, DonationRows, DonorRows } from "./DashboardParts";
import { DASHBOARD_PREVIEW_COUNT, fundraiserHref } from "./fundraiserData";
import styles from "./Fundraiser.module.css";

export function ShareCampaignCard({ slug }: { slug: string }) {
  return (
    <SectionCard title="Share Campaign" testId="share-campaign">
      <a href={`/campaign/${slug}`} target="_blank" rel="noopener noreferrer" className={styles.shareLink}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: ".8rem", fontWeight: 700, color: "var(--text-primary-app)", marginBottom: ".1rem" }}>Donation Page</div>
          <div style={{ fontSize: ".7rem", color: "var(--text-muted-app)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            /campaign/{slug}
          </div>
        </div>
        <ArrowUpRight size={14} strokeWidth={2} style={{ color: "var(--text-muted-app)", flexShrink: 0 }} aria-hidden="true" />
      </a>
    </SectionCard>
  );
}

export function CoachDashboard({
  slug, settings, raisedCents, donationCount, displayGoalCents, pace,
  athleteProgress, topDonors, recentDonations,
}: {
  slug:             string;
  settings:         CampaignSettings;
  raisedCents:      number;
  donationCount:    number;
  displayGoalCents: number;
  pace:             PaceData;
  /** Full ranked lists; only the first five are rendered here. */
  athleteProgress:  AthleteProgress[];
  topDonors:        TopDonor[];
  recentDonations:  FeedDonation[];
}) {
  const n = DASHBOARD_PREVIEW_COUNT;
  return (
    <div data-testid="coach-dashboard">
      <div className={styles.overviewGrid}>
        <CampaignOverviewCard
          settings={settings}
          raisedCents={raisedCents}
          donationCount={donationCount}
          displayGoalCents={displayGoalCents}
          variant="coach"
        />
        <div>
          <ShareCampaignCard slug={slug} />
          {pace && (
            <CollapsibleSection title="Fundraising Pace" badge={<PaceStatusBadge onTrack={pace.onTrack} />} testId="pace-section">
              <PaceRows pace={pace} primary={settings.primary_color} />
              <p className={styles.listNote} style={{ padding: "0 1.25rem", margin: ".1rem 0 .6rem" }}>
                Based on the base goal.
              </p>
            </CollapsibleSection>
          )}
        </div>
      </div>

      <div className={styles.overviewGrid}>
        <div>
          <SectionCard
            title="Athlete Progress"
            count={athleteProgress.length}
            testId="athlete-progress"
            footer={<ViewAllLink href={fundraiserHref(slug, "athletes")} label="View All Athletes" total={athleteProgress.length} shown={n} />}
          >
            <AthleteRows entries={athleteProgress.slice(0, n)} detail="progress" />
          </SectionCard>
          <SectionCard
            title="Recent Donations"
            count={donationCount}
            testId="recent-donations"
            footer={<ViewAllLink href={fundraiserHref(slug, "donations")} label="View All Donations" total={recentDonations.length} shown={n} />}
          >
            <DonationRows donations={recentDonations.slice(0, n)} />
          </SectionCard>
        </div>
        <div>
          <SectionCard
            title="Top Donors"
            count={topDonors.length}
            testId="top-donors"
            footer={<ViewAllLink href={fundraiserHref(slug, "donors")} label="View All Donors" total={topDonors.length} shown={n} />}
          >
            <DonorRows donors={topDonors.slice(0, n)} />
          </SectionCard>
          <CollapsibleSection title="Export Data" testId="export-section">
            <ExportActions slug={slug} />
          </CollapsibleSection>
        </div>
      </div>
    </div>
  );
}

/** Booster (and public) Overview — the same public-safe content as before
 *  (team totals, leaderboard, at most 15 recent donations), never the
 *  coach-only pace/donor/export tooling. */
export function TeamDashboard({
  settings, raisedCents, donationCount, displayGoalCents, leaderboard, teamFeed,
}: {
  settings:         CampaignSettings;
  raisedCents:      number;
  donationCount:    number;
  displayGoalCents: number;
  leaderboard:      LeaderboardEntry[];
  /** Already capped at MEMBER_TEAM_FEED_LIMIT by the caller. */
  teamFeed:         FeedDonation[];
}) {
  const n = DASHBOARD_PREVIEW_COUNT;
  const slug = settings.campaign_slug;
  return (
    <div data-testid="team-dashboard">
      <div className={styles.overviewGrid}>
        <CampaignOverviewCard
          settings={settings}
          raisedCents={raisedCents}
          donationCount={donationCount}
          displayGoalCents={displayGoalCents}
          variant="team"
        />
        <ShareCampaignCard slug={slug} />
      </div>
      <div className={styles.overviewGrid}>
        <SectionCard
          title="Team Leaderboard"
          count={leaderboard.length}
          testId="team-leaderboard"
          footer={<ViewAllLink href={fundraiserHref(slug, "athletes")} label="View All Athletes" total={leaderboard.length} shown={n} />}
        >
          <AthleteRows entries={leaderboard.slice(0, n)} />
        </SectionCard>
        <SectionCard
          title="Recent Donations"
          testId="recent-donations"
          footer={<ViewAllLink href={fundraiserHref(slug, "donations")} label="View All Donations" total={teamFeed.length} shown={n} />}
        >
          <DonationRows donations={teamFeed.slice(0, n)} />
        </SectionCard>
      </div>
    </div>
  );
}
