import { cookies }  from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/lib/adminAuth";
import {
  getSponsorScoringContext, getTopSponsors, getSponsorInsights, getRenewalForecast,
} from "@/lib/platform/sponsors";
import SponsorIntelligenceView from "./SponsorIntelligenceView";
import type { SponsorIntelligenceData } from "./types";

export const dynamic = "force-dynamic";

export default async function SponsorIntelligencePage() {
  const store = await cookies();
  if (!verifyToken(store.get("elf_admin")?.value)) redirect("/admin");

  // Fetch sponsors/relationships/activities/campaigns exactly once, then
  // derive top sponsors, insights, and the renewal forecast from that single
  // context instead of each function re-fetching independently.
  const ctx = await getSponsorScoringContext();

  const [allScored, insights, renewalForecast] = await Promise.all([
    getTopSponsors(ctx.sponsors.length, ctx),
    getSponsorInsights(10, ctx),
    getRenewalForecast(ctx),
  ]);

  const totalScored  = allScored.length;
  const averageScore = totalScored > 0 ? Math.round(allScored.reduce((s, r) => s + r.score, 0) / totalScored) : 0;

  const data: SponsorIntelligenceData = {
    topSponsors: allScored.slice(0, 10),
    insights,
    renewalForecast,
    campaigns: ctx.campaigns.map(c => ({
      campaign_slug: c.campaign_slug, school_name: c.school_name, sport_name: c.sport_name,
    })),
    totalScored,
    averageScore,
  };

  return <SponsorIntelligenceView data={data} />;
}
