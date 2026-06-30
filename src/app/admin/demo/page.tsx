import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/lib/adminAuth";
import DemoView from "./DemoView";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function h() {
  return { apikey: KEY, Authorization: `Bearer ${KEY}` };
}

export type DemoCampaign = {
  campaign_slug: string;
  school_name:   string;
  sport_name:    string;
  mascot:        string;
  season:        string;
  created_at:    string;
  demo_template: string | null;
  primary_color: string;
};

export default async function DemoPage() {
  const store = await cookies();
  if (!verifyToken(store.get("elf_admin")?.value)) redirect("/admin");

  let demos: DemoCampaign[] = [];
  try {
    const res = await fetch(
      `${BASE}/rest/v1/campaign_settings?is_demo=eq.true&select=campaign_slug,school_name,sport_name,mascot,season,created_at,demo_template,primary_color&order=created_at.desc`,
      { headers: h(), cache: "no-store" },
    );
    if (res.ok) demos = await res.json();
  } catch {
    // Non-fatal — show empty state
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  return <DemoView demos={demos} appUrl={appUrl} />;
}
