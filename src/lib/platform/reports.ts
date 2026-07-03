// Intelligence & Reporting Center (Phase A19A).
//
// Read-only. Every report below is composed entirely from existing Platform
// Services — no table is queried directly here except via those services'
// exports (or `_client.ts` for the one small coach-roster lookup no service
// yet owns). This module's only new logic is the insight/recommendation
// generation layered on top of data those services already compute.

import { restList } from "./_client";
import { calculateHealth, calculateRevenueForecast, type TeamHealth } from "./health";
import { getAllDonations, getDonationSummary, groupDonationsByCampaign, calculateDonationMomentum, type RawDonation } from "./donations";
import { getPipelineSummary, getContacts, getFollowUps, type CrmContact } from "./crm";
import { listEvents, type AutomationEvent } from "./automation";
import { getJobRunSummary, getRecentJobRuns } from "./jobs";
import { getRecentAudit } from "./audit";
import {
  getSponsorScoringContext, getTopSponsors, getSponsorInsights, getRenewalForecast,
  recommendSponsors, calculateSponsorScore, type SponsorScoringContext, type SponsorBusiness,
  type SponsorRecommendation,
} from "./sponsors";
import { getQueueSummary, getRecentFailures, getStaleQueued } from "./notifications";
import { getNeedsAttention, getTodayStats } from "./operations";

const ELF_FEE_RATE = Number(process.env.ELF_PLATFORM_FEE_RATE) || 0.08;

// ── Shared shapes ────────────────────────────────────────────────────────────

export type InsightTone = "positive" | "neutral" | "warning" | "critical";
export type ReportInsight = { text: string; tone: InsightTone };

export type RecommendationPriority = "high" | "medium" | "low";
export type ReportRecommendation = { text: string; priority: RecommendationPriority };

export type ReportMetric = { label: string; value: string | number; sublabel?: string };
export type ReportChartBar = { label: string; value: number; color?: string };
export type ReportChart = { title: string; bars: ReportChartBar[]; maxValue?: number };

// Small typed "extra tables" bag for list-shaped detail a report wants to
// surface beyond metrics/charts (e.g. recent donations, sponsor matches,
// upcoming follow-ups) without widening ReportSection per-report.
export type ReportDetailRow = { label: string; value: string; sublabel?: string };

export type ReportSection = {
  id:               string;
  title:            string;
  audience:         string;
  summary:          string;
  metrics:          ReportMetric[];
  charts:           ReportChart[];
  insights:         ReportInsight[];
  recommendations:  ReportRecommendation[];
  detail?:          Record<string, ReportDetailRow[]>;
};

export type EntityReport = ReportSection & { entityId: string; entityLabel: string };

export type ReportsData = {
  executive:           ReportSection;
  athleticDirector:    ReportSection;
  automation:          ReportSection;
  operations:          ReportSection;
  crm:                 ReportSection;
  sponsorIntelligence: ReportSection;
  donation:            ReportSection;
  campaigns:           EntityReport[];
  coaches:             EntityReport[];
  sponsors:            EntityReport[];
  generatedAt:         string;
};

// ── Formatting helpers ───────────────────────────────────────────────────────

function money(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}
function insight(text: string, tone: InsightTone): ReportInsight { return { text, tone }; }
function rec(text: string, priority: RecommendationPriority): ReportRecommendation { return { text, priority }; }

// ── Fetch everything once, build every report from the shared context ───────

export async function getReportsData(): Promise<ReportsData> {
  const [
    health, allDonations, crmPipeline, allContacts, followUps14,
    automationEvents, jobSummary, recentRuns, recentAudit,
    sponsorCtx,
    notificationSummary, notificationFailures, staleQueued,
    attention, todayStats, rawCoaches,
  ] = await Promise.all([
    calculateHealth(),
    getAllDonations(),
    getPipelineSummary(),
    getContacts(),
    getFollowUps(14),
    listEvents(500),
    getJobRunSummary(),
    getRecentJobRuns(20),
    getRecentAudit(10),
    getSponsorScoringContext(),
    getQueueSummary(),
    getRecentFailures(10),
    getStaleQueued(60),
    getNeedsAttention(),
    getTodayStats(),
    restList<{ id: string; name: string; campaign_slug: string; account_id: string | null }>(
      "team_coaches?select=id,name,campaign_slug,account_id&limit=2000",
    ),
  ]);
  // getTopSponsors/getSponsorInsights/getRenewalForecast each accept an
  // optional ctx param — pass sponsorCtx through so they score off the one
  // already-fetched context instead of each re-fetching sponsors/
  // relationships/activities/campaigns independently.
  const [topSponsors, sInsights, rForecast] = await Promise.all([
    getTopSponsors(10, sponsorCtx),
    getSponsorInsights(10, sponsorCtx),
    getRenewalForecast(sponsorCtx),
  ]);

  const donationsByCamp = groupDonationsByCampaign(allDonations);
  const donationSummary = getDonationSummary(allDonations);
  const openAutomation = automationEvents.filter(e => e.status === "open");
  const forecast = calculateRevenueForecast(health.teams, ELF_FEE_RATE);

  // Sponsor recommendations per campaign — pure scoring over the already-
  // fetched sponsorCtx, so this is zero additional queries even though it
  // runs once per team.
  const recsByCampaign = new Map<string, SponsorRecommendation[]>();
  for (const t of health.teams) {
    recsByCampaign.set(t.slug, await recommendSponsors(t.slug, 3, sponsorCtx));
  }

  const executive           = buildExecutiveReport(health, donationSummary, forecast, openAutomation, jobSummary, crmPipeline, topSponsors, sInsights, rForecast, notificationSummary);
  const athleticDirector    = buildAthleticDirectorReport(health, rawCoaches, sponsorCtx);
  const automation          = buildAutomationReport(openAutomation, recentRuns, jobSummary, notificationSummary, notificationFailures, staleQueued);
  const operations          = buildOperationsReport(attention, todayStats, recentAudit);
  const crm                 = buildCrmReport(crmPipeline, allContacts, followUps14);
  const sponsorIntelligence = buildSponsorIntelligenceReport(topSponsors, sInsights, rForecast, sponsorCtx);
  const donation             = buildDonationReport(allDonations, donationSummary, health.teams, donationsByCamp);

  const campaigns = health.teams.map(t => buildTeamEntityReport(t, donationsByCamp, recsByCampaign.get(t.slug) ?? [], "campaign"));
  const coaches   = health.teams
    .filter(t => rawCoaches.some(c => c.campaign_slug === t.slug))
    .map(t => buildTeamEntityReport(t, donationsByCamp, recsByCampaign.get(t.slug) ?? [], "coach"));
  const sponsors  = sponsorCtx.sponsors.map(s => buildSponsorEntityReport(s, sponsorCtx));

  return {
    executive, athleticDirector, automation, operations, crm, sponsorIntelligence, donation,
    campaigns, coaches, sponsors,
    generatedAt: new Date().toISOString(),
  };
}

// ── Executive Report ─────────────────────────────────────────────────────────

function buildExecutiveReport(
  health: Awaited<ReturnType<typeof calculateHealth>>,
  donationSummary: ReturnType<typeof getDonationSummary>,
  forecast: ReturnType<typeof calculateRevenueForecast>,
  openAutomation: AutomationEvent[],
  jobSummary: Awaited<ReturnType<typeof getJobRunSummary>>,
  crmPipeline: Awaited<ReturnType<typeof getPipelineSummary>>,
  topSponsors: Awaited<ReturnType<typeof getTopSponsors>>,
  sInsights: Awaited<ReturnType<typeof getSponsorInsights>>,
  rForecast: Awaited<ReturnType<typeof getRenewalForecast>>,
  notificationSummary: Awaited<ReturnType<typeof getQueueSummary>>,
): ReportSection {
  const { summary } = health;
  const critical = openAutomation.filter(e => e.severity === "critical").length;
  const notifDelivered = notificationSummary.sent + notificationSummary.failed;
  const deliveryRate = notifDelivered > 0 ? Math.round((notificationSummary.sent / notifDelivered) * 100) : null;

  const insights: ReportInsight[] = [
    summary.atRisk > 0
      ? insight(`${summary.atRisk} team${summary.atRisk === 1 ? "" : "s"} at risk and need attention.`, "critical")
      : insight("No teams are currently at risk.", "positive"),
    critical > 0
      ? insight(`${critical} critical automation event${critical === 1 ? "" : "s"} open.`, "critical")
      : insight("No critical automation events.", "positive"),
    rForecast.overdue > 0
      ? insight(`${rForecast.overdue} sponsor renewal${rForecast.overdue === 1 ? " is" : "s are"} overdue.`, "warning")
      : insight("No overdue sponsor renewals.", "positive"),
    notificationSummary.failed > 0
      ? insight(`${notificationSummary.failed} notification${notificationSummary.failed === 1 ? "" : "s"} failed to deliver.`, "warning")
      : insight("Notification delivery is healthy.", "positive"),
    crmPipeline.summary.newThisWeek > 0
      ? insight(`Coach CRM pipeline grew by ${crmPipeline.summary.newThisWeek} contact${crmPipeline.summary.newThisWeek === 1 ? "" : "s"} this week.`, "positive")
      : insight("No new CRM contacts this week.", "neutral"),
  ];

  const recommendations: ReportRecommendation[] = [];
  if (summary.atRisk > 0) recommendations.push(rec("Review at-risk teams in Team Health and prioritize outreach.", "high"));
  if (critical > 0) recommendations.push(rec("Resolve open critical automation events.", "high"));
  if (rForecast.overdue > 0) recommendations.push(rec("Contact sponsors with overdue renewals.", "medium"));
  if (notificationSummary.failed > 0) recommendations.push(rec("Investigate notification delivery failures.", "medium"));
  if (jobSummary.lastRunStatus === "failed") recommendations.push(rec("Re-run automation rules — the last scheduled run failed.", "high"));
  if (recommendations.length === 0) recommendations.push(rec("No urgent action needed — maintain current cadence.", "low"));

  return {
    id: "executive", title: "Executive Report", audience: "Leadership",
    summary: `${summary.totalTeams} active teams, ${money(donationSummary.totalRaisedCents)} raised, ${summary.atRisk} at risk.`,
    metrics: [
      { label: "Total Raised", value: money(donationSummary.totalRaisedCents) },
      { label: "Estimated Platform Revenue", value: money(Math.round(donationSummary.totalRaisedCents * ELF_FEE_RATE)) },
      { label: "Active Campaigns", value: summary.totalTeams },
      { label: "Teams At Risk", value: summary.atRisk },
      { label: "Open Automation Events", value: openAutomation.length, sublabel: `${critical} critical` },
      { label: "Sponsor Lifetime Value", value: money(topSponsors.reduce((s, r) => s + r.sponsor.lifetime_value, 0)) },
      { label: "CRM Pipeline Value", value: money(crmPipeline.summary.estimatedPipeline) },
      { label: "Notification Delivery Rate", value: deliveryRate != null ? `${deliveryRate}%` : "—" },
      { label: "Projected Revenue", value: money(forecast.projectedPlatformRevenueCents), sublabel: "Estimate" },
    ],
    charts: [{
      title: "Campaign Health Distribution",
      bars: [
        { label: "Healthy", value: summary.healthy, color: "#16a34a" },
        { label: "Watch", value: summary.watch, color: "#d97706" },
        { label: "At Risk", value: summary.atRisk, color: "#dc2626" },
      ],
    }],
    insights,
    recommendations,
  };
}

// ── Athletic Director Report ─────────────────────────────────────────────────

function buildAthleticDirectorReport(
  health: Awaited<ReturnType<typeof calculateHealth>>,
  rawCoaches: Array<{ id: string; name: string; campaign_slug: string; account_id: string | null }>,
  sponsorCtx: SponsorScoringContext,
): ReportSection {
  const { teams, summary } = health;
  const totalRaised = teams.reduce((s, t) => s + t.raisedCents, 0);
  const totalGoal   = teams.reduce((s, t) => s + t.goalCents, 0);
  const healthyTeams = teams.filter(t => t.label === "healthy");
  const atRiskTeams  = teams.filter(t => t.label === "at_risk");
  const linkedCoaches = rawCoaches.filter(c => c.account_id != null).length;

  const insights: ReportInsight[] = [
    atRiskTeams.length > 0
      ? insight(`${atRiskTeams.length} team${atRiskTeams.length === 1 ? "" : "s"} need attention: ${atRiskTeams.slice(0, 3).map(t => t.schoolName).join(", ")}.`, "critical")
      : insight("All teams are healthy or on watch.", "positive"),
    insight(`Department is at ${pct(totalRaised, totalGoal)}% of combined fundraising goals.`, pct(totalRaised, totalGoal) >= 50 ? "positive" : "warning"),
    linkedCoaches < rawCoaches.length
      ? insight(`${rawCoaches.length - linkedCoaches} coach${rawCoaches.length - linkedCoaches === 1 ? "" : "es"} have not activated their account.`, "warning")
      : insight("All coaches have activated accounts.", "positive"),
  ];

  const recommendations: ReportRecommendation[] = [];
  if (atRiskTeams.length > 0) recommendations.push(rec(`Schedule check-ins with: ${atRiskTeams.slice(0, 3).map(t => t.schoolName).join(", ")}.`, "high"));
  if (linkedCoaches < rawCoaches.length) recommendations.push(rec("Send activation reminders to coaches without a linked account.", "medium"));
  if (recommendations.length === 0) recommendations.push(rec("Department is in good standing — no action needed.", "low"));

  return {
    id: "athletic-director", title: "Athletic Director Report", audience: "Athletic Director",
    summary: `${summary.totalTeams} teams, ${money(totalRaised)} of ${money(totalGoal)} raised department-wide.`,
    metrics: [
      { label: "All Teams", value: summary.totalTeams },
      { label: "Department Total Raised", value: money(totalRaised) },
      { label: "Department Goal", value: money(totalGoal) },
      { label: "Healthy Teams", value: healthyTeams.length },
      { label: "At-Risk Teams", value: atRiskTeams.length },
      { label: "Coaches (Linked)", value: `${linkedCoaches}/${rawCoaches.length}` },
      { label: "Sponsor Businesses", value: sponsorCtx.sponsors.length },
      { label: "Sponsor Lifetime Value", value: money(sponsorCtx.sponsors.reduce((s, sp) => s + sp.lifetime_value, 0)) },
    ],
    charts: [{
      title: "Campaign Status",
      bars: [
        { label: "Healthy", value: summary.healthy, color: "#16a34a" },
        { label: "Watch", value: summary.watch, color: "#d97706" },
        { label: "At Risk", value: summary.atRisk, color: "#dc2626" },
      ],
    }],
    insights,
    recommendations,
  };
}

// ── Automation Report ─────────────────────────────────────────────────────────

function buildAutomationReport(
  openAutomation: AutomationEvent[],
  recentRuns: Awaited<ReturnType<typeof getRecentJobRuns>>,
  jobSummary: Awaited<ReturnType<typeof getJobRunSummary>>,
  notificationSummary: Awaited<ReturnType<typeof getQueueSummary>>,
  notificationFailures: Awaited<ReturnType<typeof getRecentFailures>>,
  staleQueued: Awaited<ReturnType<typeof getStaleQueued>>,
): ReportSection {
  const succeeded = recentRuns.filter(r => r.status === "succeeded").length;
  const failed    = recentRuns.filter(r => r.status === "failed").length;
  const successRate = recentRuns.length > 0 ? pct(succeeded, recentRuns.length) : null;
  const critical = openAutomation.filter(e => e.severity === "critical").length;

  const insights: ReportInsight[] = [
    failed > 0
      ? insight(`${failed} of the last ${recentRuns.length} automation runs failed.`, "warning")
      : insight("Automation runs are healthy.", "positive"),
    critical > 0
      ? insight(`${critical} critical automation event${critical === 1 ? "" : "s"} open.`, "critical")
      : insight("No critical automation events open.", "positive"),
    notificationSummary.failed > 0
      ? insight(`${notificationSummary.failed} queued notification${notificationSummary.failed === 1 ? "" : "s"} failed delivery.`, "warning")
      : insight("Notification queue has no failures.", "positive"),
    staleQueued.length > 0
      ? insight(`${staleQueued.length} notification${staleQueued.length === 1 ? " is" : "s are"} stuck past its scheduled time.`, "warning")
      : insight("Notification queue is processing on schedule.", "positive"),
  ];

  const recommendations: ReportRecommendation[] = [];
  if (jobSummary.lastRunStatus === "failed") recommendations.push(rec("Investigate why the last automation run failed.", "high"));
  if (critical > 0) recommendations.push(rec("Resolve open critical automation events.", "high"));
  if (notificationFailures.length > 0) recommendations.push(rec("Review recent notification delivery failures.", "medium"));
  if (staleQueued.length > 0) recommendations.push(rec("Confirm the notification delivery job is running.", "medium"));
  if (recommendations.length === 0) recommendations.push(rec("Automation is healthy — no action needed.", "low"));

  return {
    id: "automation", title: "Automation Report", audience: "Operations",
    summary: `${recentRuns.length} recent runs, ${successRate != null ? `${successRate}%` : "—"} success rate, ${critical} critical events open.`,
    metrics: [
      { label: "Automation Runs", value: recentRuns.length },
      { label: "Success Rate", value: successRate != null ? `${successRate}%` : "—" },
      { label: "Failed Runs", value: jobSummary.failedRuns },
      { label: "Critical Events", value: critical },
      { label: "Notifications Queued", value: notificationSummary.queued },
      { label: "Notifications Failed", value: notificationSummary.failed },
      { label: "Stale Queued Notifications", value: staleQueued.length },
    ],
    charts: [{
      title: "Recent Runs",
      bars: [
        { label: "Succeeded", value: succeeded, color: "#16a34a" },
        { label: "Failed", value: failed, color: "#dc2626" },
      ],
    }],
    insights,
    recommendations,
  };
}

// ── Operations Report — reuses operations.ts directly, adds no new logic ────

function buildOperationsReport(
  attention: Awaited<ReturnType<typeof getNeedsAttention>>,
  todayStats: Awaited<ReturnType<typeof getTodayStats>>,
  recentAudit: Awaited<ReturnType<typeof getRecentAudit>>,
): ReportSection {
  const critical = attention.attention.filter(a => a.severity === "critical");
  const warning  = attention.attention.filter(a => a.severity === "warning");

  const insights: ReportInsight[] = attention.attention.slice(0, 6).map(a =>
    insight(a.count != null ? `${a.title}: ${a.count}` : a.title, a.severity === "ok" ? "positive" : a.severity as InsightTone),
  );
  if (insights.length === 0) insights.push(insight("No items currently need attention.", "positive"));

  const recommendations: ReportRecommendation[] = attention.attention.slice(0, 6).map(a =>
    rec(a.actionLabel ? `${a.actionLabel}: ${a.title}` : a.title, a.severity === "critical" ? "high" : a.severity === "warning" ? "medium" : "low"),
  );
  if (recommendations.length === 0) recommendations.push(rec("Platform is operating normally.", "low"));

  return {
    id: "operations", title: "Operations Report", audience: "Operations",
    summary: `${attention.alertCount} item${attention.alertCount === 1 ? "" : "s"} need attention (${critical.length} critical, ${warning.length} warning).`,
    metrics: [
      { label: "Attention Items", value: attention.attention.length },
      { label: "Critical", value: critical.length },
      { label: "Warning", value: warning.length },
      ...todayStats.map(s => ({ label: s.label, value: s.value, sublabel: s.sublabel })),
    ],
    charts: [{
      title: "Attention by Severity",
      bars: [
        { label: "Critical", value: critical.length, color: "#dc2626" },
        { label: "Warning", value: warning.length, color: "#d97706" },
        { label: "Info", value: attention.attention.filter(a => a.severity === "info").length, color: "#2563eb" },
      ],
    }],
    insights,
    recommendations,
    detail: {
      "Recent Activity": recentAudit.map(a => ({
        label: a.summary ?? a.action, value: new Date(a.created_at).toLocaleString(),
      })),
    },
  };
}

// ── CRM Report ────────────────────────────────────────────────────────────────

function buildCrmReport(
  crmPipeline: Awaited<ReturnType<typeof getPipelineSummary>>,
  allContacts: CrmContact[],
  followUps14: CrmContact[],
): ReportSection {
  const { summary, pipeline } = crmPipeline;
  const conversionRate = pct(summary.signedActive, summary.totalContacts);
  const recentContacts = [...allContacts].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 5);

  const insights: ReportInsight[] = [
    summary.followUpsDue > 0
      ? insight(`${summary.followUpsDue} follow-up${summary.followUpsDue === 1 ? " is" : "s are"} due within 7 days.`, "warning")
      : insight("No follow-ups due soon.", "positive"),
    insight(`Pipeline conversion rate is ${conversionRate}%.`, conversionRate >= 30 ? "positive" : "neutral"),
    summary.newThisWeek > 0
      ? insight(`${summary.newThisWeek} new contact${summary.newThisWeek === 1 ? "" : "s"} added this week.`, "positive")
      : insight("No new contacts added this week.", "neutral"),
  ];

  const recommendations: ReportRecommendation[] = [];
  if (followUps14.length > 0) recommendations.push(rec(`Complete ${followUps14.length} follow-up${followUps14.length === 1 ? "" : "s"} due in the next 14 days.`, "high"));
  if (pipeline.demo_scheduled.length > 0) recommendations.push(rec(`Prepare for ${pipeline.demo_scheduled.length} scheduled demo${pipeline.demo_scheduled.length === 1 ? "" : "s"}.`, "medium"));
  if (recommendations.length === 0) recommendations.push(rec("Pipeline is current — no urgent follow-ups.", "low"));

  return {
    id: "crm", title: "CRM Report", audience: "Sales",
    summary: `${summary.totalContacts} contacts in pipeline, ${money(summary.estimatedPipeline)} estimated value, ${conversionRate}% conversion.`,
    metrics: [
      { label: "Total Contacts", value: summary.totalContacts },
      { label: "Open Prospects", value: summary.openProspects },
      { label: "Demos Scheduled", value: summary.demosScheduled },
      { label: "Proposals Sent", value: summary.proposalsSent },
      { label: "Signed / Active", value: summary.signedActive },
      { label: "Conversion Rate", value: `${conversionRate}%` },
      { label: "Follow-Ups Due (7d)", value: summary.followUpsDue },
      { label: "Estimated Pipeline Value", value: money(summary.estimatedPipeline) },
    ],
    charts: [{
      title: "Pipeline by Stage",
      bars: Object.entries(pipeline).map(([stage, contacts]) => ({ label: stage.replace(/_/g, " "), value: contacts.length })),
    }],
    insights,
    recommendations,
    detail: {
      "Recent Contacts": recentContacts.map(c => ({
        label: c.name, value: c.status, sublabel: c.school_name ?? undefined,
      })),
      "Upcoming Follow-Ups": followUps14.map(c => ({
        label: c.name, value: c.next_follow_up_at ? new Date(c.next_follow_up_at).toLocaleDateString() : "—",
        sublabel: c.status,
      })),
    },
  };
}

// ── Sponsor Intelligence Report ──────────────────────────────────────────────

function buildSponsorIntelligenceReport(
  topSponsors: Awaited<ReturnType<typeof getTopSponsors>>,
  sInsights: Awaited<ReturnType<typeof getSponsorInsights>>,
  rForecast: Awaited<ReturnType<typeof getRenewalForecast>>,
  sponsorCtx: SponsorScoringContext,
): ReportSection {
  const totalScored = sponsorCtx.sponsors.length;
  const averageScore = totalScored > 0
    ? Math.round(topSponsors.reduce((s, r) => s + r.score, 0) / Math.min(topSponsors.length, totalScored) || 0)
    : 0;

  const insights: ReportInsight[] = [
    rForecast.next30 > 0
      ? insight(`${rForecast.next30} sponsor renewal${rForecast.next30 === 1 ? " is" : "s are"} due in the next 30 days.`, "warning")
      : insight("No renewals due in the next 30 days.", "positive"),
    sInsights.inactiveSponsors.length > 0
      ? insight(`${sInsights.inactiveSponsors.length} active sponsor${sInsights.inactiveSponsors.length === 1 ? " is" : "s are"} inactive 180+ days.`, "warning")
      : insight("No long-inactive active sponsors.", "positive"),
    sInsights.recentlyLost.length > 0
      ? insight(`${sInsights.recentlyLost.length} sponsor${sInsights.recentlyLost.length === 1 ? "" : "s"} recently marked lost.`, "warning")
      : insight("No recently lost sponsors.", "positive"),
  ];

  const recommendations: ReportRecommendation[] = [];
  if (rForecast.overdue > 0) recommendations.push(rec(`Contact ${rForecast.overdue} sponsor${rForecast.overdue === 1 ? "" : "s"} with overdue renewals immediately.`, "high"));
  if (rForecast.next30 > 0) recommendations.push(rec("Reach out to sponsors renewing in the next 30 days.", "medium"));
  if (sInsights.inactiveSponsors.length > 0) recommendations.push(rec("Re-engage inactive active-status sponsors.", "medium"));
  if (recommendations.length === 0) recommendations.push(rec("Sponsor portfolio is healthy — no urgent action.", "low"));

  return {
    id: "sponsor-intelligence", title: "Sponsor Intelligence Report", audience: "Sponsorship Team",
    summary: `${totalScored} sponsors scored, average score ${averageScore}/100, ${rForecast.overdue} renewals overdue.`,
    metrics: [
      { label: "Sponsors Scored", value: totalScored },
      { label: "Average Score", value: `${averageScore}/100` },
      { label: "Renewals Overdue", value: rForecast.overdue },
      { label: "Renewals Next 30 Days", value: rForecast.next30 },
      { label: "Renewals Next 60 Days", value: rForecast.next60 },
      { label: "Inactive Sponsors", value: sInsights.inactiveSponsors.length },
    ],
    charts: [{
      title: "Top Sponsors by Score",
      bars: topSponsors.slice(0, 8).map(s => ({ label: s.sponsor.business_name, value: s.score })),
      maxValue: 100,
    }],
    insights,
    recommendations,
  };
}

// ── Donation Report ───────────────────────────────────────────────────────────

function buildDonationReport(
  allDonations: RawDonation[],
  donationSummary: ReturnType<typeof getDonationSummary>,
  teams: TeamHealth[],
  donationsByCamp: Record<string, RawDonation[]>,
): ReportSection {
  const last7  = calculateDonationMomentum(allDonations, 7);
  const prev7  = calculateDonationMomentum(
    allDonations.filter(d => new Date(d.created_at).getTime() < Date.now() - 7 * 86400000), 7,
  );
  const topCampaigns = teams
    .map(t => ({ label: t.schoolName, value: (donationsByCamp[t.slug] ?? []).reduce((s, d) => s + d.amount_cents, 0) / 100 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const momentumSlowing = prev7.cents > 0 && last7.cents < prev7.cents;

  const insights: ReportInsight[] = [
    momentumSlowing
      ? insight("Donation momentum is slowing compared to the prior 7 days.", "warning")
      : insight("Donation momentum is steady or increasing.", "positive"),
    insight(`Average donation is ${money(donationSummary.avgDonationCents)}.`, "neutral"),
    teams.filter(t => t.reasons.includes("Behind donation pace")).length > 0
      ? insight(`${teams.filter(t => t.reasons.includes("Behind donation pace")).length} campaign(s) behind pace.`, "warning")
      : insight("All campaigns are on pace.", "positive"),
  ];

  const recommendations: ReportRecommendation[] = [];
  if (momentumSlowing) recommendations.push(rec("Promote active campaigns to reverse slowing donation momentum.", "medium"));
  const behindPace = teams.filter(t => t.reasons.includes("Behind donation pace"));
  if (behindPace.length > 0) recommendations.push(rec(`Support campaigns behind pace: ${behindPace.slice(0, 3).map(t => t.schoolName).join(", ")}.`, "high"));
  if (recommendations.length === 0) recommendations.push(rec("Donation activity is healthy — no action needed.", "low"));

  return {
    id: "donation", title: "Donation Report", audience: "Finance",
    summary: `${money(donationSummary.totalRaisedCents)} raised across ${donationSummary.totalDonations} donations.`,
    metrics: [
      { label: "Total Raised", value: money(donationSummary.totalRaisedCents) },
      { label: "Total Donations", value: donationSummary.totalDonations },
      { label: "Average Donation", value: money(donationSummary.avgDonationCents) },
      { label: "Last 7 Days", value: money(last7.cents), sublabel: `${last7.count} donations` },
      { label: "Prior 7 Days", value: money(prev7.cents), sublabel: `${prev7.count} donations` },
    ],
    charts: [{ title: "Top Campaigns by Amount Raised", bars: topCampaigns }],
    insights,
    recommendations,
  };
}

// ── Campaign Report / Coach Report — same underlying data, different framing ─

function buildTeamEntityReport(
  t: TeamHealth,
  donationsByCamp: Record<string, RawDonation[]>,
  sponsorRecs: SponsorRecommendation[],
  audience: "campaign" | "coach",
): EntityReport {
  const donations = donationsByCamp[t.slug] ?? [];
  const recent = donations.slice(0, 5);

  const athleteTotals = new Map<string, number>();
  for (const d of donations) {
    const name = d.athlete_name ?? "Unattributed";
    athleteTotals.set(name, (athleteTotals.get(name) ?? 0) + d.amount_cents);
  }
  const topAthletes = [...athleteTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([label, cents]) => ({ label, value: cents / 100 }));

  const isCoach = audience === "coach";
  const insights: ReportInsight[] = t.reasons.map(r => insight(
    r,
    r === "Strong donation momentum" || r === "Recently active" ? "positive"
      : r === "Deadline approaching" ? "warning" : "warning",
  ));
  if (insights.length === 0) insights.push(insight("No notable issues detected.", "positive"));

  const REASON_ACTIONS: Record<string, string> = {
    "Behind donation pace":            isCoach ? "Send a team-wide push to boost donations before the deadline." : "Increase promotion — campaign is behind pace.",
    "No donations in 7+ days":         isCoach ? "Post an update to re-engage donors." : "Re-engage donors — no gifts in over a week.",
    "Low athlete participation":       isCoach ? "Encourage more athletes to share their fundraising page." : "Increase athlete participation.",
    "No recent coach communication":   isCoach ? "Post a team update — no communication in 14+ days." : "Coach has not communicated with the team recently.",
    "Missing campaign photo":          isCoach ? "Upload a team or logo photo to improve campaign presentation." : "Campaign is missing a photo.",
    "Deadline approaching":            isCoach ? "Make a final push before the deadline." : "Deadline is approaching — monitor closely.",
  };
  const recommendations: ReportRecommendation[] = t.reasons
    .filter(r => REASON_ACTIONS[r])
    .map(r => rec(REASON_ACTIONS[r], r.includes("Behind") || r.includes("No donations") ? "high" : "medium"));
  if (sponsorRecs.length > 0) {
    recommendations.push(rec(`Consider reaching out to ${sponsorRecs[0].sponsor.business_name} — strong sponsor match.`, "low"));
  }
  if (recommendations.length === 0) recommendations.push(rec("Team is on track — no action needed.", "low"));

  return {
    id: `${audience}-${t.slug}`,
    entityId: t.slug,
    entityLabel: `${t.schoolName} — ${t.sportName}`,
    title: isCoach ? "Coach Report" : "Campaign Report",
    audience: isCoach ? "Coach" : "Campaign Owner",
    summary: `${t.schoolName} ${t.sportName} is ${t.label.replace("_", " ")} at ${t.score}/100, ${t.pctToGoal}% to goal.`,
    metrics: [
      { label: "Goal Progress", value: `${t.pctToGoal}%`, sublabel: `${money(t.raisedCents)} of ${money(t.goalCents)}` },
      { label: "Donation Pace", value: `${Math.round(t.paceRatio * 100)}%` },
      { label: "Days Remaining", value: t.daysRemaining ?? "—" },
      { label: "Athletes", value: t.athleteCount },
      { label: "Health Score", value: `${t.score}/100`, sublabel: t.label.replace("_", " ") },
    ],
    charts: [
      { title: "Goal Progress", bars: [{ label: "Raised", value: Math.min(t.pctToGoal, 100) }], maxValue: 100 },
      ...(topAthletes.length > 0 ? [{ title: "Top Athletes (Amount Raised)", bars: topAthletes }] : []),
    ],
    insights,
    recommendations,
    detail: {
      "Recent Donations": recent.map(d => ({
        label: d.athlete_name ?? "Unattributed", value: money(d.amount_cents), sublabel: new Date(d.created_at).toLocaleDateString(),
      })),
      "Sponsor Matches": sponsorRecs.map(r => ({
        label: r.sponsor.business_name, value: `${r.matchScore}/100`, sublabel: r.reasons[0],
      })),
    },
  };
}

// ── Sponsor Report ────────────────────────────────────────────────────────────

function buildSponsorEntityReport(sponsor: SponsorBusiness, ctx: SponsorScoringContext): EntityReport {
  const relationships = ctx.relByBusiness[sponsor.id] ?? [];
  const { score } = calculateSponsorScore(sponsor, relationships, ctx.campaignsBySlug);

  const schools = new Set(relationships.map(r => r.campaign_slug).filter((s): s is string => !!s));
  const sports = new Set(
    relationships.map(r => (r.campaign_slug ? ctx.campaignsBySlug.get(r.campaign_slug)?.sport_name : null)).filter((s): s is string => !!s),
  );

  const daysUntilRenewal = sponsor.next_renewal_at
    ? Math.round((new Date(sponsor.next_renewal_at).getTime() - Date.now()) / 86400000)
    : null;
  const daysSinceLast = sponsor.last_sponsored_at
    ? Math.round((Date.now() - new Date(sponsor.last_sponsored_at).getTime()) / 86400000)
    : null;

  let nextContact: string;
  let nextContactPriority: RecommendationPriority;
  if (daysUntilRenewal != null && daysUntilRenewal <= 30) {
    nextContact = daysUntilRenewal < 0 ? "Overdue for renewal — contact immediately." : "Renewal due soon — schedule a renewal conversation.";
    nextContactPriority = "high";
  } else if (daysSinceLast != null && daysSinceLast >= 180) {
    nextContact = "Inactive 180+ days — re-engagement outreach recommended.";
    nextContactPriority = "medium";
  } else if (sponsor.status === "prospect" || sponsor.status === "contacted") {
    nextContact = "Continue prospecting — no sponsorship recorded yet.";
    nextContactPriority = "medium";
  } else {
    nextContact = "Relationship is healthy — no action needed yet.";
    nextContactPriority = "low";
  }

  const insights: ReportInsight[] = [
    insight(`Relationship score is ${score}/100.`, score >= 70 ? "positive" : score >= 40 ? "neutral" : "warning"),
    daysUntilRenewal != null
      ? insight(daysUntilRenewal < 0 ? "Renewal is overdue." : `Renewal in ${daysUntilRenewal} days.`, daysUntilRenewal < 0 ? "critical" : daysUntilRenewal <= 30 ? "warning" : "neutral")
      : insight("No renewal date on file.", "neutral"),
  ];

  return {
    id: `sponsor-${sponsor.id}`,
    entityId: sponsor.id,
    entityLabel: sponsor.business_name,
    title: "Sponsor Report", audience: "Sponsorship Team",
    summary: `${sponsor.business_name} — ${sponsor.status}, relationship score ${score}/100, ${money(sponsor.lifetime_value)} lifetime value.`,
    metrics: [
      { label: "Status", value: sponsor.status },
      { label: "Relationship Score", value: `${score}/100` },
      { label: "Lifetime Value", value: money(sponsor.lifetime_value) },
      { label: "Sponsorships", value: relationships.length },
      { label: "Schools Supported", value: schools.size },
      { label: "Sports Supported", value: sports.size },
      { label: "Next Renewal", value: sponsor.next_renewal_at ? new Date(sponsor.next_renewal_at).toLocaleDateString() : "—" },
    ],
    charts: [{
      title: "Sponsorship History (by amount)",
      bars: relationships.slice(0, 8).map(r => ({
        label: r.campaign_slug ? (ctx.campaignsBySlug.get(r.campaign_slug)?.school_name ?? r.campaign_slug) : "General",
        value: (r.sponsorship_amount ?? 0) / 100,
      })),
    }],
    insights,
    recommendations: [rec(nextContact, nextContactPriority)],
    detail: {
      "Sponsorship History": relationships.map(r => ({
        label: r.campaign_slug ? (ctx.campaignsBySlug.get(r.campaign_slug)?.school_name ?? r.campaign_slug) : "General",
        value: money(r.sponsorship_amount ?? 0),
        sublabel: new Date(r.sponsored_at).toLocaleDateString(),
      })),
    },
  };
}
