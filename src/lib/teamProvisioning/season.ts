// Phase O2 correction — canonical season/year validation, SELF-SERVICE
// ONBOARDING ONLY. The legacy admin campaign-creation flow
// (NewCampaignWizard.tsx / /api/admin/onboard) still accepts whatever
// free-text season string an ELF staff member types (e.g. "Fall 2026") —
// deliberately untouched by this module and by O2 generally. Self-service
// needs a canonical, slug-stable value instead, since the school/sport/
// season triple is also what generateCampaignSlug() (slug.ts) derives a
// team's permanent identity from, and O4's duplicate-team detection will
// need to compare seasons reliably across self-service-created teams.

export const MIN_SELF_SERVICE_SEASON_YEAR = 2000;
export const MAX_SELF_SERVICE_SEASON_YEAR = 2099;

const FOUR_DIGIT_YEAR_RE = /^\d{4}$/;

export type SeasonValidationResult =
  | { ok: true; season: string }
  | { ok: false; error: string };

/** Trims surrounding whitespace, then requires EXACTLY a four-digit
 *  calendar year (`^\d{4}$`) within [MIN_SELF_SERVICE_SEASON_YEAR,
 *  MAX_SELF_SERVICE_SEASON_YEAR]. Never transforms an ambiguous value into
 *  a guess — "Fall 2026", "2026-27", and "26" are all rejected outright,
 *  not coerced to "2026". 2000 is comfortably before this product or any
 *  realistic team record could exist; 2099 is generous for any forward
 *  planning season while still rejecting sentinel-like placeholder values
 *  (e.g. "0000", "9999") a form field or bad client could send. */
export function validateSelfServiceSeason(raw: string): SeasonValidationResult {
  const trimmed = raw.trim();
  if (!FOUR_DIGIT_YEAR_RE.test(trimmed)) {
    return { ok: false, error: "Season must be a four-digit year, e.g. 2026." };
  }
  const year = Number(trimmed);
  if (year < MIN_SELF_SERVICE_SEASON_YEAR || year > MAX_SELF_SERVICE_SEASON_YEAR) {
    return {
      ok: false,
      error: `Season year must be between ${MIN_SELF_SERVICE_SEASON_YEAR} and ${MAX_SELF_SERVICE_SEASON_YEAR}.`,
    };
  }
  return { ok: true, season: trimmed };
}
