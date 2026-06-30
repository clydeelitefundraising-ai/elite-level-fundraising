import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { redirect } from "next/navigation";
import ExportsView from "./ExportsView";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}` };
}

export type ExportCampaign = {
  campaign_slug: string;
  school_name:   string;
  sport_name:    string;
  season:        string;
  archived:      boolean;
};

export default async function ExportsPage() {
  const store = await cookies();
  if (!verifyToken(store.get("elf_admin")?.value)) redirect("/admin");

  const res = await fetch(
    `${BASE}/rest/v1/campaign_settings?select=campaign_slug,school_name,sport_name,season,archived&order=campaign_slug.asc`,
    { headers: h(), cache: "no-store" },
  );
  const campaigns: ExportCampaign[] = res.ok ? await res.json() : [];

  return <ExportsView campaigns={campaigns} />;
}
