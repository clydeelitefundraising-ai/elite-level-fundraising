import { restList, restInsert, restUpdate } from "./_client";

export type CrmStatus =
  | "prospect" | "contacted" | "demo_scheduled" | "proposal_sent"
  | "signed" | "active" | "returning" | "lost";

export const CRM_STATUSES: CrmStatus[] = [
  "prospect", "contacted", "demo_scheduled", "proposal_sent", "signed", "active", "returning", "lost",
];

export type CrmActivityType =
  | "note" | "call" | "email" | "text" | "demo" | "proposal" | "follow_up" | "status_change";

export const CRM_ACTIVITY_TYPES: CrmActivityType[] = [
  "note", "call", "email", "text", "demo", "proposal", "follow_up", "status_change",
];

// Activity types that count as meaningful contact with the coach.
const CONTACT_TYPES = new Set<CrmActivityType>(["call", "email", "text", "demo", "proposal", "note", "follow_up"]);

export type CrmContact = {
  id:                  string;
  name:                string;
  email:               string | null;
  phone:               string | null;
  school_name:         string | null;
  sport:               string | null;
  city:                string | null;
  state:               string | null;
  status:              CrmStatus;
  source:              string | null;
  estimated_value:     number | null;
  expected_close_date: string | null;
  last_contacted_at:   string | null;
  next_follow_up_at:   string | null;
  notes:               string | null;
  demo_request_id:     string | null;
  created_at:          string;
  updated_at:          string;
};

export type CrmActivity = {
  id:            string;
  contact_id:    string;
  activity_type: CrmActivityType;
  title:         string;
  body:          string | null;
  activity_at:   string;
  created_at:    string;
};

export type CrmPipelineSummary = {
  totalContacts:      number;
  openProspects:      number;
  demosScheduled:     number;
  proposalsSent:      number;
  signedActive:       number;
  estimatedPipeline:  number;
  followUpsDue:       number;
  newThisWeek:        number;
};

export async function getContacts(): Promise<CrmContact[]> {
  return restList<CrmContact>("coach_crm_contacts?select=*&order=created_at.desc&limit=2000");
}

export async function getContact(id: string): Promise<CrmContact | null> {
  const rows = await restList<CrmContact>(
    `coach_crm_contacts?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
  );
  return rows[0] ?? null;
}

// Targeted lookup for duplicate-conversion detection — do not use getContacts()
// + an in-memory filter for this. The partial unique index on demo_request_id
// is the authoritative concurrency guard; this is only for a friendly response.
export async function getContactByDemoRequestId(demoRequestId: string): Promise<CrmContact | null> {
  const rows = await restList<CrmContact>(
    `coach_crm_contacts?demo_request_id=eq.${encodeURIComponent(demoRequestId)}&select=*&limit=1`,
  );
  return rows[0] ?? null;
}

export type CreateContactInput = Partial<Omit<CrmContact, "id" | "created_at" | "updated_at">> & { name: string };

export async function createContact(input: CreateContactInput): Promise<CrmContact> {
  const rows = await restInsert<CrmContact>("coach_crm_contacts", {
    name:                input.name,
    email:               input.email ?? null,
    phone:               input.phone ?? null,
    school_name:         input.school_name ?? null,
    sport:               input.sport ?? null,
    city:                input.city ?? null,
    state:               input.state ?? "AZ",
    status:              input.status ?? "prospect",
    source:              input.source ?? null,
    estimated_value:     input.estimated_value ?? null,
    expected_close_date: input.expected_close_date ?? null,
    next_follow_up_at:   input.next_follow_up_at ?? null,
    notes:               input.notes ?? null,
    demo_request_id:     input.demo_request_id ?? null,
  });
  return rows[0];
}

export type UpdateContactInput = Partial<Omit<CrmContact, "id" | "created_at" | "updated_at">>;

// Generic contact patch. When `status` changes, automatically records a
// `status_change` activity — same behavior the CRM UI has always relied on.
export async function updateContact(id: string, patch: UpdateContactInput): Promise<CrmContact> {
  const prior = await getContact(id);
  if (!prior) throw new Error("Contact not found.");

  const rows = await restUpdate<CrmContact>(
    `coach_crm_contacts?id=eq.${encodeURIComponent(id)}`,
    { ...patch, updated_at: new Date().toISOString() },
  );
  const contact = rows[0];

  if (patch.status && patch.status !== prior.status) {
    await createActivity({
      contact_id:    id,
      activity_type: "status_change",
      title:         `Status changed: ${prior.status} → ${patch.status}`,
    }).catch(() => {});
  }

  return contact;
}

export async function updateStatus(id: string, status: CrmStatus): Promise<CrmContact> {
  return updateContact(id, { status });
}

export async function getActivities(contactId?: string, limit = 500): Promise<CrmActivity[]> {
  const filter = contactId ? `&contact_id=eq.${encodeURIComponent(contactId)}` : "";
  return restList<CrmActivity>(`coach_crm_activities?select=*&order=activity_at.desc&limit=${limit}${filter}`);
}

export type CreateActivityInput = {
  contact_id:    string;
  activity_type: CrmActivityType;
  title:         string;
  body?:         string | null;
};

export async function createActivity(input: CreateActivityInput): Promise<CrmActivity> {
  const rows = await restInsert<CrmActivity>("coach_crm_activities", {
    contact_id:    input.contact_id,
    activity_type: input.activity_type,
    title:         input.title,
    body:          input.body ?? null,
  });
  const activity = rows[0];

  if (CONTACT_TYPES.has(input.activity_type)) {
    await restUpdate("coach_crm_contacts?id=eq." + encodeURIComponent(input.contact_id), {
      last_contacted_at: new Date().toISOString(),
    }).catch(() => {});
  }

  return activity;
}

export async function getPipelineSummary(): Promise<{
  summary:  CrmPipelineSummary;
  pipeline: Record<CrmStatus, CrmContact[]>;
}> {
  const contacts = await getContacts();
  const pipeline = CRM_STATUSES.reduce((acc, status) => {
    acc[status] = contacts.filter(c => c.status === status);
    return acc;
  }, {} as Record<CrmStatus, CrmContact[]>);

  const followUpsDue = await getFollowUps(7);
  const weekAgo = Date.now() - 7 * 86400000;

  const summary: CrmPipelineSummary = {
    totalContacts:     contacts.length,
    openProspects:     pipeline.prospect.length + pipeline.contacted.length,
    demosScheduled:    pipeline.demo_scheduled.length,
    proposalsSent:     pipeline.proposal_sent.length,
    signedActive:      pipeline.signed.length + pipeline.active.length + pipeline.returning.length,
    estimatedPipeline: contacts.reduce((sum, c) => sum + (c.estimated_value ?? 0), 0),
    followUpsDue:      followUpsDue.length,
    newThisWeek:       contacts.filter(c => new Date(c.created_at).getTime() >= weekAgo).length,
  };

  return { summary, pipeline };
}

// Contacts whose next follow-up falls on or before `now + withinDays`.
// withinDays=0 means "due today or overdue" — used by the automation rule.
export async function getFollowUps(
  withinDays: number,
  opts: { excludeLost?: boolean } = {},
): Promise<CrmContact[]> {
  const contacts = await getContacts();
  const cutoff = Date.now() + withinDays * 86400000;
  return contacts
    .filter(c => c.next_follow_up_at && new Date(c.next_follow_up_at).getTime() <= cutoff)
    .filter(c => !opts.excludeLost || c.status !== "lost")
    .sort((a, b) => new Date(a.next_follow_up_at!).getTime() - new Date(b.next_follow_up_at!).getTime());
}
