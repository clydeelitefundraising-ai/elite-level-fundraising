/**
 * Centralized contrast-protection utility for team-supplied brand colors.
 *
 * Team colors (campaign_settings.primary_color / secondary_color) are
 * user-supplied and cannot be trusted to have safe contrast against a
 * text overlay. This module is the ONLY place in the app that computes
 * color-luminance-based foreground decisions — do not duplicate this
 * logic in individual components.
 *
 * Semantic colors (success/warning/error/info) never pass through this
 * utility and must not be derived from team colors.
 */

const DARK_FOREGROUND = "#111318";
const LIGHT_FOREGROUND = "#ffffff";

/**
 * Parses a hex color string (#rgb, #rrggbb, with or without leading #)
 * into 0-255 RGB channels. Returns null if the string isn't a valid hex
 * color, so callers can fall back to a safe default rather than throw.
 */
function parseHexColor(input: string): { r: number; g: number; b: number } | null {
  const hex = input.trim().replace(/^#/, "");

  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);
    return { r, g, b };
  }

  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return { r, g, b };
  }

  return null;
}

/** WCAG relative luminance (sRGB gamma-corrected). 0 = black, 1 = white. */
function relativeLuminance(r: number, g: number, b: number): number {
  const toLinear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const [rl, gl, bl] = [toLinear(r), toLinear(g), toLinear(b)];
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

/**
 * Given a background color, returns the foreground color (near-black or
 * white) that keeps text readable on top of it.
 *
 * Light backgrounds -> dark foreground. Dark backgrounds -> light
 * foreground. Threshold is luminance 0.42 (slightly below the naive 0.5
 * midpoint), which biases ambiguous mid-tone colors — the common case
 * for saturated brand colors like a school's primary red/blue/green —
 * toward light-on-color, since most real-world "medium" brand colors
 * read better with white text in practice than the raw luminance
 * midpoint would suggest.
 *
 * Falls back to dark-on-white (the ELF default treatment) if the input
 * isn't a parseable hex color, so a malformed team color never produces
 * invisible text.
 */
export function getForegroundForBackground(backgroundColor: string): string {
  const rgb = parseHexColor(backgroundColor);
  if (!rgb) return DARK_FOREGROUND;

  const luminance = relativeLuminance(rgb.r, rgb.g, rgb.b);
  return luminance > 0.42 ? DARK_FOREGROUND : LIGHT_FOREGROUND;
}
