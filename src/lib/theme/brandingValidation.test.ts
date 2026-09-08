import test from "node:test";
import assert from "node:assert/strict";
import {
  isValidHexColor,
  normalizeHexColor,
  resolveBrandingFormColors,
  buildBrandingSavePayload,
  buildBrandingResetPayload,
} from "./brandingValidation.ts";
import { ELF_ORANGE, ELF_YELLOW, resolveTeamTheme } from "./teamTheme.ts";
import { getForegroundForBackground } from "./contrast.ts";

// Phase A34 (Team Branding Settings). Locks in the two properties the
// security review and product spec both depend on: strict #RRGGBB-only
// validation (no 3-digit shorthand, no unvalidated CSS-variable
// injection), and the historical-placeholder-safety rule — a team with
// branding_customized=false must never have its edit form/preview
// initialized from raw stored colors, since those may be onboarding
// backfill junk nobody chose.

test("isValidHexColor: accepts well-formed 6-digit hex with leading #", () => {
  assert.equal(isValidHexColor("#1B4FA8"), true);
  assert.equal(isValidHexColor("#ffffff"), true);
  assert.equal(isValidHexColor("#000000"), true);
});

test("isValidHexColor: rejects missing #", () => {
  assert.equal(isValidHexColor("1B4FA8"), false);
});

test("isValidHexColor: rejects 3-digit shorthand", () => {
  assert.equal(isValidHexColor("#fff"), false);
  assert.equal(isValidHexColor("#abc"), false);
});

test("isValidHexColor: rejects malformed input", () => {
  assert.equal(isValidHexColor("red"), false);
  assert.equal(isValidHexColor("#GGGGGG"), false);
  assert.equal(isValidHexColor("#12345"), false);
  assert.equal(isValidHexColor("#1234567"), false);
  assert.equal(isValidHexColor(""), false);
  assert.equal(isValidHexColor("<script>alert(1)</script>"), false);
});

test("normalizeHexColor: uppercases valid input consistently", () => {
  assert.equal(normalizeHexColor("#1b4fa8"), "#1B4FA8");
  assert.equal(normalizeHexColor("#1B4FA8"), "#1B4FA8");
  assert.equal(normalizeHexColor("  #1b4fa8  "), "#1B4FA8");
});

test("normalizeHexColor: returns null for invalid input", () => {
  assert.equal(normalizeHexColor("#fff"), null);
  assert.equal(normalizeHexColor("not-a-color"), null);
  assert.equal(normalizeHexColor(""), null);
});

test("resolveBrandingFormColors: branding_customized=false initializes to ELF defaults, never raw stored colors", () => {
  const result = resolveBrandingFormColors({
    primary_color: "#1B4FA8",   // historical onboarding placeholder
    secondary_color: "#0B1E3D", // old hardcoded navy stored as if chosen
    branding_customized: false,
  });
  assert.equal(result.primary, ELF_ORANGE);
  assert.equal(result.secondary, ELF_YELLOW);
});

test("resolveBrandingFormColors: branding_customized undefined/absent behaves the same as false", () => {
  const result = resolveBrandingFormColors({ primary_color: "#1B4FA8", secondary_color: "#0B1E3D" });
  assert.equal(result.primary, ELF_ORANGE);
  assert.equal(result.secondary, ELF_YELLOW);
});

test("resolveBrandingFormColors: branding_customized=true initializes from real stored colors", () => {
  const result = resolveBrandingFormColors({
    primary_color: "#ab12cd",
    secondary_color: "#00ff00",
    branding_customized: true,
  });
  assert.equal(result.primary, "#AB12CD");
  assert.equal(result.secondary, "#00FF00");
});

test("resolveBrandingFormColors: branding_customized=true but malformed stored colors falls back to ELF defaults", () => {
  const result = resolveBrandingFormColors({
    primary_color: "not-a-color",
    secondary_color: null,
    branding_customized: true,
  });
  assert.equal(result.primary, ELF_ORANGE);
  assert.equal(result.secondary, ELF_YELLOW);
});

test("buildBrandingSavePayload: sets both colors and branding_customized=true, nothing else", () => {
  const payload = buildBrandingSavePayload("#AB12CD", "#00FF00");
  assert.deepEqual(payload, { primary_color: "#AB12CD", secondary_color: "#00FF00", branding_customized: true });
  assert.equal(Object.keys(payload).length, 3);
  assert.ok(!("logo_url" in payload));
});

test("buildBrandingResetPayload: touches ONLY branding_customized=false — never colors or logo_url", () => {
  const payload = buildBrandingResetPayload();
  assert.deepEqual(payload, { branding_customized: false });
  assert.equal(Object.keys(payload).length, 1);
  assert.ok(!("primary_color" in payload));
  assert.ok(!("secondary_color" in payload));
  assert.ok(!("logo_url" in payload));
});

test("live preview theme (resolveTeamTheme + getForegroundForBackground) matches the shared contrast utility exactly", () => {
  for (const bg of ["#FF5A1F", "#111318", "#FFFFFF", "#1B4FA8"]) {
    const theme = resolveTeamTheme(bg, "#000000", true);
    assert.equal(theme["--team-primary-foreground"], getForegroundForBackground(bg));
  }
});
