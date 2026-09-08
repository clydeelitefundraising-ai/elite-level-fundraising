import { getForegroundForBackground } from "./contrast.ts";

export const ELF_ORANGE = "#FF5A1F";
export const ELF_YELLOW = "#FFC93C";

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
 * As of Phase 3, TeamNav/DesktopSidebar/TeamHeader/AccountMenu all consume
 * var(--team-primary)/var(--team-secondary) directly in CSS rather than
 * reading settings.primary_color as a raw JS value — this function (via
 * the team layout root's inline style) is their only source of theme
 * color. A handful of files elsewhere in the app still read
 * primary_color/secondary_color directly (documented in the Phase 2
 * report as the ~74/21-file gap) and remain untouched; migrating them is
 * later-phase work, not part of Phase 3's shell scope.
 *
 * PHASE 3 UPDATE: campaign_settings.primary_color is a required DB column
 * that was historically backfilled with a generic placeholder blue
 * (#1B4FA8) at team-onboarding time, and live QA additionally found real
 * rows carrying the app's own old hardcoded navy (#0b1e3d) stored as if
 * it were a chosen color — so the stored color can NEVER be trusted to
 * mean "this coach intentionally customized branding." That signal now
 * comes from the explicit `campaign_settings.branding_customized` column
 * (see supabase/migrations/phase_a32_team_branding_customized.sql) instead.
 * `brandingCustomized` must be passed in from that column, not inferred
 * from the color values.
 */
export function resolveTeamTheme(
  primaryColor: string | null | undefined,
  secondaryColor: string | null | undefined,
  brandingCustomized: boolean
): TeamThemeVars {
  // Explicit-flag-false wins over any stored color, including a real,
  // well-formed hex value — a team that hasn't opted into custom branding
  // always gets the ELF default theme, full stop.
  if (!brandingCustomized) {
    return {
      "--team-primary": ELF_ORANGE,
      "--team-secondary": ELF_YELLOW,
      "--team-primary-foreground": getForegroundForBackground(ELF_ORANGE),
    };
  }

  const primary = primaryColor && primaryColor.trim() ? primaryColor.trim() : ELF_ORANGE;
  const secondary = secondaryColor && secondaryColor.trim() ? secondaryColor.trim() : ELF_YELLOW;

  return {
    "--team-primary": primary,
    "--team-secondary": secondary,
    "--team-primary-foreground": getForegroundForBackground(primary),
  };
}
