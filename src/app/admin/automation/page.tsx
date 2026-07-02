import { cookies }  from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/lib/adminAuth";
import AutomationView from "./AutomationView";
import type { AutomationEvent, AutomationSummary, AutomationData } from "./types";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function h() {
  return { apikey: KEY, Authorization: `Bearer ${KEY}` };
}

async function safeFetch<T>(url: string): Promise<T[]> {
  try {
    const res = await fetch(url, { headers: h(), cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json) ? json : [];
  } catch {
    return [];
  }
}

type RawCampaign = { campaign_slug: string; school_name: string };
type RawCoach     = { id: string; name: string };

export default async function AutomationPage() {
  const store = await cookies();
  if (!verifyToken(store.get("elf_admin")?.value)) redirect("/admin");

  const [events, campaigns, coaches] = await Promise.all([
    safeFetch<AutomationEvent>(
      `${BASE}/rest/v1/automation_events?select=*&order=created_at.desc&limit=1000`,
    ),
    safeFetch<RawCampaign>(`${BASE}/rest/v1/campaign_settings?select=campaign_slug,school_name&limit=500`),
    safeFetch<RawCoach>(`${BASE}/rest/v1/team_coaches?select=id,name&limit=2000`),
  ]);

  const campaignName = new Map(campaigns.map(c => [c.campaign_slug, c.school_name]));
  const coachName    = new Map(coaches.map(c => [c.id, c.name]));

  const enriched: AutomationEvent[] = events.map(e => ({
    ...e,
    campaignName: e.campaign_slug ? campaignName.get(e.campaign_slug) ?? e.campaign_slug : null,
    coachName:    e.coach_id ? coachName.get(e.coach_id) ?? null : null,
  }));

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const summary: AutomationSummary = {
    open:          enriched.filter(e => e.status === "open").length,
    critical:      enriched.filter(e => e.status === "open" && e.severity === "critical").length,
    warning:       enriched.filter(e => e.status === "open" && e.severity === "warning").length,
    info:          enriched.filter(e => e.status === "open" && e.severity === "info").length,
    resolvedToday: enriched.filter(e => e.resolved_at && new Date(e.resolved_at) >= todayStart).length,
  };

  const data: AutomationData = { events: enriched, summary };

  return <AutomationView data={data} />;
}
