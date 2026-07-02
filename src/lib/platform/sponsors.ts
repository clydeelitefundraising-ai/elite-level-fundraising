import { restList, restInsert, restUpdate } from "./_client";

export type SponsorStatus = "prospect" | "contacted" | "active" | "recurring" | "paused" | "lost";

export const SPONSOR_STATUSES: SponsorStatus[] = [
  "prospect", "contacted", "active", "recurring", "paused", "lost",
];

export type SponsorActivityType =
  | "note" | "call" | "email" | "meeting" | "sponsorship" | "renewal" | "status_change";

export const SPONSOR_ACTIVITY_TYPES: SponsorActivityType[] = [
  "note", "call", "email", "meeting", "sponsorship", "renewal", "status_change",
];

export type SponsorBusiness = {
  id:                          string;
  business_name:               string;
  contact_name:                string | null;
  contact_email:               string | null;
  contact_phone:               string | null;
  website:                     string | null;
  industry:                    string | null;
  city:                        string | null;
  state:                       string | null;
  address:                     string | null;
  preferred_sports:            string[];
  preferred_sponsorship_level: string | null;
  estimated_annual_budget:     number | null;
  lifetime_value:              number;
  last_sponsored_at:           string | null;
  next_renewal_at:             string | null;
  status:                      SponsorStatus;
  source:                      string | null;
  notes:                       string | null;
  created_at:                  string;
  updated_at:                  string;
};

export type SponsorActivity = {
  id:            string;
  business_id:   string;
  activity_type: SponsorActivityType;
  title:         string;
  body:          string | null;
  activity_at:   string;
  created_at:    string;
};

export type SponsorRelationship = {
  id:                 string;
  business_id:        string;
  campaign_slug:      string | null;
  sponsorship_amount: number | null;
  sponsorship_level:  string | null;
  sponsored_at:       string;
  notes:              string | null;
  created_at:         string;
};

export type SponsorSummary = {
  totalBusinesses:            number;
  activeSponsors:             number;
  recurringSponsors:          number;
  prospectSponsors:           number;
  estimatedAnnualBudgetCents: number;
  lifetimeValueCents:         number;
  renewalsDue:                number;
};

export async function getSponsors(): Promise<SponsorBusiness[]> {
  return restList<SponsorBusiness>("sponsor_businesses?select=*&order=created_at.desc&limit=2000");
}

export async function getSponsor(id: string): Promise<SponsorBusiness | null> {
  const rows = await restList<SponsorBusiness>(
    `sponsor_businesses?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
  );
  return rows[0] ?? null;
}

export type CreateSponsorInput = Partial<Omit<SponsorBusiness, "id" | "created_at" | "updated_at" | "lifetime_value">> & {
  business_name: string;
};

export async function createSponsor(input: CreateSponsorInput): Promise<SponsorBusiness> {
  const rows = await restInsert<SponsorBusiness>("sponsor_businesses", {
    business_name:               input.business_name,
    contact_name:                input.contact_name ?? null,
    contact_email:                input.contact_email ?? null,
    contact_phone:                input.contact_phone ?? null,
    website:                     input.website ?? null,
    industry:                    input.industry ?? null,
    city:                        input.city ?? null,
    state:                       input.state ?? "AZ",
    address:                     input.address ?? null,
    preferred_sports:            input.preferred_sports ?? [],
    preferred_sponsorship_level: input.preferred_sponsorship_level ?? null,
    estimated_annual_budget:     input.estimated_annual_budget ?? null,
    next_renewal_at:             input.next_renewal_at ?? null,
    status:                      input.status ?? "prospect",
    source:                      input.source ?? null,
    notes:                       input.notes ?? null,
  });
  return rows[0];
}

export type UpdateSponsorInput = Partial<Omit<SponsorBusiness, "id" | "created_at" | "updated_at">>;

// Generic patch. When `status` changes, automatically records a
// `status_change` activity — same convention as the Coach CRM service.
export async function updateSponsor(id: string, patch: UpdateSponsorInput): Promise<SponsorBusiness> {
  const prior = await getSponsor(id);
  if (!prior) throw new Error("Sponsor not found.");

  const rows = await restUpdate<SponsorBusiness>(
    `sponsor_businesses?id=eq.${encodeURIComponent(id)}`,
    { ...patch, updated_at: new Date().toISOString() },
  );
  const sponsor = rows[0];

  if (patch.status && patch.status !== prior.status) {
    await createSponsorActivity({
      business_id:   id,
      activity_type: "status_change",
      title:         `Status changed: ${prior.status} → ${patch.status}`,
    }).catch(() => {});
  }

  return sponsor;
}

export async function getSponsorActivities(businessId?: string, limit = 500): Promise<SponsorActivity[]> {
  const filter = businessId ? `&business_id=eq.${encodeURIComponent(businessId)}` : "";
  return restList<SponsorActivity>(`sponsor_activities?select=*&order=activity_at.desc&limit=${limit}${filter}`);
}

export type CreateSponsorActivityInput = {
  business_id:   string;
  activity_type: SponsorActivityType;
  title:         string;
  body?:         string | null;
};

export async function createSponsorActivity(input: CreateSponsorActivityInput): Promise<SponsorActivity> {
  const rows = await restInsert<SponsorActivity>("sponsor_activities", {
    business_id:   input.business_id,
    activity_type: input.activity_type,
    title:         input.title,
    body:          input.body ?? null,
  });
  return rows[0];
}

export async function getSponsorRelationships(businessId?: string, limit = 500): Promise<SponsorRelationship[]> {
  const filter = businessId ? `&business_id=eq.${encodeURIComponent(businessId)}` : "";
  return restList<SponsorRelationship>(
    `sponsor_relationships?select=*&order=sponsored_at.desc&limit=${limit}${filter}`,
  );
}

export type CreateSponsorRelationshipInput = {
  business_id:        string;
  campaign_slug?:     string | null;
  sponsorship_amount?: number | null;
  sponsorship_level?: string | null;
  notes?:             string | null;
};

// Creating a relationship is the moment a sponsorship becomes real: bumps
// lifetime_value, stamps last_sponsored_at, promotes prospects to active,
// and logs a `sponsorship` activity — mirrors Coach CRM's status_change wiring.
export async function createSponsorRelationship(input: CreateSponsorRelationshipInput): Promise<SponsorRelationship> {
  const business = await getSponsor(input.business_id);
  if (!business) throw new Error("Sponsor not found.");

  const rows = await restInsert<SponsorRelationship>("sponsor_relationships", {
    business_id:        input.business_id,
    campaign_slug:      input.campaign_slug ?? null,
    sponsorship_amount: input.sponsorship_amount ?? null,
    sponsorship_level:  input.sponsorship_level ?? null,
    notes:              input.notes ?? null,
  });
  const relationship = rows[0];

  const amount = input.sponsorship_amount ?? 0;
  const now = new Date().toISOString();
  const nextStatus: SponsorStatus = business.status === "prospect" || business.status === "contacted"
    ? "active" : business.status;

  await restUpdate(`sponsor_businesses?id=eq.${encodeURIComponent(input.business_id)}`, {
    lifetime_value:     (business.lifetime_value ?? 0) + amount,
    last_sponsored_at:  now,
    status:             nextStatus,
    updated_at:         now,
  }).catch(() => {});

  await createSponsorActivity({
    business_id:   input.business_id,
    activity_type: "sponsorship",
    title:         input.campaign_slug
      ? `Sponsorship recorded for campaign "${input.campaign_slug}"`
      : "Sponsorship recorded",
    body: amount > 0 ? `Amount: $${(amount / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : null,
  }).catch(() => {});

  return relationship;
}

export async function getRenewalsDue(withinDays = 30): Promise<SponsorBusiness[]> {
  const sponsors = await getSponsors();
  const cutoff = Date.now() + withinDays * 86400000;
  return sponsors
    .filter(s => s.next_renewal_at && new Date(s.next_renewal_at).getTime() <= cutoff)
    .sort((a, b) => new Date(a.next_renewal_at!).getTime() - new Date(b.next_renewal_at!).getTime());
}

export async function getSponsorSummary(): Promise<SponsorSummary> {
  const sponsors = await getSponsors();
  const renewalsDue = await getRenewalsDue(30);

  return {
    totalBusinesses:            sponsors.length,
    activeSponsors:             sponsors.filter(s => s.status === "active").length,
    recurringSponsors:          sponsors.filter(s => s.status === "recurring").length,
    prospectSponsors:           sponsors.filter(s => s.status === "prospect").length,
    estimatedAnnualBudgetCents: sponsors.reduce((sum, s) => sum + (s.estimated_annual_budget ?? 0), 0),
    lifetimeValueCents:         sponsors.reduce((sum, s) => sum + (s.lifetime_value ?? 0), 0),
    renewalsDue:                renewalsDue.length,
  };
}
