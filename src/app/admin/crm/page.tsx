import { cookies }  from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/lib/adminAuth";
import { getContacts, getActivities, getPipelineSummary, getFollowUps } from "@/lib/platform/crm";
import { getCampaignsByCrmContact } from "@/lib/platform/campaigns";
import CoachCrmView from "./CoachCrmView";
import type { CrmData } from "./types";

export const dynamic = "force-dynamic";

export default async function CoachCrmPage() {
  const store = await cookies();
  if (!verifyToken(store.get("elf_admin")?.value)) redirect("/admin");

  const [contacts, recentActivity, { summary, pipeline }, followUpsDue, linkedCampaigns] = await Promise.all([
    getContacts(),
    getActivities(undefined, 20),
    getPipelineSummary(),
    getFollowUps(7),
    getCampaignsByCrmContact(),
  ]);

  const launchedCampaigns = Object.fromEntries(
    linkedCampaigns.map(c => [c.crm_contact_id, c.campaign_slug]),
  );

  const data: CrmData = { contacts, summary, pipeline, followUpsDue, recentActivity, launchedCampaigns };

  return <CoachCrmView data={data} />;
}
