import type { AthleteRow, SponsorRow } from "@/lib/supabase";
export type { SponsorRow };

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

// Extends the existing AthleteRow with the optional columns added in Phase 11 + 12
export type TeamAthleteRow = AthleteRow & {
  jersey_number: number | null;
  grad_year: number | null;
  profile_photo: string | null;
  goal_cents: number | null;
};

export type AnnouncementRow = {
  id: string;
  campaign_slug: string;
  title: string;
  body: string;
  category: string;
  priority: "normal" | "high" | "pinned";
  author_name: string;
  author_role: string;
  created_at: string;
  updated_at: string;
  attachment_id: string | null;
  attachment?: TeamFileRow | null;
};

export type CalendarEventRow = {
  id: string;
  campaign_slug: string;
  title: string;
  event_date: string;
  event_time: string;
  location: string;
  type: "practice" | "meet" | "fundraiser" | "team";
  created_at: string;
};

export type TeamFileRow = {
  id: string;
  campaign_slug: string;
  name: string;
  storage_path: string;
  file_type: "pdf" | "image" | "doc" | "other";
  size_bytes: number;
  uploaded_by: string;
  coach_id: string;
  created_at: string;
};

export type DonationStats = {
  raised_cents: number;
  donor_count: number;
};

export type JoinCodeRow = {
  id: string;
  campaign_slug: string;
  code: string;
  expires_at: string | null;
  revoked: boolean;
};

export type ActiveJoinCode = {
  id: string;
  code: string;
  expires_at: string | null;
  created_at: string;
};

export async function getAthleteById(id: string): Promise<TeamAthleteRow | null> {
  const res = await fetch(
    `${BASE}/rest/v1/athletes?id=eq.${encodeURIComponent(id)}&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return null;
  const rows: TeamAthleteRow[] = await res.json();
  return rows[0] ?? null;
}

export async function getTeamAthletes(slug: string): Promise<TeamAthleteRow[]> {
  const res = await fetch(
    `${BASE}/rest/v1/athletes?campaign_slug=eq.${encodeURIComponent(slug)}&order=created_at.asc`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return [];
  return res.json();
}

export async function getAnnouncements(slug: string): Promise<AnnouncementRow[]> {
  const res = await fetch(
    `${BASE}/rest/v1/announcements?campaign_slug=eq.${encodeURIComponent(slug)}&select=*,attachment:team_files!attachment_id(*)&order=created_at.desc`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return [];
  return res.json();
}

export async function getCalendarEvents(
  slug: string,
  upcomingOnly = false,
): Promise<CalendarEventRow[]> {
  const today = new Date().toISOString().slice(0, 10);
  const dateFilter = upcomingOnly ? `&event_date=gte.${today}` : "";
  const res = await fetch(
    `${BASE}/rest/v1/calendar_events?campaign_slug=eq.${encodeURIComponent(slug)}${dateFilter}&order=event_date.asc,event_time.asc`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return [];
  return res.json();
}

export async function getTeamFiles(slug: string): Promise<TeamFileRow[]> {
  const res = await fetch(
    `${BASE}/rest/v1/team_files?campaign_slug=eq.${encodeURIComponent(slug)}&order=created_at.desc`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return [];
  return res.json();
}

export async function getAnnouncementMeta(
  slug: string,
): Promise<{ count: number; latestAt: string | null }> {
  const res = await fetch(
    `${BASE}/rest/v1/announcements?campaign_slug=eq.${encodeURIComponent(slug)}&select=created_at&order=created_at.desc`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return { count: 0, latestAt: null };
  const rows: { created_at: string }[] = await res.json();
  return { count: rows.length, latestAt: rows[0]?.created_at ?? null };
}

export async function getActiveJoinCode(slug: string): Promise<ActiveJoinCode | null> {
  const res = await fetch(
    `${BASE}/rest/v1/team_join_codes?campaign_slug=eq.${encodeURIComponent(slug)}&revoked=eq.false&select=id,code,expires_at,created_at&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return null;
  const rows: ActiveJoinCode[] = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const row = rows[0];
  if (row.expires_at && new Date(row.expires_at) < new Date()) return null;
  return row;
}

export async function getJoinCode(code: string): Promise<JoinCodeRow | null> {
  const res = await fetch(
    `${BASE}/rest/v1/team_join_codes?code=eq.${encodeURIComponent(code)}&revoked=eq.false&select=id,campaign_slug,code,expires_at,revoked&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return null;
  const rows: JoinCodeRow[] = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const row = rows[0];
  if (row.expires_at && new Date(row.expires_at) < new Date()) return null;
  return row;
}

export async function getTeamSponsors(slug: string): Promise<SponsorRow[]> {
  const res = await fetch(
    `${BASE}/rest/v1/sponsors?campaign_slug=eq.${encodeURIComponent(slug)}&order=display_order.asc,created_at.asc`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return [];
  return res.json();
}

// ── Shop types ────────────────────────────────────────────────────────────────

export type TeamVariantRow = {
  id:          string;
  product_id:  string;
  name:        string;
  price_delta: number;
};

export type TeamProductRow = {
  id:            string;
  campaign_slug: string;
  name:          string;
  description:   string | null;
  category:      string;
  price_cents:   number;
  cost_cents:    number | null;
  image_url:     string | null;
  visible:       boolean;
  display_order: number;
  created_at:    string;
  variants:      TeamVariantRow[];
  external_url?: string | null;
};

export async function getAllTeamProducts(slug: string): Promise<TeamProductRow[]> {
  const res = await fetch(
    `${BASE}/rest/v1/team_products?campaign_slug=eq.${encodeURIComponent(slug)}&select=*,variants:team_product_variants(id,name,price_delta)&order=display_order.asc,created_at.asc`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return [];
  return res.json();
}


export async function getDonationStats(slug: string): Promise<DonationStats> {
  const res = await fetch(
    `${BASE}/rest/v1/donations?campaign_slug=eq.${encodeURIComponent(slug)}&select=amount_cents`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return { raised_cents: 0, donor_count: 0 };
  const rows: { amount_cents: number }[] = await res.json();
  return {
    raised_cents: rows.reduce((sum, r) => sum + (r.amount_cents || 0), 0),
    donor_count: rows.length,
  };
}
