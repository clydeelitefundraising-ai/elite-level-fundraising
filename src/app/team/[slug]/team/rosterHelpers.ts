// Pure helpers for the Phase D3 desktop roster workspace — extracted so
// eligibility, row-building, filtering, and sorting are directly
// unit-testable without any component-render infrastructure (same pattern
// as src/app/team/[slug]/_components/desktopNavItems.ts and
// src/app/team/[slug]/home/coachDashboardHelpers.ts). DesktopRosterTable.tsx
// is the only consumer of the row/filter/sort functions; TeamView.tsx (the
// new thin wrapper) is the only consumer of shouldShowDesktopRoster.
import { isCoachOnly, type TeamActor } from "../../../../lib/permissions.ts";
import { ATHLETE_CLASS_OPTIONS } from "../../../../lib/supabase.ts";
import type { TeamAthleteRow, OutreachCurrentRow } from "../../../../lib/teamData.ts";
import type { AttributionTotals } from "../../../../lib/donationAttribution.ts";

/** Whether this actor sees the desktop roster workspace instead of the
 *  existing mobile-style athlete grid at desktop widths. Deliberately NOT
 *  isStaff() — matches the exact boundary D2's Coach Dashboard already
 *  established (shouldShowCoachDashboard): boosters keep isStaff-granted
 *  write access to athletes (add/edit), but must keep seeing the existing
 *  Team view, not a new coach-command-center-style surface, at every
 *  width. isCoachOnly() already has exactly the right semantics (head_coach,
 *  assistant_coach, platform_admin as head-coach-equivalent — excludes
 *  booster and every member role). permissions.ts's own isStaff/isHeadCoach/
 *  isCoachOnly are untouched — this only decides which presentation an
 *  already-correctly-authorized actor sees. */
export function shouldShowDesktopRoster(actor: TeamActor): boolean {
  return isCoachOnly(actor);
}

// ─── Row shape ───────────────────────────────────────────────────────────────

// D3a: wording reconciled with the athlete-detail page's own established
// outreach vocabulary (CoachAthleteView.tsx's OUTREACH_CONFIG) — "Follow
// Up", not "Needs Follow-up". The absent-record case is deliberately NOT
// "Not Started": per the outreach-semantics audit, an athlete with no
// logged entry only proves no outreach ACTION has been logged — it does
// not prove no outreach has happened. "Not Started" is also already used
// elsewhere in CoachAthleteView.tsx for an unrelated concept (the
// Fundraising Contacts goal-progress card), so reusing it here for
// outreach would be doubly misleading.
export type OutreachStatusLabel = "No outreach logged" | "Contacted" | "Follow Up" | "Resolved";

export type RosterRow = {
  id: string;
  name: string;
  profile_photo: string | null;
  class_year: string | null;
  event: string | null;
  jersey_number: number | null;
  contact_phone: string | null;
  contact_email: string | null;
  goal_cents: number | null;
  raisedCents: number;
  donorCount: number;
  contactCount: number;
  outreachStatus: OutreachStatusLabel;
};

function outreachStatusLabel(row: OutreachCurrentRow | undefined): OutreachStatusLabel {
  if (!row) return "No outreach logged";
  if (row.status === "contacted") return "Contacted";
  if (row.status === "needs_follow_up") return "Follow Up";
  return "Resolved";
}

/** Combines the roster with three already-existing bulk data sources
 *  (attributeDonationsToAthletes' output, getContactCountsByAthlete's map,
 *  getOutreachMap's map) into one row per athlete. No new queries — this
 *  is purely a join of data the server page already fetches via existing,
 *  unmodified helpers. Every athlete gets a safe fallback (0 / "No
 *  outreach logged") when a given athlete has no matching entry in one of
 *  the auxiliary maps, so the table never shows undefined/null/raw
 *  values. */
export function buildDesktopRosterRows(
  athletes: TeamAthleteRow[],
  attribution: AttributionTotals,
  contactCounts: Record<string, number>,
  outreachMap: Record<string, OutreachCurrentRow>,
): RosterRow[] {
  return athletes.map(a => ({
    id: a.id,
    name: a.name,
    profile_photo: a.profile_photo,
    class_year: a.class_year ?? null,
    event: a.event,
    jersey_number: a.jersey_number,
    contact_phone: a.contact_phone,
    contact_email: a.contact_email,
    goal_cents: a.goal_cents,
    raisedCents: attribution.totalsCents[a.id] ?? 0,
    donorCount: attribution.donorCounts[a.id] ?? 0,
    contactCount: contactCounts[a.id] ?? 0,
    outreachStatus: outreachStatusLabel(outreachMap[a.id]),
  }));
}

// ─── Filtering ───────────────────────────────────────────────────────────────

export type FundraisingFilter = "all" | "has-raised" | "no-raised";

export type RosterFilters = {
  search: string;
  grade: string; // "" means All
  fundraising: FundraisingFilter;
};

export const DEFAULT_ROSTER_FILTERS: RosterFilters = { search: "", grade: "", fundraising: "all" };

/** Pure, client-side only — the whole roster is already loaded, so this
 *  never needs a server round-trip. Search is case-insensitive substring
 *  match on name. Grade filter compares class_year exactly (the same
 *  field the Add/Edit modal already writes via ATHLETE_CLASS_OPTIONS).
 *  Fundraising filter is based on raisedCents > 0, matching the same
 *  "has anything been raised" rule already used elsewhere (e.g. Home's
 *  FundraiserSnapshot/shouldShowFundraisingCard). */
export function filterDesktopRosterRows(rows: RosterRow[], filters: RosterFilters): RosterRow[] {
  const search = filters.search.trim().toLowerCase();
  return rows.filter(row => {
    if (search && !row.name.toLowerCase().includes(search)) return false;
    if (filters.grade && row.class_year !== filters.grade) return false;
    if (filters.fundraising === "has-raised" && row.raisedCents <= 0) return false;
    if (filters.fundraising === "no-raised" && row.raisedCents > 0) return false;
    return true;
  });
}

// ─── Sorting ─────────────────────────────────────────────────────────────────

export type RosterSort = "name-asc" | "name-desc" | "raised-desc" | "raised-asc";

/** Stable — ties broken by name so equal-raised athletes never reorder
 *  unpredictably between renders. Never mutates the input array. */
export function sortDesktopRosterRows(rows: RosterRow[], sort: RosterSort): RosterRow[] {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    if (sort === "name-asc")  return a.name.localeCompare(b.name) || 0;
    if (sort === "name-desc") return b.name.localeCompare(a.name) || 0;
    if (sort === "raised-desc") return (b.raisedCents - a.raisedCents) || a.name.localeCompare(b.name);
    // raised-asc
    return (a.raisedCents - b.raisedCents) || a.name.localeCompare(b.name);
  });
  return sorted;
}

// ─── Grade filter options ────────────────────────────────────────────────────

/** Derived from the loaded roster, never hardcoded — only grades actually
 *  present on the team appear as filter options. Sorted by the canonical
 *  Freshman→Senior progression (ATHLETE_CLASS_OPTIONS' own order) when a
 *  value matches one of those; any other/legacy value present in the data
 *  sorts after, alphabetically — this never hides or rejects a value that
 *  doesn't match the canonical list, it only affects display order. */
export function distinctGrades(rows: RosterRow[]): string[] {
  const values = new Set<string>();
  for (const row of rows) {
    if (row.class_year) values.add(row.class_year);
  }
  const canonicalIndex = (v: string) => {
    const i = (ATHLETE_CLASS_OPTIONS as readonly string[]).indexOf(v);
    return i === -1 ? Number.POSITIVE_INFINITY : i;
  };
  return [...values].sort((a, b) => {
    const ci = canonicalIndex(a) - canonicalIndex(b);
    return ci !== 0 ? ci : a.localeCompare(b);
  });
}
