import { cookies }  from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/lib/adminAuth";
import { getContacts, getActivities, getPipelineSummary, getFollowUps } from "@/lib/platform/crm";
import CoachCrmView from "./CoachCrmView";
import type { CrmData } from "./types";

export const dynamic = "force-dynamic";

export default async function CoachCrmPage() {
  const store = await cookies();
  if (!verifyToken(store.get("elf_admin")?.value)) redirect("/admin");

  const [contacts, recentActivity, { summary, pipeline }, followUpsDue] = await Promise.all([
    getContacts(),
    getActivities(undefined, 20),
    getPipelineSummary(),
    getFollowUps(7),
  ]);

  const data: CrmData = { contacts, summary, pipeline, followUpsDue, recentActivity };

  return <CoachCrmView data={data} />;
}
