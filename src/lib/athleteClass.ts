// Athlete grade levels — the single source of truth for every grade
// selector, sort, and filter in the app. Client-safe on purpose (no env
// reads, no imports): client components import this directly instead of
// keeping their own local copies, so every dropdown offers the same list.
//
// The labels below are exactly what's stored in athletes.class_year and
// pending_athlete_requests.class_year (both free-text columns with no
// enum/CHECK constraint). Existing rows holding any other value (e.g.
// "RS Sophomore" from a confirmed roster import) remain valid and are
// never rewritten — they simply sort after the canonical options.
export const ATHLETE_CLASS_OPTIONS = [
  "6th Grade",
  "7th Grade",
  "8th Grade",
  "Freshman",
  "Sophomore",
  "Junior",
  "Senior",
  "Other",
] as const;
export type AthleteClass = typeof ATHLETE_CLASS_OPTIONS[number];

// Roster grouping label for athletes with no class_year at all. Deliberately
// distinct from the "Other" option above, which is a real chosen grade.
export const NO_GRADE_SET_LABEL = "No grade set";

export function isAthleteClass(value: string | null | undefined): value is AthleteClass {
  return !!value && (ATHLETE_CLASS_OPTIONS as readonly string[]).includes(value);
}

/** Canonical options in ATHLETE_CLASS_OPTIONS order; any other non-empty
 *  value sorts after them, alphabetically. Never hides a value. */
export function compareAthleteClasses(a: string, b: string): number {
  const rank = (v: string) => {
    const i = (ATHLETE_CLASS_OPTIONS as readonly string[]).indexOf(v);
    return i === -1 ? Number.POSITIVE_INFINITY : i;
  };
  const diff = rank(a) - rank(b);
  if (diff !== 0 && !Number.isNaN(diff)) return diff;
  return a.localeCompare(b);
}

/** Distinct non-empty class values actually present, in canonical order
 *  (legacy/nonstandard values after). */
export function representedAthleteClasses(values: readonly (string | null | undefined)[]): string[] {
  const set = new Set<string>();
  for (const v of values) if (v) set.add(v);
  return [...set].sort(compareAthleteClasses);
}

/** Public campaign leaderboard filter tabs: "Overall" first, then only the
 *  canonical grades at least one athlete actually holds. Nonstandard legacy
 *  values never become public tabs — those athletes still appear under
 *  Overall, same as before. */
export function publicLeaderboardFilters(classYears: readonly (string | null | undefined)[]): string[] {
  return ["Overall", ...representedAthleteClasses(classYears).filter(isAthleteClass)];
}
