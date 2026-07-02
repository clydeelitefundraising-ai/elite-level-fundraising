import { cookies }  from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/lib/adminAuth";
import { listEvents, getSummary } from "@/lib/platform/automation";
import { getCampaignSummary } from "@/lib/platform/campaigns";
import { restList } from "@/lib/platform/_client";
import AutomationView from "./AutomationView";
import type { AutomationEvent, AutomationData } from "./types";

export const dynamic = "force-dynamic";

type RawCoach = { id: string; name: string };

export default async function AutomationPage() {
  const store = await cookies();
  if (!verifyToken(store.get("elf_admin")?.value)) redirect("/admin");

  const [events, summary, campaigns, coaches] = await Promise.all([
    listEvents(),
    getSummary(),
    getCampaignSummary(),
    restList<RawCoach>("team_coaches?select=id,name&limit=2000"),
  ]);

  const campaignName = new Map(campaigns.map(c => [c.campaign_slug, c.school_name]));
  const coachName    = new Map(coaches.map(c => [c.id, c.name]));

  const enriched: AutomationEvent[] = events.map(e => ({
    ...e,
    campaignName: e.campaign_slug ? campaignName.get(e.campaign_slug) ?? e.campaign_slug : null,
    coachName:    e.coach_id ? coachName.get(e.coach_id) ?? null : null,
  }));

  const data: AutomationData = { events: enriched, summary };

  return <AutomationView data={data} />;
}
