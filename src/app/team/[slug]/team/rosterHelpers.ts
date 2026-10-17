// Pure helpers for the Phase D3 desktop roster workspace — extracted so
// eligibility, row-building, filtering, and sorting are directly
// unit-testable without any component-render infrastructure (same pattern
// as src/app/team/[slug]/_components/desktopNavItems.ts and
// src/app/team/[slug]/home/coachDashboardHelpers.ts). DesktopRosterTable.tsx
// is the only consumer of the row/filter/sort functions; TeamView.tsx (the
// new thin wrapper) is the only consumer of shouldShowDesktopRoster.
import { isCoachOnly, type TeamActor } from "../../../../lib/permissions.ts";
import { NO_GRADE_SET_LABEL, compareAthleteClasses, representedAthleteClasses } from "../../../../lib/athleteClass.ts";
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
  grade: GradeTabKey;
  fundraising: FundraisingFilter;
};

export const DEFAULT_ROSTER_FILTERS: RosterFilters = { search: "", grade: "all", fundraising: "all" };

/** Case-insensitive substring match on name — the one roster search rule,
 *  shared by the mobile list and the desktop table. */
export function matchesRosterSearch(name: string, search: string): boolean {
  const q = search.trim().toLowerCase();
  return !q || name.toLowerCase().includes(q);
}

/** Pure, client-side only — the whole roster is already loaded, so this
 *  never needs a server round-trip. Search is case-insensitive substring
 *  match on name. Grade filter is the selected grade tab (matchesGradeTab:
 *  exact class_year match, or the "No grade set" tab for an empty value).
 *  Fundraising filter is based on raisedCents > 0, matching the same
 *  "has anything been raised" rule already used elsewhere (e.g. Home's
 *  FundraiserSnapshot/shouldShowFundraisingCard). */
export function filterDesktopRosterRows(rows: RosterRow[], filters: RosterFilters): RosterRow[] {
  return rows.filter(row => {
    if (!matchesRosterSearch(row.name, filters.search)) return false;
    if (!matchesGradeTab(row.class_year, filters.grade)) return false;
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

// ─── Grade tabs ──────────────────────────────────────────────────────────────

/** Roster grade tab identifier. Prefixed so no stored class_year value
 *  (free text) can ever collide with the "All Athletes" or "No grade set"
 *  tabs — e.g. an athlete whose grade is literally "all" or "No grade set". */
export type GradeTabKey = "all" | "none" | `grade:${string}`;

export const ALL_ATHLETES_TAB: GradeTabKey = "all";
export const NO_GRADE_TAB: GradeTabKey = "none";
export const ALL_ATHLETES_LABEL = "All Athletes";

export type GradeTab = { key: GradeTabKey; label: string; count: number };

/** The tab an athlete belongs to. Empty/missing class_year → "No grade set",
 *  kept separate from a real "Other" grade. */
export function gradeTabKey(classYear: string | null | undefined): GradeTabKey {
  return classYear ? `grade:${classYear}` : NO_GRADE_TAB;
}

/** "All Athletes" first, then one tab per grade actually present on the
 *  roster — derived from the data, never a fixed list — in the shared
 *  6th Grade→Other order (representedAthleteClasses), nonstandard legacy
 *  values after, and "No grade set" last only when some athlete has no
 *  grade. Counts are full-roster counts (not narrowed by search). Display
 *  only; nothing is written. */
export function buildGradeTabs(athletes: readonly { class_year?: string | null }[]): GradeTab[] {
  const counts = new Map<GradeTabKey, number>();
  for (const a of athletes) {
    const key = gradeTabKey(a.class_year);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const tabs: GradeTab[] = [{ key: ALL_ATHLETES_TAB, label: ALL_ATHLETES_LABEL, count: athletes.length }];
  for (const grade of representedAthleteClasses(athletes.map(a => a.class_year))) {
    const key = gradeTabKey(grade);
    tabs.push({ key, label: grade, count: counts.get(key) ?? 0 });
  }
  const noGrade = counts.get(NO_GRADE_TAB) ?? 0;
  if (noGrade > 0) tabs.push({ key: NO_GRADE_TAB, label: NO_GRADE_SET_LABEL, count: noGrade });
  return tabs;
}

export function matchesGradeTab(classYear: string | null | undefined, tab: GradeTabKey): boolean {
  return tab === ALL_ATHLETES_TAB || gradeTabKey(classYear) === tab;
}

/** A selected tab can disappear after an edit/removal (its last athlete
 *  changed grade or left) — fall back to "All Athletes" instead of
 *  showing an empty, unselectable tab. */
export function resolveGradeTab(selected: GradeTabKey, tabs: readonly GradeTab[]): GradeTabKey {
  return tabs.some(t => t.key === selected) ? selected : ALL_ATHLETES_TAB;
}

/** Roving-focus keyboard navigation for the tab row (WAI-ARIA tabs
 *  pattern): ←/→ wrap, Home/End jump. Returns null for any other key. */
export function gradeTabIndexForKey(key: string, current: number, count: number): number | null {
  if (count <= 0) return null;
  if (key === "ArrowRight") return (current + 1) % count;
  if (key === "ArrowLeft")  return (current - 1 + count) % count;
  if (key === "Home")       return 0;
  if (key === "End")        return count - 1;
  return null;
}

// ─── Mobile roster grouping ──────────────────────────────────────────────────

/** Groups athletes by class_year in the same order as the grade tabs
 *  (buildGradeTabs) — used for the headings under "All Athletes" —
 *  with athletes that have no class_year in a trailing "No grade set"
 *  group — kept separate from a real "Other" grade so the two never merge
 *  or show as duplicate headings. Display-only; nothing is written. */
export function groupAthletesByClass<T extends { class_year?: string | null }>(athletes: T[]): { label: string; athletes: T[] }[] {
  const groups = new Map<string, T[]>();
  const ungrouped: T[] = [];
  for (const a of athletes) {
    if (!a.class_year) { ungrouped.push(a); continue; }
    if (!groups.has(a.class_year)) groups.set(a.class_year, []);
    groups.get(a.class_year)!.push(a);
  }
  const result = [...groups.entries()]
    .sort((a, b) => compareAthleteClasses(a[0], b[0]))
    .map(([label, list]) => ({ label, athletes: list }));
  if (ungrouped.length > 0) result.push({ label: NO_GRADE_SET_LABEL, athletes: ungrouped });
  return result;
}
