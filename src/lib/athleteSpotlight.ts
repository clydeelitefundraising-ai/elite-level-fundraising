// Personalized athlete fundraising page (public campaign page opened from
// an athlete's share link, /campaign/<slug>?athlete=<id>). Client-safe and
// pure — the page and its tests share these rules.
import { ATHLETE_CLASS_OPTIONS } from "./athleteClass.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** athletes.class_year values that are a real grade to show a donor, by
 *  lower-cased label. Case/spacing variants of a real grade (" junior ",
 *  "FRESHMAN" — free-text column) show as the canonical label; "Other",
 *  blank and non-standard values ("RS Sophomore") are omitted rather than
 *  shown — never a guessed or computed grade. */
const SPOTLIGHT_GRADES = new Map<string, string>(
  ATHLETE_CLASS_OPTIONS.filter(g => g !== "Other").map(g => [g.toLowerCase(), g]),
);

export function spotlightGrade(classYear: string | null | undefined): string | null {
  return SPOTLIGHT_GRADES.get((classYear ?? "").trim().replace(/\s+/g, " ").toLowerCase()) ?? null;
}

export type SpotlightCandidate = { id: string; name: string; class_year: string | null };

/** The athlete a share link names — only an exact id match against THIS
 *  campaign's public roster (the campaign-stats list). A malformed, stale,
 *  deleted or other-team id matches nothing, and the page stays the general
 *  team page (same rule as the existing donate-form preselect). */
export function resolveSpotlightAthlete<T extends SpotlightCandidate>(
  athleteParam: string | null | undefined,
  athletes: readonly T[],
): T | null {
  if (!athleteParam || !UUID_RE.test(athleteParam)) return null;
  return athletes.find(a => a.id === athleteParam) ?? null;
}

export function isAthleteId(value: string | null | undefined): value is string {
  return !!value && UUID_RE.test(value);
}

/** Public photo for a spotlighted athlete — served by
 *  /api/campaign-photo/<slug>/<athleteId>, which decides whether there is
 *  one; the page never sees the storage URL. */
export function athletePhotoSrc(slug: string, athleteId: string): string {
  return `/api/campaign-photo/${encodeURIComponent(slug)}/${encodeURIComponent(athleteId)}`;
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** Short, gender-neutral support line under the athlete's name. */
export function athleteSupportMessage(name: string, teamName: string): string {
  const first = firstName(name);
  return `Help ${first} and the ${teamName} reach their fundraising goals this season. Your support makes a direct impact on ${first} and the entire team.`;
}
