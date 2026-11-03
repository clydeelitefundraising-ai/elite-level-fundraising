// Platform Admin dashboard counts. Server-only (service-role key via
// _client.ts); the /platform-admin layout has already verified the admin.
// A count that can't be loaded is null (shown as "—"), never a misleading 0.
import { restHeaders, restUrl } from "./_client";
import { getAllReports } from "@/lib/moderation/reports";
import { listFundraisingInquiries, getCampaignContextsForSlugs } from "./fundraisingInquiries";
import { listAllSeasons } from "./schoolLinks";
import { getRecentAuditStrict } from "./audit";
import {
  ACTIVITY_LIMIT, buildActivity, buildInquiryGroup, buildModerationGroup, buildSchoolsGroup,
  type ActivitySection, type AttentionGroup,
} from "./adminDashboardView";

async function strictCount(path: string): Promise<number | null> {
  try {
    const res = await fetch(restUrl(path), { headers: restHeaders({ Prefer: "count=exact" }), cache: "no-store" });
    if (!res.ok) return null;
    const total = res.headers.get("content-range")?.split("/")[1];
    const n = total && total !== "*" ? parseInt(total, 10) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export type AdminDashboardCounts = {
  openReports: number | null;
  newInquiries: number | null;
  schools: number | null;
  teamSeasons: number | null;
};

export async function getAdminDashboardCounts(): Promise<AdminDashboardCounts> {
  const [openReports, newInquiries, schools, teamSeasons] = await Promise.all([
    strictCount("content_reports?status=eq.open&select=id&limit=1"),
    strictCount("fundraising_inquiries?status=eq.new&select=id&limit=1"),
    strictCount("organizations?select=id&limit=1"),
    strictCount("campaign_settings?select=campaign_slug&limit=1"),
  ]);
  return { openReports, newInquiries, schools, teamSeasons };
}

// ── Dashboard sections ─────────────────────────────────────────────────
// Built only from existing readers (all behind the /platform-admin gate):
// the strict counts above, getAllReports, listFundraisingInquiries,
// getCampaignContextsForSlugs, listAllSeasons and the recent-audit query.
// Each section fails on its own; the display rules live in
// adminDashboardView.ts.

export type AdminDashboardData = {
  counts: AdminDashboardCounts;
  attention: AttentionGroup[];
  activity: ActivitySection;
};

export async function getAdminDashboardData(now = new Date()): Promise<AdminDashboardData> {
  const [counts, reports, inquiries, seasons, audit] = await Promise.all([
    getAdminDashboardCounts(),
    getAllReports(),
    listFundraisingInquiries(),
    listAllSeasons().catch(() => null),
    getRecentAuditStrict(ACTIVITY_LIMIT).catch(() => null),
  ]);
  const slugs = [
    ...reports.filter(r => r.status === "open").map(r => r.campaign_slug),
    ...inquiries.filter(i => i.status === "new").map(i => i.campaign_slug),
  ];
  const teams = await getCampaignContextsForSlugs(slugs);
  return {
    counts,
    attention: [
      buildModerationGroup(counts.openReports, reports, teams, now),
      buildInquiryGroup(counts.newInquiries, inquiries, teams, now),
      buildSchoolsGroup(seasons),
    ],
    activity: buildActivity(audit, now),
  };
}
