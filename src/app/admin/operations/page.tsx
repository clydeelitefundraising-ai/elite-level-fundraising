import { cookies }  from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/lib/adminAuth";
import OperationsView from "./OperationsView";
import type {
  OperationsData,
  AttentionItem,
  TodayStat,
  AuditEntry,
  PlatformService,
} from "./types";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function h() {
  return { apikey: KEY, Authorization: `Bearer ${KEY}` };
}

type Campaign = {
  campaign_slug: string;
  school_name:   string;
  sport_name:    string;
  goal_cents:    number;
  deadline:      string;
  created_at:    string;
};

async function safeFetch<T>(url: string): Promise<T[]> {
  try {
    const res = await fetch(url, { headers: h(), cache: "no-store" });
    if (!res.ok) return [];
    return res.json() as Promise<T[]>;
  } catch {
    return [];
  }
}

function isBelowPace(
  campaign: Pick<Campaign, "goal_cents" | "deadline" | "created_at">,
  raisedCents: number,
): boolean {
  const now     = Date.now();
  const start   = new Date(campaign.created_at).getTime();
  const end     = new Date(campaign.deadline).getTime();
  if (end <= now || end <= start) return false;
  const fraction = Math.max(0, (now - start) / (end - start));
  if (fraction < 0.25) return false;
  return raisedCents < campaign.goal_cents * fraction * 0.5;
}

export default async function OperationsPage() {
  const store = await cookies();
  if (!verifyToken(store.get("elf_admin")?.value)) redirect("/admin");

  const now        = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const todayISO   = todayStart.toISOString();
  const in3Days    = new Date(todayStart.getTime() + 3 * 86400000);
  const in7Days    = new Date(todayStart.getTime() + 7 * 86400000);

  const [
    campaigns,
    todayDonations,
    todayMembers,
    todayAuditLogs,
    recentAuditLogs,
    allDonations,
    pendingInvites,
    demoCheck,
    todayMessages,
    crmFollowUpsDue,
    automationAlerts,
  ] = await Promise.all([
    safeFetch<Campaign>(
      `${BASE}/rest/v1/campaign_settings?is_demo=eq.false&select=campaign_slug,school_name,sport_name,goal_cents,deadline,created_at&order=school_name.asc&limit=200`,
    ),
    safeFetch<{ campaign_slug: string; amount_cents: number }>(
      `${BASE}/rest/v1/donations?created_at=gte.${todayISO}&select=campaign_slug,amount_cents&limit=1000`,
    ),
    safeFetch<{ id: string; role: string }>(
      `${BASE}/rest/v1/team_members?created_at=gte.${todayISO}&select=id,role&limit=500`,
    ),
    safeFetch<{ id: string; action: string }>(
      `${BASE}/rest/v1/audit_logs?created_at=gte.${todayISO}&select=id,action&limit=300`,
    ),
    safeFetch<AuditEntry>(
      `${BASE}/rest/v1/audit_logs?select=id,action,campaign_slug,summary,admin_identifier,created_at&order=created_at.desc&limit=15`,
    ),
    safeFetch<{ campaign_slug: string; amount_cents: number }>(
      `${BASE}/rest/v1/donations?select=campaign_slug,amount_cents&limit=3000`,
    ),
    safeFetch<{ id: string; created_at: string }>(
      `${BASE}/rest/v1/coach_invite_tokens?used_at=is.null&select=id,created_at&limit=100`,
    ),
    safeFetch<{ campaign_slug: string }>(
      `${BASE}/rest/v1/campaign_settings?campaign_slug=eq.elf-demo&select=campaign_slug&limit=1`,
    ),
    safeFetch<{ id: string }>(
      `${BASE}/rest/v1/messages?created_at=gte.${todayISO}&select=id&limit=500`,
    ),
    safeFetch<{ id: string; name: string }>(
      `${BASE}/rest/v1/coach_crm_contacts?next_follow_up_at=lte.${in7Days.toISOString()}&select=id,name&limit=100`,
    ),
    safeFetch<{ id: string; severity: string; title: string }>(
      `${BASE}/rest/v1/automation_events?status=eq.open&severity=in.(critical,warning)&select=id,severity,title&limit=200`,
    ),
  ]);

  // ── Needs Attention ────────────────────────────────────────────────────────

  const attention: AttentionItem[] = [];

  const endingCritical = campaigns.filter(c => {
    const d = new Date(c.deadline);
    return d >= todayStart && d < in3Days;
  });
  if (endingCritical.length > 0) {
    attention.push({
      id:          "ending-critical",
      severity:    "critical",
      title:       "Campaigns ending within 3 days",
      count:       endingCritical.length,
      detail:      endingCritical.slice(0, 3).map(c => `${c.school_name} ${c.sport_name}`).join(", "),
      href:        "/admin/campaigns",
      actionLabel: "View Campaigns",
      icon:        "⏰",
    });
  }

  const endingWarning = campaigns.filter(c => {
    const d = new Date(c.deadline);
    return d >= in3Days && d < in7Days;
  });
  if (endingWarning.length > 0) {
    attention.push({
      id:          "ending-warning",
      severity:    "warning",
      title:       "Campaigns ending in 4–7 days",
      count:       endingWarning.length,
      detail:      endingWarning.slice(0, 3).map(c => `${c.school_name} ${c.sport_name}`).join(", "),
      href:        "/admin/campaigns",
      actionLabel: "View Campaigns",
      icon:        "📅",
    });
  }

  const slugsWithDonations = new Set(allDonations.map(d => d.campaign_slug));
  const noDonationCampaigns = campaigns.filter(c => !slugsWithDonations.has(c.campaign_slug));
  if (noDonationCampaigns.length > 0) {
    attention.push({
      id:          "no-donations",
      severity:    "warning",
      title:       "Campaigns with no donations",
      count:       noDonationCampaigns.length,
      detail:      noDonationCampaigns.slice(0, 3).map(c => c.school_name).join(", "),
      href:        "/admin/campaigns",
      actionLabel: "View Campaigns",
      icon:        "💸",
    });
  }

  const donationsByCampaign: Record<string, number> = {};
  for (const d of allDonations) {
    donationsByCampaign[d.campaign_slug] = (donationsByCampaign[d.campaign_slug] ?? 0) + d.amount_cents;
  }
  const belowPaceCampaigns = campaigns.filter(c =>
    isBelowPace(c, donationsByCampaign[c.campaign_slug] ?? 0),
  );
  if (belowPaceCampaigns.length > 0) {
    attention.push({
      id:          "below-pace",
      severity:    "warning",
      title:       "Campaigns below fundraising pace",
      count:       belowPaceCampaigns.length,
      detail:      "Less than 50% of expected progress given time elapsed",
      href:        "/admin/analytics",
      actionLabel: "Open Analytics",
      icon:        "📉",
    });
  }

  if (belowPaceCampaigns.length > 0) {
    attention.push({
      id:          "teams-at-risk",
      severity:    "critical",
      title:       "Teams at risk",
      count:       belowPaceCampaigns.length,
      detail:      "Review health scores for teams needing attention",
      href:        "/admin/health",
      actionLabel: "Open Team Health",
      icon:        "♥",
    });
  }

  if (pendingInvites.length > 0) {
    attention.push({
      id:          "pending-invites",
      severity:    "info",
      title:       "Pending coach invitations",
      count:       pendingInvites.length,
      detail:      "Unused invite links awaiting activation",
      href:        "/admin/campaigns",
      actionLabel: "View Campaigns",
      icon:        "✉",
    });
  }

  if (crmFollowUpsDue.length > 0) {
    attention.push({
      id:          "crm-follow-ups",
      severity:    "info",
      title:       "CRM follow-ups due",
      count:       crmFollowUpsDue.length,
      detail:      crmFollowUpsDue.slice(0, 3).map(c => c.name).join(", "),
      href:        "/admin/crm",
      actionLabel: "Open Coach CRM",
      icon:        "☎",
    });
  }

  const criticalAutomation = automationAlerts.filter(a => a.severity === "critical");
  const warningAutomation  = automationAlerts.filter(a => a.severity === "warning");
  if (automationAlerts.length > 0) {
    attention.push({
      id:          "automation-events",
      severity:    criticalAutomation.length > 0 ? "critical" : "warning",
      title:       "Automation Events",
      count:       automationAlerts.length,
      detail:      `${criticalAutomation.length} critical, ${warningAutomation.length} warning`,
      href:        "/admin/automation",
      actionLabel: "Open Automation",
      icon:        "⚡",
    });
  }

  if (demoCheck.length === 0) {
    attention.push({
      id:          "demo-missing",
      severity:    "warning",
      title:       "Demo environment not initialized",
      detail:      "Sales demos will fail without the elf-demo campaign",
      href:        "/admin/demo",
      actionLabel: "Initialize Demo",
      icon:        "▶",
    });
  }

  const alertCount = attention.filter(a => a.severity === "critical" || a.severity === "warning").length;

  // ── Today's Activity ───────────────────────────────────────────────────────

  const todayDonationTotal    = todayDonations.reduce((s, d) => s + d.amount_cents, 0);
  const campaignsCreatedToday = todayAuditLogs.filter(e => e.action === "campaign.created").length;
  const campaignsDupedToday   = todayAuditLogs.filter(e => e.action === "campaign.duplicated").length;
  const exportsToday          = todayAuditLogs.filter(e => e.action.startsWith("export.")).length;
  const demoEventsToday       = todayAuditLogs.filter(e => e.action.startsWith("demo.")).length;

  const todayStats: TodayStat[] = [
    {
      label:    "New Donations",
      value:    todayDonations.length,
      icon:     "💳",
      sublabel: todayDonationTotal > 0
        ? `$${(todayDonationTotal / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : undefined,
      href: "/admin/campaigns",
    },
    {
      label: "New Registrations",
      value: todayMembers.length,
      icon:  "👤",
      href:  "/admin/accounts",
    },
    {
      label: "Messages Sent",
      value: todayMessages.length,
      icon:  "💬",
    },
    {
      label:    "Campaigns Created",
      value:    campaignsCreatedToday + campaignsDupedToday,
      icon:     "🏕",
      sublabel: campaignsDupedToday > 0 ? `${campaignsDupedToday} duplicated` : undefined,
    },
    {
      label: "Exports Generated",
      value: exportsToday,
      icon:  "📤",
      href:  "/admin/exports",
    },
    {
      label: "Demo Activity",
      value: demoEventsToday,
      icon:  "▶",
      href:  "/admin/demo",
    },
  ];

  // ── Platform Status ────────────────────────────────────────────────────────

  const platformStatus: PlatformService[] = [
    { name: "Supabase Database",   icon: "🗄",  status: "operational",                                                               note: "Connected"            },
    { name: "Stripe Payments",     icon: "💳",  status: process.env.STRIPE_SECRET_KEY  ? "operational" : "unconfigured",            note: process.env.STRIPE_SECRET_KEY  ? "Configured" : "Not configured" },
    { name: "Email (Resend)",      icon: "📧",  status: process.env.RESEND_API_KEY     ? "operational" : "unconfigured",            note: process.env.RESEND_API_KEY     ? "Configured" : "Not configured" },
    { name: "Push Notifications",  icon: "🔔",  status: "unknown",                                                                   note: "Monitoring coming soon" },
    { name: "File Storage",        icon: "📦",  status: "unknown",                                                                   note: "Monitoring coming soon" },
  ];

  // ── Pending Items (placeholders) ───────────────────────────────────────────

  const pendingItems = [
    { label: "Coach Requests",        count: 0 },
    { label: "Booster Club Requests", count: 0 },
    { label: "Organization Requests", count: 0 },
  ];

  const data: OperationsData = {
    attention,
    todayStats,
    recentEvents:  recentAuditLogs,
    platformStatus,
    pendingItems,
    alertCount,
    generatedAt: now.toISOString(),
  };

  return <OperationsView data={data} />;
}
