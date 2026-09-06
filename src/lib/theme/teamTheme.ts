import { getForegroundForBackground } from "./contrast";

const ELF_ORANGE = "#FF5A1F";
const ELF_YELLOW = "#FFC93C";

export type TeamThemeVars = {
  "--team-primary": string;
  "--team-secondary": string;
  "--team-primary-foreground": string;
};

/**
 * Resolves a team's branding (campaign_settings.primary_color /
 * secondary_color) into the CSS custom properties that drive every
 * team-color accent in the app (nav active states, badges, progress
 * bars, primary buttons, etc.).
 *
 * This is the single source of truth for "what does this team's brand
 * look like" — do not read primary_color/secondary_color directly for
 * new theming work; consume these CSS variables instead so future
 * screens automatically stay in sync with whatever this function
 * decides (e.g. if the contrast rule changes later, every consumer
 * updates at once).
 *
 * Existing call sites that already read settings.primary_color directly
 * as a raw JS value (e.g. TeamNav's active-tab color) are NOT broken by
 * this — they're a separate, still-valid consumption path of the same
 * underlying data. This function supplements them for CSS-driven
 * consumers, it does not replace them in Phase 2.
 *
 * NOTE on "default ELF theme": campaign_settings.primary_color is a
 * required DB column that gets backfilled with a generic blue
 * (#1B4FA8) at team-onboarding time if a school doesn't supply one —
 * it is very rarely actually null/empty in production. This function's
 * fallback to ELF orange therefore mainly guards against a missing/
 * malformed value rather than being the common case; whether a given
 * team's stored color represents deliberate customization or just the
 * onboarding default is a product decision outside this function's
 * scope (and outside Phase 2's scope to change).
 */
export function resolveTeamTheme(
  primaryColor: string | null | undefined,
  secondaryColor: string | null | undefined
): TeamThemeVars {
  const primary = primaryColor && primaryColor.trim() ? primaryColor.trim() : ELF_ORANGE;
  const secondary = secondaryColor && secondaryColor.trim() ? secondaryColor.trim() : ELF_YELLOW;

  return {
    "--team-primary": primary,
    "--team-secondary": secondary,
    "--team-primary-foreground": getForegroundForBackground(primary),
  };
}
