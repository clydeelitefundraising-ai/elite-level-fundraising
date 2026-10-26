// Complete Season Phase 2 — completed seasons are read-only.
//
// A season is completed once team_season_complete() has set
// campaign_settings.season_completed_at (and successor_campaign_slug). The
// database refuses writes to a completed season's team data on its own
// (phase_s2_completed_season_read_only.sql); this is the app-side check
// that turns that into a clear 409 before any work is done, for every
// role — coach, member, booster and platform admin alike.
//
// Every route that writes team data calls seasonWriteBlocked(slug) first
// (see seasonWritableCoverage.test.ts for the inventory and the routes
// that are deliberately exempt). If the season state can't be read — e.g.
// before the Phase 1 migration adds the columns — the check lets the
// request through: the database guard is the authority, this is the
// friendly early answer.
import { NextResponse } from "next/server";

import { isSeasonCompleted, SEASON_COMPLETED_CODE, SEASON_COMPLETED_MESSAGE } from "./seasonState.ts";

export { isSeasonCompleted, SEASON_COMPLETED_CODE, SEASON_COMPLETED_MESSAGE } from "./seasonState.ts";
export type { SeasonState } from "./seasonState.ts";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

export function seasonCompletedResponse(): NextResponse {
  return NextResponse.json(
    { error: SEASON_COMPLETED_MESSAGE, code: SEASON_COMPLETED_CODE },
    { status: 409, headers: { "Cache-Control": "no-store" } },
  );
}

/** The 409 to send when this team's season is completed, else null. */
export async function seasonWriteBlocked(slug: string | null | undefined): Promise<NextResponse | null> {
  if (!slug) return null;
  try {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const res = await fetch(
      `${BASE}/rest/v1/campaign_settings?campaign_slug=eq.${encodeURIComponent(slug)}` +
      `&select=season_completed_at,successor_campaign_slug&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" },
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) && isSeasonCompleted(rows[0]) ? seasonCompletedResponse() : null;
  } catch {
    return null;
  }
}

/** Same check for a route that only has a row id (admin tools): finds the
 *  row's team first. An unknown id is not blocked here — the route's own
 *  "not found" handling answers it. */
export async function seasonWriteBlockedFor(
  table: "athletes" | "team_coaches" | "fund_uses" | "sponsors",
  id: string | null | undefined,
): Promise<NextResponse | null> {
  if (!id) return null;
  try {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const res = await fetch(
      `${BASE}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&select=campaign_slug&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" },
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) && rows[0]?.campaign_slug ? seasonWriteBlocked(rows[0].campaign_slug) : null;
  } catch {
    return null;
  }
}
