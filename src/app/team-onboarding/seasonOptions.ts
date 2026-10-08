// Phase O3 — pure helper for the Season dropdown. Mirrors
// defaultSeasonLabel()'s own precedent (src/lib/campaignSeason.ts): the
// actual current calendar year, never a hardcoded one and never a
// school-year-style offset. Values are plain four-digit strings, matching
// O2's validateSelfServiceSeason() format exactly — this never changes O2
// backend validation, it just makes the UI unable to produce anything that
// validation would ever reject.

/** One year back through three years forward of the given year, as
 *  four-digit strings — e.g. buildSeasonOptions(2026) -> ["2025", "2026",
 *  "2027", "2028", "2029"]. Covers both "setting up next season early" and
 *  "catching up on a season that already started" without free text. */
export function buildSeasonOptions(currentYear: number): string[] {
  const options: string[] = [];
  for (let year = currentYear - 1; year <= currentYear + 3; year++) {
    options.push(String(year));
  }
  return options;
}

/** The option a coach sees pre-selected — always the real current year,
 *  matching defaultSeasonLabel()'s exact convention elsewhere in this app. */
export function defaultSeasonOption(currentYear: number): string {
  return String(currentYear);
}
