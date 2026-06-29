import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { redirect } from "next/navigation";
import CampaignsView from "./CampaignsView";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

export type CampaignSummary = {
  campaign_slug:              string;
  school_name:                string;
  sport_name:                 string;
  season:                     string;
  location:                   string;
  primary_color:              string;
  secondary_color:            string;
  logo_url:                   string;
  goal_cents:                 number;
  deadline:                   string;
  archived:                   boolean;
  default_athlete_goal_cents: number | null;
  raised_cents:               number;
  donor_count:                number;
  athlete_count:              number;
};

export default async function CampaignsPage() {
  const store = await cookies();
  if (!verifyToken(store.get("elf_admin")?.value)) redirect("/admin");

  const [campaignsRes, donationsRes, athletesRes] = await Promise.all([
    fetch(`${BASE}/rest/v1/campaign_settings?select=campaign_slug,school_name,sport_name,season,location,primary_color,secondary_color,logo_url,goal_cents,deadline,archived,default_athlete_goal_cents&order=campaign_slug.asc`,
      { headers: h(), cache: "no-store" }),
    fetch(`${BASE}/rest/v1/donations?select=campaign_slug,amount_cents`, { headers: h(), cache: "no-store" }),
    fetch(`${BASE}/rest/v1/athletes?select=id,campaign_slug`, { headers: h(), cache: "no-store" }),
  ]);

  const campaigns: Omit<CampaignSummary, "raised_cents" | "donor_count" | "athlete_count">[] =
    campaignsRes.ok ? await campaignsRes.json() : [];
  const donations: { campaign_slug: string | null; amount_cents: number }[] =
    donationsRes.ok ? await donationsRes.json() : [];
  const athletes: { id: string; campaign_slug: string }[] =
    athletesRes.ok ? await athletesRes.json() : [];

  const raisedMap: Record<string, number> = {};
  const donorMap:  Record<string, number> = {};
  for (const d of donations) {
    if (!d.campaign_slug) continue;
    raisedMap[d.campaign_slug] = (raisedMap[d.campaign_slug] ?? 0) + d.amount_cents;
    donorMap[d.campaign_slug]  = (donorMap[d.campaign_slug]  ?? 0) + 1;
  }
  const athleteMap: Record<string, number> = {};
  for (const a of athletes) {
    athleteMap[a.campaign_slug] = (athleteMap[a.campaign_slug] ?? 0) + 1;
  }

  const enriched: CampaignSummary[] = campaigns.map(c => ({
    ...c,
    raised_cents:  raisedMap[c.campaign_slug] ?? 0,
    donor_count:   donorMap[c.campaign_slug]  ?? 0,
    athlete_count: athleteMap[c.campaign_slug] ?? 0,
  }));

  return <CampaignsView campaigns={enriched} />;
}
