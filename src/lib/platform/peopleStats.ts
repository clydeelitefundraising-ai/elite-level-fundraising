// People on ELF — server-only loader. Reads only the columns the counting
// rules need (peopleStatsLogic.ts), in pages, and returns aggregates only.
// No names, emails or phone numbers are read. Any read failure fails the
// whole computation (null) rather than showing a partial, misleading total.
import { restHeaders, restUrl } from "./_client";
import {
  computePeopleStats,
  type AccessRequestRow, type AthleteRow, type CampaignRow, type CoachInviteTokenRow, type CoachRow,
  type MemberRow, type PeopleStats, type StaffInvitationRow,
} from "./peopleStatsLogic";
import { peopleExclusionsFor, type ExclusionSet } from "./peopleStatsExclusions";

export const PAGE_SIZE = 1000;
const MAX_PAGES = 500;

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** Every row of `table` (narrow `select`), PAGE_SIZE at a time in a stable
 *  `order`. Throws on any failed or malformed page. */
export async function fetchAllRows<T>(
  table: string, select: string, order: string,
  fetchImpl: FetchLike = fetch, pageSize = PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = restUrl(`${table}?select=${select}&order=${order}&limit=${pageSize}&offset=${page * pageSize}`);
    const res = await fetchImpl(url, { headers: restHeaders(), cache: "no-store" });
    if (!res.ok) throw new Error(`people stats: ${table} read failed (${res.status})`);
    const body: unknown = await res.json();
    if (!Array.isArray(body)) throw new Error(`people stats: ${table} returned an unexpected shape`);
    rows.push(...(body as T[]));
    if (body.length < pageSize) return rows;
  }
  throw new Error(`people stats: ${table} exceeded ${MAX_PAGES} pages`);
}

/** pendingAvailable: false when the invitation/request tables couldn't be
 *  read — the people totals don't depend on them and are still shown. */
export type PeopleStatsResult = PeopleStats & { exclusions: ExclusionSet; computedAt: string; pendingAvailable: boolean };

export async function loadPeopleStats(fetchImpl: FetchLike = fetch, now = new Date()): Promise<PeopleStatsResult> {
  const exclusions = peopleExclusionsFor(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const pendingReads = Promise.all([
    fetchAllRows<StaffInvitationRow>("team_staff_invitations", "id,campaign_slug,role,accepted_at,revoked_at,expires_at", "id", fetchImpl),
    fetchAllRows<AccessRequestRow>("parent_access_requests", "id,campaign_slug,status", "id", fetchImpl),
    fetchAllRows<AccessRequestRow>("pending_athlete_requests", "id,campaign_slug,status", "id", fetchImpl),
    fetchAllRows<CoachInviteTokenRow>("coach_invite_tokens", "id,coach_id,used_at,expires_at", "id", fetchImpl),
  ]).then(r => ({ ok: true as const, r }), () => ({ ok: false as const }));
  const [campaigns, athletes, members, coaches] = await Promise.all([
    fetchAllRows<CampaignRow>("campaign_settings", "campaign_slug,organization_id,is_demo,archived,season_completed_at,successor_campaign_slug", "campaign_slug", fetchImpl),
    fetchAllRows<AthleteRow>("athletes", "id,campaign_slug,previous_season_athlete_id", "id", fetchImpl),
    fetchAllRows<MemberRow>("team_members", "id,campaign_slug,role,account_id,athlete_id", "id", fetchImpl),
    fetchAllRows<CoachRow>("team_coaches", "id,campaign_slug,role,account_id", "id", fetchImpl),
  ]);
  const pending = await pendingReads;
  const [staffInvitations, parentRequests, athleteRequests, coachInviteTokens] = pending.ok ? pending.r : [[], [], [], []];
  const stats = computePeopleStats({
    campaigns, athletes, members, coaches, staffInvitations, parentRequests, athleteRequests, coachInviteTokens,
    exclusions, now,
  });
  return { ...stats, exclusions, computedAt: now.toISOString(), pendingAvailable: pending.ok };
}

/** Never throws: null when the statistics can't be computed right now. */
export async function getPeopleStats(): Promise<PeopleStatsResult | null> {
  try {
    return await loadPeopleStats();
  } catch (err) {
    console.error("[peopleStats]", err instanceof Error ? err.message : "failed");
    return null;
  }
}
