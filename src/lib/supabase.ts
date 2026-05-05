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
};

export type AthleteRow = {
  id: string;
  campaign_slug: string;
  name: string;
  event: string;
  created_at: string;
};

export type SponsorRow = {
  id: string;
  campaign_slug: string;
  name: string;
  url: string;
  tier: "gold" | "silver" | "bronze";
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
  const res = await fetch(
    `${BASE}/rest/v1/campaign_settings?on_conflict=campaign_slug`,
    {
      method: "POST",
      headers: headers(key, { Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify({ campaign_slug: slug, ...data }),
    },
  );
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`Supabase upsert failed (${res.status}): ${msg}`);
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

export async function updateAthlete(id: string, data: { name: string; event: string }): Promise<void> {
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
    `${BASE}/rest/v1/sponsors?campaign_slug=eq.${encodeURIComponent(slug)}&order=created_at.asc`,
    { headers: headers(key), cache: "no-store" },
  );
  if (!res.ok) return [];
  return res.json();
}

export async function addSponsor(data: Omit<SponsorRow, "id" | "created_at">): Promise<SponsorRow> {
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
  data: { name: string; url: string; tier: string },
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
