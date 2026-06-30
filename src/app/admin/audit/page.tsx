import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/lib/adminAuth";
import AuditView from "./AuditView";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function h() {
  return { apikey: KEY, Authorization: `Bearer ${KEY}` };
}

type CampaignOption = { campaign_slug: string; school_name: string };

export default async function AuditPage() {
  const store = await cookies();
  if (!verifyToken(store.get("elf_admin")?.value)) redirect("/admin");

  const res = await fetch(
    `${BASE}/rest/v1/campaign_settings?select=campaign_slug,school_name&order=campaign_slug.asc`,
    { headers: h(), cache: "no-store" },
  );

  const campaigns: CampaignOption[] = res.ok ? await res.json() : [];

  return <AuditView campaigns={campaigns} />;
}
