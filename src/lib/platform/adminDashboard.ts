// Platform Admin dashboard counts. Server-only (service-role key via
// _client.ts); the /platform-admin layout has already verified the admin.
// A count that can't be loaded is null (shown as "—"), never a misleading 0.
import { restHeaders, restUrl } from "./_client";

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
