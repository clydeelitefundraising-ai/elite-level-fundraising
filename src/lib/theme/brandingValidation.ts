// Client-safe. No server-only imports.
//
// Phase A34 (Team Branding Settings). Single source of truth for:
//   - what counts as a valid, storable team color (#RRGGBB, 6 digits only —
//     stricter than contrast.ts's parser, which also accepts 3-digit
//     shorthand purely for rendering safety; storage must be canonical)
//   - how the branding edit form should initialize, given that
//     campaign_settings.primary_color/secondary_color can hold historical
//     placeholder junk whenever branding_customized is false (see
//     resolveTeamTheme()'s doc comment in teamTheme.ts) — the form must
//     never surface that junk as if it were a real, editable choice.
import { ELF_ORANGE, ELF_YELLOW } from "./teamTheme.ts";

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

/** True only for a strict #RRGGBB string (6 hex digits, leading # required).
 *  3-digit shorthand is intentionally rejected for storage — contrast.ts's
 *  parser stays permissive for rendering, this is stricter by design. */
export function isValidHexColor(value: string): boolean {
  return HEX_COLOR_RE.test(value.trim());
}

/** Validates and uppercases a hex color for storage. Returns null for any
 *  malformed input so callers can reject rather than store bad data. */
export function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim();
  return isValidHexColor(trimmed) ? trimmed.toUpperCase() : null;
}

export type BrandingFormColors = {
  primary: string;
  secondary: string;
};

/** Resolves what the branding edit form (and its live preview) should show
 *  on load. When branding_customized is false, the stored primary_color/
 *  secondary_color cannot be trusted — they may be onboarding backfill or
 *  old hardcoded values nobody chose — so the form must initialize to the
 *  ELF defaults, matching what the app is actually rendering right now.
 *  Only when branding_customized is true do the stored values represent a
 *  real, intentional choice worth showing back to the coach. */
export function resolveBrandingFormColors(settings: {
  primary_color?: string | null;
  secondary_color?: string | null;
  branding_customized?: boolean | null;
}): BrandingFormColors {
  if (!settings.branding_customized) {
    return { primary: ELF_ORANGE, secondary: ELF_YELLOW };
  }

  const primary = normalizeHexColor(settings.primary_color ?? "") ?? ELF_ORANGE;
  const secondary = normalizeHexColor(settings.secondary_color ?? "") ?? ELF_YELLOW;
  return { primary, secondary };
}

// The two write payloads below are the actual objects the branding PATCH
// route sends to updateCampaignSettings(). Pulling them out as pure,
// tested functions — rather than inlining object literals in the route —
// is what lets a test prove the independence/safety invariants directly:
// Reset can never accidentally include a color or logo_url key, and Save
// always sets branding_customized alongside both colors, with no way for
// the two operations' payload shapes to drift from what's tested here.

export type BrandingSavePayload = {
  primary_color: string;
  secondary_color: string;
  branding_customized: true;
};

/** Caller must pass already-validated (normalizeHexColor-passed) colors. */
export function buildBrandingSavePayload(primaryColor: string, secondaryColor: string): BrandingSavePayload {
  return { primary_color: primaryColor, secondary_color: secondaryColor, branding_customized: true };
}

export type BrandingResetPayload = { branding_customized: false };

/** Reset touches branding_customized ONLY — never primary_color,
 *  secondary_color, or logo_url. This is the entire safety mechanism that
 *  lets stored colors/logo survive a reset untouched. */
export function buildBrandingResetPayload(): BrandingResetPayload {
  return { branding_customized: false };
}
