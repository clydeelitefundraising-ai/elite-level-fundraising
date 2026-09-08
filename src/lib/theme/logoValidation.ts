// Client-safe. No server-only imports.
//
// Phase A34 (Team Branding Settings). Shared constants/checks for the team
// logo upload route — kept separate from the sponsor-logo route's own
// constants since this feature intentionally diverges from it (PNG output
// to preserve transparency, no forced JPEG re-encode).
export const MAX_LOGO_BYTES = 5 * 1024 * 1024;

/** Input formats accepted for upload. SVG is intentionally excluded this
 *  phase (raw SVG can carry executable script content, and sharp doesn't
 *  rasterize it safely without extra hardening). */
export const ALLOWED_LOGO_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

/** Longest edge the stored logo is resized to (fit: "inside", no
 *  upscaling) — generous enough for retina display without storing
 *  arbitrarily large source images. */
export const MAX_LOGO_DIMENSION = 1024;

export function isAllowedLogoMimeType(type: string): boolean {
  return ALLOWED_LOGO_MIME_TYPES.has(type);
}

export type LogoUpdatePayload = { logo_url: string };

/** The actual write payload the logo upload route sends to
 *  updateCampaignSettings(). Deliberately excludes branding_customized —
 *  a logo change must never activate a team's colors as a side effect. */
export function buildLogoUpdatePayload(logoUrl: string): LogoUpdatePayload {
  return { logo_url: logoUrl };
}
