import { restList } from "./_client";
import { getCampaignSummary, getPendingCoachInvites } from "./campaigns";
import { getAllDonations, getDonationsSince, groupDonationsByCampaign, calculateDonationPace } from "./donations";
import { getRecentAudit, getAuditSince, getAuditSummary, type AuditEntry } from "./audit";
import { getFollowUps } from "./crm";
import { getSummary as getAutomationSummary } from "./automation";
import { getJobRunSummary } from "./jobs";
import { getSponsorScoringContext, getRenewalForecast, getSponsorInsights } from "./sponsors";

export type Severity = "critical" | "warning" | "info" | "ok";

export type AttentionItem = {
  id:           string;
  severity:     Severity;
  title:        string;
  count?:       number;
  detail?:      string;
  href?:        string;
  actionLabel?: string;
  icon:         string;
};

export type TodayStat = {
  label:     string;
  value:     number;
  icon:      string;
  sublabel?: string;
  href?:     string;
};

export type PlatformServiceStatus = {
  name:   string;
  icon:   string;
  status: "operational" | "unknown" | "unconfigured";
  note?:  string;
};

export type PendingCategory = {
  label: string;
  count: number;
  href?: string;
};

export type { AuditEntry };

function todayWindow() {
  const now        = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const in3Days    = new Date(todayStart.getTime() + 3 * 86400000);
  const in7Days    = new Date(todayStart.getTime() + 7 * 86400000);
  return { now, todayStart, in3Days, in7Days };
}

export async function getNeedsAttention(): Promise<{ attention: AttentionItem[]; alertCount: number }> {
  const { todayStart, in3Days, in7Days } = todayWindow();

  const [campaigns, allDonations, pendingInvites, crmFollowUpsDue, automationSummary, jobSummary, sponsorCtx, demoCheck] = await Promise.all([
    getCampaignSummary(),
    getAllDonations(),
    getPendingCoachInvites(),
    getFollowUps(7),
    getAutomationSummary(),
    getJobRunSummary(),
    getSponsorScoringContext(),
    restList<{ campaign_slug: string }>("campaign_settings?campaign_slug=eq.elf-demo&select=campaign_slug&limit=1"),
  ]);

  // getRenewalForecast/getSponsorInsights reuse sponsorCtx instead of each
  // re-fetching sponsors/relationships/activities/campaigns independently.
  const [renewalForecast, sponsorInsights] = await Promise.all([
    getRenewalForecast(sponsorCtx),
    getSponsorInsights(20, sponsorCtx),
  ]);
  const sponsorRenewalsDue = sponsorCtx.sponsors.filter(s => {
    if (!s.next_renewal_at) return false;
    const days = (new Date(s.next_renewal_at).getTime() - Date.now()) / 86400000;
    return days <= 30;
  });
  const MAJOR_SPONSOR_THRESHOLD_CENTS = 500000; // $5,000 lifetime value or higher counts as "major"
  const inactiveMajorSponsors = sponsorInsights.inactiveSponsors.filter(s => s.lifetime_value >= MAJOR_SPONSOR_THRESHOLD_CENTS);
  const lostHighValueSponsors = sponsorInsights.recentlyLost.filter(s => s.lifetime_value >= MAJOR_SPONSOR_THRESHOLD_CENTS);

  const attention: AttentionItem[] = [];

  const endingCritical = campaigns.filter(c => {
    const d = new Date(c.deadline);
    return d >= todayStart && d < in3Days;
  });
  if (endingCritical.length > 0) {
    attention.push({
      id: "ending-critical", severity: "critical", title: "Campaigns ending within 3 days",
      count: endingCritical.length,
      detail: endingCritical.slice(0, 3).map(c => `${c.school_name} ${c.sport_name}`).join(", "),
      href: "/admin/campaigns", actionLabel: "View Campaigns", icon: "⏰",
    });
  }

  const endingWarning = campaigns.filter(c => {
    const d = new Date(c.deadline);
    return d >= in3Days && d < in7Days;
  });
  if (endingWarning.length > 0) {
    attention.push({
      id: "ending-warning", severity: "warning", title: "Campaigns ending in 4–7 days",
      count: endingWarning.length,
      detail: endingWarning.slice(0, 3).map(c => `${c.school_name} ${c.sport_name}`).join(", "),
      href: "/admin/campaigns", actionLabel: "View Campaigns", icon: "📅",
    });
  }

  const slugsWithDonations = new Set(allDonations.map(d => d.campaign_slug));
  const noDonationCampaigns = campaigns.filter(c => !slugsWithDonations.has(c.campaign_slug));
  if (noDonationCampaigns.length > 0) {
    attention.push({
      id: "no-donations", severity: "warning", title: "Campaigns with no donations",
      count: noDonationCampaigns.length,
      detail: noDonationCampaigns.slice(0, 3).map(c => c.school_name).join(", "),
      href: "/admin/campaigns", actionLabel: "View Campaigns", icon: "💸",
    });
  }

  const donationsByCampaign = groupDonationsByCampaign(allDonations);
  const belowPaceCampaigns = campaigns.filter(c => {
    const raised = (donationsByCampaign[c.campaign_slug] ?? []).reduce((s, d) => s + d.amount_cents, 0);
    return calculateDonationPace(c.created_at, c.deadline, c.goal_cents, raised)?.belowPace ?? false;
  });
  if (belowPaceCampaigns.length > 0) {
    attention.push({
      id: "below-pace", severity: "warning", title: "Campaigns below fundraising pace",
      count: belowPaceCampaigns.length,
      detail: "Less than 50% of expected progress given time elapsed",
      href: "/admin/analytics", actionLabel: "Open Analytics", icon: "📉",
    });
    attention.push({
      id: "teams-at-risk", severity: "critical", title: "Teams at risk",
      count: belowPaceCampaigns.length,
      detail: "Review health scores for teams needing attention",
      href: "/admin/health", actionLabel: "Open Team Health", icon: "♥",
    });
  }

  if (pendingInvites.length > 0) {
    attention.push({
      id: "pending-invites", severity: "info", title: "Pending coach invitations",
      count: pendingInvites.length,
      detail: "Unused invite links awaiting activation",
      href: "/admin/campaigns", actionLabel: "View Campaigns", icon: "✉",
    });
  }

  if (crmFollowUpsDue.length > 0) {
    attention.push({
      id: "crm-follow-ups", severity: "info", title: "CRM follow-ups due",
      count: crmFollowUpsDue.length,
      detail: crmFollowUpsDue.slice(0, 3).map(c => c.name).join(", "),
      href: "/admin/crm", actionLabel: "Open Coach CRM", icon: "☎",
    });
  }

  const automationAlertCount = automationSummary.critical + automationSummary.warning;
  if (automationAlertCount > 0) {
    attention.push({
      id: "automation-events", severity: automationSummary.critical > 0 ? "critical" : "warning",
      title: "Automation Events", count: automationAlertCount,
      detail: `${automationSummary.critical} critical, ${automationSummary.warning} warning`,
      href: "/admin/automation", actionLabel: "Open Automation", icon: "⚡",
    });
  }

  if (jobSummary.lastRunStatus === "failed") {
    attention.push({
      id: "automation-run-failed", severity: "critical", title: "Latest automation run failed",
      detail: jobSummary.lastRunAt ? `Last attempted ${new Date(jobSummary.lastRunAt).toLocaleString()}` : undefined,
      href: "/admin/automation", actionLabel: "Open Automation", icon: "🚨",
    });
  }

  if (sponsorRenewalsDue.length > 0) {
    attention.push({
      id: "sponsor-renewals", severity: "info", title: "Sponsor renewals due",
      count: sponsorRenewalsDue.length,
      detail: sponsorRenewalsDue.slice(0, 3).map(s => s.business_name).join(", "),
      href: "/admin/sponsors", actionLabel: "Open Sponsor Directory", icon: "🏢",
    });
  }

  if (renewalForecast.overdue > 0) {
    attention.push({
      id: "sponsor-renewals-overdue", severity: "critical", title: "Sponsor renewals overdue",
      count: renewalForecast.overdue,
      detail: "Renewal dates have already passed",
      href: "/admin/sponsors/intelligence", actionLabel: "Open Sponsor Intelligence", icon: "🚨",
    });
  }

  if (inactiveMajorSponsors.length > 0) {
    attention.push({
      id: "sponsor-inactive-major", severity: "warning", title: "Inactive major sponsors",
      count: inactiveMajorSponsors.length,
      detail: inactiveMajorSponsors.slice(0, 3).map(s => s.business_name).join(", "),
      href: "/admin/sponsors/intelligence", actionLabel: "Open Sponsor Intelligence", icon: "😴",
    });
  }

  if (lostHighValueSponsors.length > 0) {
    attention.push({
      id: "sponsor-lost-high-value", severity: "warning", title: "Lost sponsors with high lifetime value",
      count: lostHighValueSponsors.length,
      detail: lostHighValueSponsors.slice(0, 3).map(s => s.business_name).join(", "),
      href: "/admin/sponsors/intelligence", actionLabel: "Open Sponsor Intelligence", icon: "💔",
    });
  }

  if (demoCheck.length === 0) {
    attention.push({
      id: "demo-missing", severity: "warning", title: "Demo environment not initialized",
      detail: "Sales demos will fail without the elf-demo campaign",
      href: "/admin/demo", actionLabel: "Initialize Demo", icon: "▶",
    });
  }

  const alertCount = attention.filter(a => a.severity === "critical" || a.severity === "warning").length;
  return { attention, alertCount };
}

export async function getTodayStats(): Promise<TodayStat[]> {
  const { todayStart } = todayWindow();
  const todayISO = todayStart.toISOString();

  const [todayDonations, todayMembers, todayMessages, auditSummary] = await Promise.all([
    getDonationsSince(todayISO, 1000),
    restList<{ id: string; role: string }>(`team_members?created_at=gte.${todayISO}&select=id,role&limit=500`),
    restList<{ id: string }>(`messages?created_at=gte.${todayISO}&select=id&limit=500`),
    getAuditSummary(todayISO),
  ]);

  const todayDonationTotal = todayDonations.reduce((s, d) => s + d.amount_cents, 0);

  return [
    {
      label: "New Donations", value: todayDonations.length, icon: "💳",
      sublabel: todayDonationTotal > 0
        ? `$${(todayDonationTotal / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : undefined,
      href: "/admin/campaigns",
    },
    { label: "New Registrations", value: todayMembers.length, icon: "👤", href: "/admin/accounts" },
    { label: "Messages Sent", value: todayMessages.length, icon: "💬" },
    {
      label: "Campaigns Created",
      value: auditSummary.campaignsCreated + auditSummary.campaignsDuplicated,
      icon: "🏕",
      sublabel: auditSummary.campaignsDuplicated > 0 ? `${auditSummary.campaignsDuplicated} duplicated` : undefined,
    },
    { label: "Exports Generated", value: auditSummary.exportsGenerated, icon: "📤", href: "/admin/exports" },
    { label: "Demo Activity", value: auditSummary.demoEvents, icon: "▶", href: "/admin/demo" },
  ];
}

export function getPlatformStatus(): PlatformServiceStatus[] {
  return [
    { name: "Supabase Database",  icon: "🗄", status: "operational", note: "Connected" },
    { name: "Stripe Payments",    icon: "💳", status: process.env.STRIPE_SECRET_KEY  ? "operational" : "unconfigured", note: process.env.STRIPE_SECRET_KEY  ? "Configured" : "Not configured" },
    { name: "Email (Resend)",     icon: "📧", status: process.env.RESEND_API_KEY     ? "operational" : "unconfigured", note: process.env.RESEND_API_KEY     ? "Configured" : "Not configured" },
    { name: "Push Notifications", icon: "🔔", status: "unknown", note: "Monitoring coming soon" },
    { name: "File Storage",       icon: "📦", status: "unknown", note: "Monitoring coming soon" },
  ];
}

export function getPendingItems(): PendingCategory[] {
  return [
    { label: "Coach Requests",        count: 0 },
    { label: "Booster Club Requests", count: 0 },
    { label: "Organization Requests", count: 0 },
  ];
}

export { getRecentAudit, getAuditSince };
