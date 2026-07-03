const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function headers(key: string, extra?: Record<string, string>) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

export type DonationRow = {
  id: string;
  stripe_session_id: string;
  donor_name: string | null;
  amount_cents: number;
  athlete_name: string | null;
  athlete_id?: string | null;
  donation_message: string | null;
  campaign_slug?: string | null;
  created_at: string;
};

export async function insertDonation(
  data: Omit<DonationRow, "id" | "created_at">,
): Promise<void> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(`${BASE}/rest/v1/donations?on_conflict=stripe_session_id`, {
    method: "POST",
    headers: headers(key, { Prefer: "resolution=ignore-duplicates" }),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`Supabase insert failed (${res.status}): ${msg}`);
  }
}

export async function donationExists(sessionId: string): Promise<boolean> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(
    `${BASE}/rest/v1/donations?select=id&stripe_session_id=eq.${encodeURIComponent(sessionId)}&limit=1`,
    { headers: headers(key), cache: "no-store" },
  );
  if (!res.ok) return false;
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0;
}

export type CampaignSettings = {
  campaign_slug: string;
  team_id?: string;
  school_name: string;
  sport_name: string;
  mascot: string;
  goal_cents: number;
  deadline: string;
  primary_color: string;
  secondary_color: string;
  location: string;
  season: string;
  logo_url: string;
  archived?: boolean;
  show_leaderboard?: boolean;
  show_program_identity?: boolean;
  show_share_section?: boolean;
  show_fund_uses?: boolean;
  show_recent_donations?: boolean;
  show_sponsors?: boolean;
  show_donation_card?: boolean;
  layout_variant?:      "classic" | "premium";
  team_photo?:          string;
  external_store_url?:          string | null;
  store_provider?:              string | null;
  default_athlete_goal_cents?:  number | null;
};

// Class levels shown as the primary athlete attribute in the UI. `event`
// (sport event/position, e.g. "Sprints") remains the sport-specific field —
// stored and editable, just secondary in display now.
export const ATHLETE_CLASS_OPTIONS = ["Freshman", "Sophomore", "Junior", "Senior"] as const;
export type AthleteClass = typeof ATHLETE_CLASS_OPTIONS[number];

export type AthleteRow = {
  id: string;
  campaign_slug: string;
  name: string;
  event: string;
  class_year?: string | null;
  created_at: string;
  contact_phone: string | null;
  contact_email: string | null;
};

export type SponsorRow = {
  id: string;
  campaign_slug: string;
  name: string;
  url: string;
  tier: "title" | "platinum" | "gold" | "silver" | "bronze" | "community_partner";
  logo_url: string | null;
  description: string | null;
  display_order: number;
  visible: boolean;
  sponsorship_amount_cents: number | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  created_at: string;
};

export async function getCampaignSettings(slug: string): Promise<CampaignSettings | null> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(
    `${BASE}/rest/v1/campaign_settings?campaign_slug=eq.${encodeURIComponent(slug)}&limit=1`,
    { headers: headers(key), cache: "no-store" },
  );
  if (!res.ok) return null;
  const rows: CampaignSettings[] = await res.json();
  return rows[0] ?? null;
}

export async function createCampaignSettings(data: CampaignSettings): Promise<void> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(
    `${BASE}/rest/v1/campaign_settings?on_conflict=campaign_slug`,
    {
      method: "POST",
      headers: headers(key, { Prefer: "resolution=ignore-duplicates,return=representation" }),
      body: JSON.stringify(data),
    },
  );
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`Supabase insert failed (${res.status}): ${msg}`);
  }
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`Campaign slug "${data.campaign_slug}" already exists.`);
  }
}

export async function updateCampaignSettings(
  slug: string,
  data: Partial<Omit<CampaignSettings, "campaign_slug">>,
): Promise<void> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const bodyStr = JSON.stringify(data);
  console.log("[updateCampaignSettings] slug:", slug);
  console.log("[updateCampaignSettings] body:", bodyStr);
  const res = await fetch(
    `${BASE}/rest/v1/campaign_settings?campaign_slug=eq.${encodeURIComponent(slug)}`,
    {
      method: "PATCH",
      headers: headers(key, { Prefer: "return=minimal" }),
      body: bodyStr,
    },
  );
  const resText = await res.text();
  console.log("[updateCampaignSettings] response status:", res.status, "body:", resText);
  if (!res.ok) {
    throw new Error(`Supabase update failed (${res.status}): ${resText}`);
  }
}

export async function getAthletes(slug: string): Promise<AthleteRow[]> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(
    `${BASE}/rest/v1/athletes?campaign_slug=eq.${encodeURIComponent(slug)}&order=created_at.asc`,
    { headers: headers(key), cache: "no-store" },
  );
  if (!res.ok) return [];
  return res.json();
}

export async function addAthlete(data: Omit<AthleteRow, "id" | "created_at">): Promise<AthleteRow> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(`${BASE}/rest/v1/athletes`, {
    method: "POST",
    headers: headers(key, { Prefer: "return=representation" }),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`Supabase insert failed (${res.status}): ${msg}`);
  }
  const rows: AthleteRow[] = await res.json();
  return rows[0];
}

export async function updateAthlete(id: string, data: { name: string; event: string; class_year?: string | null }): Promise<void> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(
    `${BASE}/rest/v1/athletes?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: headers(key, { Prefer: "return=minimal" }),
      body: JSON.stringify(data),
    },
  );
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`Supabase update failed (${res.status}): ${msg}`);
  }
}

export async function deleteAthlete(id: string): Promise<void> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(
    `${BASE}/rest/v1/athletes?id=eq.${encodeURIComponent(id)}`,
    { method: "DELETE", headers: headers(key, { Prefer: "return=minimal" }) },
  );
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`Supabase delete failed (${res.status}): ${msg}`);
  }
}

export async function getSponsors(slug: string): Promise<SponsorRow[]> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(
    `${BASE}/rest/v1/sponsors?campaign_slug=eq.${encodeURIComponent(slug)}&visible=eq.true&order=display_order.asc,created_at.asc`,
    { headers: headers(key), cache: "no-store" },
  );
  if (!res.ok) return [];
  return res.json();
}

export async function addSponsor(data: Pick<SponsorRow, "campaign_slug" | "name" | "url" | "tier"> & Partial<Omit<SponsorRow, "id" | "created_at" | "campaign_slug" | "name" | "url" | "tier">>): Promise<SponsorRow> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(`${BASE}/rest/v1/sponsors`, {
    method: "POST",
    headers: headers(key, { Prefer: "return=representation" }),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`Supabase insert failed (${res.status}): ${msg}`);
  }
  const rows: SponsorRow[] = await res.json();
  return rows[0];
}

export async function updateSponsor(
  id: string,
  data: Partial<Omit<SponsorRow, "id" | "campaign_slug" | "created_at">>,
): Promise<void> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(
    `${BASE}/rest/v1/sponsors?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: headers(key, { Prefer: "return=minimal" }),
      body: JSON.stringify(data),
    },
  );
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`Supabase update failed (${res.status}): ${msg}`);
  }
}

export async function deleteSponsor(id: string): Promise<void> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(
    `${BASE}/rest/v1/sponsors?id=eq.${encodeURIComponent(id)}`,
    { method: "DELETE", headers: headers(key, { Prefer: "return=minimal" }) },
  );
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`Supabase delete failed (${res.status}): ${msg}`);
  }
}

export async function getAllCampaignSlugs(): Promise<{ campaign_slug: string; archived: boolean }[]> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(
    `${BASE}/rest/v1/campaign_settings?select=campaign_slug,archived&order=campaign_slug.asc`,
    { headers: headers(key), cache: "no-store" },
  );
  if (!res.ok) return [];
  const rows: { campaign_slug: string; archived: boolean }[] = await res.json();
  return rows;
}

export type FundUseRow = {
  id: string;
  campaign_slug: string;
  title: string;
  description: string;
  icon: string;
  sort_order: number;
  created_at: string;
};

export async function getFundUses(slug: string): Promise<FundUseRow[]> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(
    `${BASE}/rest/v1/fund_uses?campaign_slug=eq.${encodeURIComponent(slug)}&order=sort_order.asc`,
    { headers: headers(key), cache: "no-store" },
  );
  if (!res.ok) return [];
  return res.json();
}

export async function addFundUse(data: Omit<FundUseRow, "id" | "created_at">): Promise<FundUseRow> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(`${BASE}/rest/v1/fund_uses`, {
    method: "POST",
    headers: headers(key, { Prefer: "return=representation" }),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`Supabase insert failed (${res.status}): ${msg}`);
  }
  const rows: FundUseRow[] = await res.json();
  return rows[0];
}

export async function updateFundUse(
  id: string,
  data: { title: string; description: string; icon: string; sort_order: number },
): Promise<void> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(
    `${BASE}/rest/v1/fund_uses?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: headers(key, { Prefer: "return=minimal" }),
      body: JSON.stringify(data),
    },
  );
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`Supabase update failed (${res.status}): ${msg}`);
  }
}

export async function deleteFundUse(id: string): Promise<void> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(
    `${BASE}/rest/v1/fund_uses?id=eq.${encodeURIComponent(id)}`,
    { method: "DELETE", headers: headers(key, { Prefer: "return=minimal" }) },
  );
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`Supabase delete failed (${res.status}): ${msg}`);
  }
}

export async function getDonations(slug?: string): Promise<DonationRow[]> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const filter = slug ? `&campaign_slug=eq.${encodeURIComponent(slug)}` : "";
  const res = await fetch(
    `${BASE}/rest/v1/donations?select=*&order=created_at.desc${filter}`,
    { headers: headers(key), cache: "no-store" },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase select failed (${res.status}): ${body}`);
  }
  return res.json();
}
