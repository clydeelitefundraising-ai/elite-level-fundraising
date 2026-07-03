import { cookies }  from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/lib/adminAuth";
import { calculateHealth } from "@/lib/platform/health";
import { getAllDonations, getDonationSummary } from "@/lib/platform/donations";
import { getPipelineSummary, getActivities } from "@/lib/platform/crm";
import { listEvents } from "@/lib/platform/automation";
import { getJobRunSummary } from "@/lib/platform/jobs";
import { getRecentAudit } from "@/lib/platform/audit";
import { getSponsorSummary, getSponsorScoringContext, getTopSponsors, getSponsorInsights } from "@/lib/platform/sponsors";
import { getQueueSummary } from "@/lib/platform/notifications";
import { restList } from "@/lib/platform/_client";
import ExecutiveDashboard from "./ExecutiveDashboard";
import type {
  ExecutiveData, Kpis, CampaignHealthDistribution, DonationMomentum, CoachPipeline,
  AutomationHealth, RevenueForecast, SponsorIntelSummary, NotificationHealth, Insight, TimelineItem,
} from "./types";

export const dynamic = "force-dynamic";

// Estimated cut ELF takes of donations processed. No fee schedule is
// configured in the schema yet, so this is a clearly-labeled estimate —
// override with ELF_PLATFORM_FEE_RATE if a real rate is ever finalized.
const ELF_FEE_RATE = Number(process.env.ELF_PLATFORM_FEE_RATE) || 0.08;

const DAY_MS = 86400000;

export default async function ExecutiveDashboardPage() {
  const store = await cookies();
  if (!verifyToken(store.get("elf_admin")?.value)) redirect("/admin");

  // ── Fetch once, reuse everywhere below. calculateHealth() already fetches
  // campaigns + donations internally to score every team, so it alone covers
  // all per-campaign KPIs/forecast data without a second campaigns query.
  // getAllDonations() here is the one accepted overlap: health.ts needs its
  // own copy for scoring, and this page needs the raw rows for 7/30-day
  // momentum windows and the donation timeline, which no summary exposes.
  const [
    health, allDonations, crmPipeline, recentCrmActivity, automationEvents,
    jobSummary, recentAudit, coaches, sponsorSummary, sponsorCtx, notificationSummary,
  ] = await Promise.all([
    calculateHealth(),
    getAllDonations(),
    getPipelineSummary(),
    getActivities(undefined, 5),
    listEvents(500),
    getJobRunSummary(),
    getRecentAudit(10),
    restList<{ id: string }>("team_coaches?select=id&limit=5000"),
    getSponsorSummary(),
    getSponsorScoringContext(),
    getQueueSummary(),
  ]);

  // getTopSponsors/getSponsorInsights reuse sponsorCtx (already fetched above)
  // instead of each re-querying sponsors/relationships/activities/campaigns.
  const [topScoredSponsors, sponsorInsights] = await Promise.all([
    getTopSponsors(3, sponsorCtx),
    getSponsorInsights(1, sponsorCtx),
  ]);

  const { teams, summary: healthSummary } = health;
  const donationSummary = getDonationSummary(allDonations);
  const now = Date.now();

  // ── KPIs ──────────────────────────────────────────────────────────────────

  const activeCampaigns = teams.filter(t => !t.archived);
  const openAutomationEvents = automationEvents.filter(e => e.status === "open").length;

  const kpis: Kpis = {
    totalCampaigns:           teams.length,
    activeCampaigns:          activeCampaigns.length,
    totalRaisedCents:         donationSummary.totalRaisedCents,
    estimatedElfRevenueCents: Math.round(donationSummary.totalRaisedCents * ELF_FEE_RATE),
    totalDonations:           donationSummary.totalDonations,
    avgDonationCents:         donationSummary.avgDonationCents,
    avgCampaignCents:         teams.length > 0 ? Math.round(donationSummary.totalRaisedCents / teams.length) : 0,
    activeCoaches:            coaches.length,
    teamsAtRisk:              healthSummary.atRisk,
    healthyTeams:             healthSummary.healthy,
    crmPipelineValueCents:    crmPipeline.summary.estimatedPipeline,
    openAutomationEvents,
    sponsorBusinesses:         sponsorSummary.totalBusinesses,
    sponsorLifetimeValueCents: sponsorSummary.lifetimeValueCents,
    sponsorRenewalsDue:        sponsorSummary.renewalsDue,
  };

  const campaignHealth: CampaignHealthDistribution = {
    healthy: healthSummary.healthy, watch: healthSummary.watch, atRisk: healthSummary.atRisk,
  };

  // ── Donation momentum ───────────────────────────────────────────────────────

  const last7  = allDonations.filter(d => now - new Date(d.created_at).getTime() <= 7 * DAY_MS);
  const last30 = allDonations.filter(d => now - new Date(d.created_at).getTime() <= 30 * DAY_MS);
  const donationMomentum: DonationMomentum = {
    last7Cents:  last7.reduce((s, d) => s + d.amount_cents, 0),
    last30Cents: last30.reduce((s, d) => s + d.amount_cents, 0),
    last7Count:  last7.length,
    last30Count: last30.length,
  };

  // ── Coach pipeline ───────────────────────────────────────────────────────────

  const coachPipeline: CoachPipeline = {
    prospects: crmPipeline.pipeline.prospect.length,
    demos:     crmPipeline.pipeline.demo_scheduled.length,
    proposals: crmPipeline.pipeline.proposal_sent.length,
    signed:    crmPipeline.pipeline.signed.length,
    returning: crmPipeline.pipeline.returning.length,
  };

  // ── Automation health ────────────────────────────────────────────────────────

  const openEvents = automationEvents.filter(e => e.status === "open");
  const automationHealth: AutomationHealth = {
    lastRunStatus:  jobSummary.lastRunStatus,
    lastRunAt:      jobSummary.lastRunAt,
    failedRuns:     jobSummary.failedRuns,
    criticalEvents: openEvents.filter(e => e.severity === "critical").length,
    warningEvents:  openEvents.filter(e => e.severity === "warning").length,
  };

  // ── Revenue forecast (pace-based extrapolation — clearly an estimate) ───────

  const forecastable = activeCampaigns.filter(t => t.timeFraction != null && t.timeFraction > 0.05 && (t.daysRemaining ?? -1) >= 0);
  const projectedCampaignRevenueCents = forecastable.reduce(
    (s, t) => s + Math.round(t.raisedCents / (t.timeFraction as number)), 0,
  );
  const likelyToHitGoal = forecastable.filter(t => Math.round(t.raisedCents / (t.timeFraction as number)) >= t.goalCents).length;

  const forecast: RevenueForecast = {
    projectedCampaignRevenueCents,
    projectedPlatformRevenueCents: Math.round(projectedCampaignRevenueCents * ELF_FEE_RATE),
    likelyToHitGoal,
    unlikelyToHitGoal: forecastable.length - likelyToHitGoal,
    feeRatePct: Math.round(ELF_FEE_RATE * 1000) / 10,
  };

  // ── Executive insights ───────────────────────────────────────────────────────

  const behindPaceCount = teams.filter(t => t.reasons.includes("Behind donation pace")).length;
  const prior30Start = now - 60 * DAY_MS;
  const prior30 = allDonations.filter(d => {
    const t = new Date(d.created_at).getTime();
    return now - t > 30 * DAY_MS && t >= prior30Start;
  });
  const avgLast30  = last30.length > 0 ? last30.reduce((s, d) => s + d.amount_cents, 0) / last30.length : null;
  const avgPrior30 = prior30.length > 0 ? prior30.reduce((s, d) => s + d.amount_cents, 0) / prior30.length : null;

  const insights: Insight[] = [];

  insights.push(healthSummary.atRisk > 0
    ? { text: `${healthSummary.atRisk} team${healthSummary.atRisk === 1 ? "" : "s"} at risk and need attention.`, tone: "critical" }
    : { text: "No teams are currently at risk.", tone: "positive" });

  insights.push(behindPaceCount > 0
    ? { text: `${behindPaceCount} campaign${behindPaceCount === 1 ? " is" : "s are"} behind donation pace.`, tone: "warning" }
    : { text: "All campaigns are on pace.", tone: "positive" });

  insights.push(automationHealth.criticalEvents > 0
    ? { text: `${automationHealth.criticalEvents} critical automation event${automationHealth.criticalEvents === 1 ? "" : "s"} need review.`, tone: "critical" }
    : { text: "No critical automation events detected.", tone: "positive" });

  insights.push(jobSummary.failedRuns > 0
    ? { text: `${jobSummary.failedRuns} automation run${jobSummary.failedRuns === 1 ? " has" : "s have"} failed recently.`, tone: "critical" }
    : { text: "Automation is healthy — no run failures detected.", tone: "positive" });

  insights.push(crmPipeline.summary.newThisWeek > 0
    ? { text: `CRM pipeline grew by ${crmPipeline.summary.newThisWeek} new contact${crmPipeline.summary.newThisWeek === 1 ? "" : "s"} this week.`, tone: "positive" }
    : { text: "No new CRM contacts added this week.", tone: "neutral" });

  if (avgLast30 != null && avgPrior30 != null) {
    insights.push(avgLast30 > avgPrior30
      ? { text: "Average donation increased over the last 30 days.", tone: "positive" }
      : avgLast30 < avgPrior30
        ? { text: "Average donation decreased over the last 30 days.", tone: "warning" }
        : { text: "Average donation held steady over the last 30 days.", tone: "neutral" });
  }

  if (forecastable.length > 0) {
    insights.push({
      text: `${likelyToHitGoal} of ${forecastable.length} active campaigns are projected to hit their goal.`,
      tone: likelyToHitGoal === forecastable.length ? "positive" : likelyToHitGoal === 0 ? "critical" : "neutral",
    });
  }

  // ── Sponsor intelligence summary ────────────────────────────────────────────

  const thisMonthStart = new Date(); thisMonthStart.setDate(1); thisMonthStart.setHours(0, 0, 0, 0);
  const businessesAddedThisMonth = sponsorCtx.sponsors.filter(
    s => new Date(s.created_at).getTime() >= thisMonthStart.getTime(),
  ).length;

  const sponsorIntel: SponsorIntelSummary = {
    topSponsors: topScoredSponsors.map(s => ({ businessName: s.sponsor.business_name, score: s.score })),
    renewalsNext30: sponsorSummary.renewalsDue,
    largestLifetimeSponsor: sponsorInsights.topLifetime[0]
      ? { businessName: sponsorInsights.topLifetime[0].business_name, valueCents: sponsorInsights.topLifetime[0].lifetime_value }
      : null,
    largestBudgetSponsor: sponsorInsights.highestBudget[0]
      ? { businessName: sponsorInsights.highestBudget[0].business_name, budgetCents: sponsorInsights.highestBudget[0].estimated_annual_budget ?? 0 }
      : null,
    businessesAddedThisMonth,
  };

  // ── Executive timeline ───────────────────────────────────────────────────────

  const schoolNameBySlug = new Map(teams.map(t => [t.slug, t.schoolName]));

  const timeline: TimelineItem[] = [
    ...recentAudit.map(e => ({
      id: `audit-${e.id}`, kind: "audit" as const,
      title: e.summary ?? e.action, at: e.created_at, href: "/admin/audit",
    })),
    ...recentCrmActivity.map(a => ({
      id: `crm-${a.id}`, kind: "crm" as const,
      title: a.title, at: a.activity_at, href: "/admin/crm",
    })),
    ...automationEvents.slice(0, 5).map(ev => ({
      id: `automation-${ev.id}`, kind: "automation" as const,
      title: ev.title, at: ev.created_at, href: "/admin/automation",
    })),
    ...allDonations.slice(0, 5).map((d, i) => ({
      id: `donation-${d.campaign_slug}-${d.created_at}-${i}`, kind: "donation" as const,
      title: `Donation of $${(d.amount_cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
      detail: schoolNameBySlug.get(d.campaign_slug) ?? d.campaign_slug,
      at: d.created_at, href: "/admin/campaigns",
    })),
    ...[...teams].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 3).map(t => ({
      id: `campaign-${t.slug}`, kind: "campaign" as const,
      title: `Campaign launched: ${t.schoolName}`, detail: t.sportName,
      at: t.createdAt, href: "/admin/campaigns",
    })),
  ]
    .filter(item => item.at)
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 15);

  // ── Notification health ──────────────────────────────────────────────────────

  const notifDelivered = notificationSummary.sent + notificationSummary.failed;
  const notificationHealth: NotificationHealth = {
    queued: notificationSummary.queued,
    failed: notificationSummary.failed,
    deliverySuccessRate: notifDelivered > 0 ? Math.round((notificationSummary.sent / notifDelivered) * 100) : null,
  };

  const data: ExecutiveData = {
    kpis, campaignHealth, donationMomentum, coachPipeline, automationHealth, forecast, sponsorIntel,
    notificationHealth, insights, timeline, generatedAt: new Date().toISOString(),
  };

  return <ExecutiveDashboard data={data} />;
}
