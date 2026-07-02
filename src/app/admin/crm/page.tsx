import { cookies }  from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/lib/adminAuth";
import CoachCrmView from "./CoachCrmView";
import { CRM_STATUSES } from "./types";
import type { CrmContact, CrmActivity, CrmData, CrmSummary, CrmStatus } from "./types";

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
    return res.json() as Promise<T[]>;
  } catch {
    return [];
  }
}

export default async function CoachCrmPage() {
  const store = await cookies();
  if (!verifyToken(store.get("elf_admin")?.value)) redirect("/admin");

  const [contacts, recentActivity] = await Promise.all([
    safeFetch<CrmContact>(
      `${BASE}/rest/v1/coach_crm_contacts?select=*&order=created_at.desc&limit=2000`,
    ),
    safeFetch<CrmActivity>(
      `${BASE}/rest/v1/coach_crm_activities?select=*&order=activity_at.desc&limit=20`,
    ),
  ]);

  const now      = Date.now();
  const in7Days  = now + 7 * 86400000;

  const pipeline = CRM_STATUSES.reduce((acc, status) => {
    acc[status] = contacts.filter(c => c.status === status);
    return acc;
  }, {} as Record<CrmStatus, CrmContact[]>);

  const followUpsDue = contacts
    .filter(c => c.next_follow_up_at && new Date(c.next_follow_up_at).getTime() <= in7Days)
    .sort((a, b) => new Date(a.next_follow_up_at!).getTime() - new Date(b.next_follow_up_at!).getTime());

  const summary: CrmSummary = {
    totalContacts:     contacts.length,
    openProspects:     pipeline.prospect.length + pipeline.contacted.length,
    demosScheduled:    pipeline.demo_scheduled.length,
    proposalsSent:     pipeline.proposal_sent.length,
    signedActive:      pipeline.signed.length + pipeline.active.length + pipeline.returning.length,
    estimatedPipeline: contacts.reduce((sum, c) => sum + (c.estimated_value ?? 0), 0),
    followUpsDue:      followUpsDue.length,
  };

  const data: CrmData = { contacts, summary, pipeline, followUpsDue, recentActivity };

  return <CoachCrmView data={data} />;
}
