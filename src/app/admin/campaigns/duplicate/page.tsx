import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { redirect } from "next/navigation";
import DuplicateWizard from "./DuplicateWizard";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

export type CampaignOption = {
  campaign_slug:  string;
  school_name:    string;
  sport_name:     string;
  season:         string;
  location:       string;
  primary_color:  string;
  archived:       boolean;
};

type Props = { searchParams: Promise<{ source?: string }> };

export default async function DuplicateCampaignPage({ searchParams }: Props) {
  const store = await cookies();
  if (!verifyToken(store.get("elf_admin")?.value)) redirect("/admin");

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const h   = { apikey: key, Authorization: `Bearer ${key}` };

  const res = await fetch(
    `${BASE}/rest/v1/campaign_settings?select=campaign_slug,school_name,sport_name,season,location,primary_color,archived&order=campaign_slug.asc`,
    { headers: h, cache: "no-store" },
  );

  const campaigns: CampaignOption[] = res.ok ? await res.json() : [];
  const { source } = await searchParams;

  return <DuplicateWizard campaigns={campaigns} initialSourceSlug={source ?? ""} />;
}
