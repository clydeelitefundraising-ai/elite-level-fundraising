import type { AthleteRow, SponsorRow } from "@/lib/supabase";
import { arizonaTodayISO, type EventType } from "@/lib/calendarShared";
import { resolvePhotoUrl, type RawCoachInfo } from "@/lib/messages";
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

// Phase 26: append-only outreach log
export type OutreachRow = {
  id: string;
  athlete_id: string;
  campaign_slug: string;
  status: "contacted" | "needs_follow_up" | "resolved";
  note: string | null;
  contacted_by: string | null;
  coach_id: string | null;
  created_at: string;
};

// Same shape — sourced from athlete_outreach_current view
export type OutreachCurrentRow = OutreachRow;

export async function getOutreachMap(slug: string): Promise<Record<string, OutreachCurrentRow>> {
  const res = await fetch(
    `${BASE}/rest/v1/athlete_outreach_current?campaign_slug=eq.${encodeURIComponent(slug)}`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return {};
  const rows: OutreachCurrentRow[] = await res.json();
  return Object.fromEntries(rows.map(r => [r.athlete_id, r]));
}

// Phase 6: per-athlete fundraising_contacts count, keyed by athlete_id.
// Same underlying table/counting logic as
// /api/team/[slug]/contacts/coach/summary (which additionally computes
// phone/email breakdowns and goal completion — not needed here), kept
// deliberately smaller rather than importing that route's full response
// shape. Missing athletes simply aren't keys in the returned object —
// callers must default to 0 themselves (see followUps.ts).
export async function getContactCountsByAthlete(slug: string): Promise<Record<string, number>> {
  const res = await fetch(
    `${BASE}/rest/v1/fundraising_contacts?campaign_slug=eq.${encodeURIComponent(slug)}&select=athlete_id`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return {};
  const rows: { athlete_id: string }[] = await res.json();
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.athlete_id] = (counts[r.athlete_id] ?? 0) + 1;
  return counts;
}

export type AnnouncementRow = {
  id: string;
  campaign_slug: string;
  title: string;
  body: string;
  category: string;
  priority: "normal" | "high" | "pinned";
  author_name: string;
  author_role: string;
  recipient_scope: "everyone" | "athletes" | "parents" | "boosters" | "athlete_specific";
  recipient_athlete_id: string | null;
  created_at: string;
  updated_at: string;
  attachment_id: string | null;
  attachment?: TeamFileRow | null;
  // Phase 7 polish: resolved the same way as everywhere else in the app
  // (resolvePhotoUrl / elf_accounts.profile_photo_url — see getAnnouncements
  // below). Public-safe only — no account_id or other identity metadata is
  // ever included. announcements only has a live coach_id reference (no
  // member_id column), so this resolves for coach-kind authors — Head
  // Coach, Assistant Coach, and any Booster who is a team_coaches row; a
  // member-kind author (e.g. a team_members-sourced Booster) has no live
  // photo source here and correctly falls back to initials, same as today.
  author_photo_url: string | null;
};

export type CalendarEventRow = {
  id: string;
  campaign_slug: string;
  title: string;
  event_date: string;
  event_time: string;
  // Phase 4A: structured, optional time — nullable, unpopulated on every
  // event created before this phase. start_time is the confirmed correct
  // signal for whether an event has a structured time at all; end_time
  // may or may not accompany it.
  start_time: string | null;
  end_time: string | null;
  location: string;
  // Phase 4A: pre-existing column, previously written by an out-of-band
  // process but never read/written by the app. Now surfaced.
  description: string | null;
  type: EventType;
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
    `${BASE}/rest/v1/announcements?campaign_slug=eq.${encodeURIComponent(slug)}` +
      `&select=*,attachment:team_files!attachment_id(*),author_coach:team_coaches!coach_id(name,role,elf_accounts!account_id(profile_photo_url))` +
      `&order=created_at.desc`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return [];
  const rows: (AnnouncementRow & { author_coach: RawCoachInfo | null })[] = await res.json();
  return rows.map(({ author_coach, ...row }) => ({
    ...row,
    author_photo_url: resolvePhotoUrl(author_coach, null),
  }));
}

export async function getCalendarEvents(
  slug: string,
  upcomingOnly = false,
): Promise<CalendarEventRow[]> {
  // Phase 4A: Arizona-canonical "today", not UTC-slice — see calendarShared.ts.
  const today = arizonaTodayISO();
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

export type JoinTeamSettings = {
  campaign_slug: string;
  school_name:   string;
  mascot:        string;
  sport_name:    string;
  primary_color: string;
};

export type ResolvedJoinCode =
  | { status: "invalid" }
  | { status: "archived" }
  | { status: "valid"; campaignSlug: string; settings: JoinTeamSettings };

// Phase 5: single canonical join-code resolution, used by BOTH the
// /join/[code] QR-landing route and /api/auth/validate-code (manual
// entry) — so "is this code usable right now" (unknown/expired/revoked,
// AND archived) is decided in exactly one place instead of two routes
// independently re-implementing the same check and risking drift. A
// code for an archived campaign is treated the same as any other
// unusable code from the joiner's point of view (distinct "archived"
// status only so callers can show a more specific, still-friendly
// message) — existing members of that campaign are completely
// unaffected, this only gates NEW joins.
export async function resolveJoinCode(code: string): Promise<ResolvedJoinCode> {
  const joinCode = await getJoinCode(code);
  if (!joinCode) return { status: "invalid" };

  const res = await fetch(
    `${BASE}/rest/v1/campaign_settings?campaign_slug=eq.${encodeURIComponent(joinCode.campaign_slug)}` +
      `&select=campaign_slug,school_name,mascot,sport_name,primary_color,archived&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return { status: "invalid" };
  const rows = await res.json();
  const settings = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  if (!settings) return { status: "invalid" };
  if (settings.archived) return { status: "archived" };

  return {
    status: "valid",
    campaignSlug: joinCode.campaign_slug,
    settings: {
      campaign_slug: settings.campaign_slug,
      school_name:   settings.school_name,
      mascot:        settings.mascot,
      sport_name:    settings.sport_name,
      primary_color: settings.primary_color,
    },
  };
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

export async function getNextCalendarEvent(slug: string): Promise<CalendarEventRow | null> {
  // Phase 4A: Arizona-canonical "today", not UTC-slice — see calendarShared.ts.
  const today = arizonaTodayISO();
  const res = await fetch(
    `${BASE}/rest/v1/calendar_events?campaign_slug=eq.${encodeURIComponent(slug)}&event_date=gte.${today}&order=event_date.asc,event_time.asc&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return null;
  const rows: CalendarEventRow[] = await res.json();
  return rows[0] ?? null;
}

export type FundraiserSummary = {
  topAthleteName: string | null;
};

export async function getTeamFundraiserSummary(slug: string): Promise<FundraiserSummary> {
  const res = await fetch(
    `${BASE}/rest/v1/donations?campaign_slug=eq.${encodeURIComponent(slug)}&select=athlete_name,amount_cents`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return { topAthleteName: null };
  const rows: { athlete_name: string | null; amount_cents: number }[] = await res.json();
  const byAthlete = new Map<string, number>();
  for (const row of rows) {
    if (!row.athlete_name) continue;
    byAthlete.set(row.athlete_name, (byAthlete.get(row.athlete_name) ?? 0) + row.amount_cents);
  }
  let topName: string | null = null;
  let topCents = 0;
  for (const [name, cents] of byAthlete) {
    if (cents > topCents) { topName = name; topCents = cents; }
  }
  return { topAthleteName: topName };
}
