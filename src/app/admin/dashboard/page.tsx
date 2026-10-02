import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { redirect } from "next/navigation";
import DashboardView from "./DashboardView";
import { getNeedsAttention } from "@/lib/platform/operations";
import { calculateHealth, calculateRevenueForecast } from "@/lib/platform/health";
import { getAllDonations, getDonationSummary, calculateDonationMomentum } from "@/lib/platform/donations";
import { getPipelineSummary } from "@/lib/platform/crm";
import { getSponsorSummary } from "@/lib/platform/sponsors";
import { getQueueSummary } from "@/lib/platform/notifications";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

// Same estimate/override convention as /admin/executive — no fee schedule is
// configured in the schema yet, so this stays a clearly-labeled estimate.
const ELF_FEE_RATE = Number(process.env.ELF_PLATFORM_FEE_RATE) || 0.08;

function h() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

async function countRows(table: string, filter = ""): Promise<number> {
  const res = await fetch(
    `${BASE}/rest/v1/${table}?select=id${filter}&limit=1`,
    { headers: { ...h(), Prefer: "count=exact" }, cache: "no-store" },
  );
  const range = res.headers.get("content-range");
  if (!range) return 0;
  const total = range.split("/")[1];
  return total === "*" ? 0 : parseInt(total, 10) || 0;
}

export default async function DashboardPage() {
  const store = await cookies();
  if (!verifyToken(store.get("elf_admin")?.value)) redirect("/admin");

  // Phase 1 (Dashboard simplification): every number below comes from an
  // existing shared lib/platform/* function already used by Operations,
  // Team Health, and Executive — nothing here re-implements a calculation
  // that already exists elsewhere. calculateHealth() already fetches
  // campaigns internally (same convention as Executive), so the previous
  // ad-hoc campaign_settings fetch is replaced by deriving counts from its
  // `teams` array instead of a second, independent query.
  const [
    { attention, alertCount },
    health,
    allDonations,
    totalAthletes, totalMembers, totalContacts,
    pipeline, sponsorSummary, notificationQueueSummary,
  ] = await Promise.all([
    getNeedsAttention(),
    calculateHealth(),
    getAllDonations(),
    countRows("athletes"),
    countRows("team_members"),
    countRows("fundraising_contacts"),
    getPipelineSummary(),
    getSponsorSummary(),
    getQueueSummary(),
  ]);

  const { teams } = health;
  const totalCampaigns  = teams.length;
  const activeCampaigns = teams.filter(t => !t.archived).length;

  const donationSummary = getDonationSummary(allDonations);
  const momentum7  = calculateDonationMomentum(allDonations, 7);
  const momentum30 = calculateDonationMomentum(allDonations, 30);

  const forecast = calculateRevenueForecast(teams, ELF_FEE_RATE);
  const forecastableCount = forecast.likelyToHitGoal + forecast.unlikelyToHitGoal;

  const notifDelivered = notificationQueueSummary.sent + notificationQueueSummary.failed;
  const notificationHealth = {
    queued:              notificationQueueSummary.queued,
    failed:              notificationQueueSummary.failed,
    deliverySuccessRate: notifDelivered > 0 ? Math.round((notificationQueueSummary.sent / notifDelivered) * 100) : null,
  };

  return (
    <DashboardView
      attention={attention}
      alertCount={alertCount}
      totalCampaigns={totalCampaigns}
      activeCampaigns={activeCampaigns}
      totalDonations={donationSummary.totalDonations}
      totalRaisedCents={donationSummary.totalRaisedCents}
      totalAthletes={totalAthletes}
      totalMembers={totalMembers}
      totalContacts={totalContacts}
      momentum7={momentum7}
      momentum30={momentum30}
      forecastableCount={forecastableCount}
      likelyToHitGoal={forecast.likelyToHitGoal}
      projectedPlatformRevenueCents={forecast.projectedPlatformRevenueCents}
      pipelineSummary={pipeline.summary}
      sponsorSummary={sponsorSummary}
      notificationHealth={notificationHealth}
    />
  );
}
