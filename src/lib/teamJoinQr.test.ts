import test from "node:test";
import assert from "node:assert/strict";
import {
  buildJoinUrl,
  sanitizeFilenameSegment,
  buildQrFilename,
  buildSignupSheetData,
} from "./teamJoinQr.ts";

// ── Canonical join URL ───────────────────────────────────────────────────

test("buildJoinUrl: encodes /join/{CODE} against the given origin", () => {
  assert.equal(buildJoinUrl("https://app.elitelevelfundraising.com", "AB23CD"), "https://app.elitelevelfundraising.com/join/AB23CD");
});

test("buildJoinUrl: team code alphabet (no 0/1/I/O) never needs URL-encoding", () => {
  // Mirrors the exact alphabet used by join-codes/route.ts's generateCode().
  const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (const ch of CODE_CHARS) {
    assert.equal(encodeURIComponent(ch), ch, `character "${ch}" would be encoded`);
  }
});

// ── Filename sanitization ────────────────────────────────────────────────

test("sanitizeFilenameSegment: lowercases and hyphenates", () => {
  assert.equal(sanitizeFilenameSegment("Monroe Valley"), "monroe-valley");
});

test("sanitizeFilenameSegment: collapses repeated separators and trims edges", () => {
  assert.equal(sanitizeFilenameSegment("  Track & Field!!  "), "track-field");
});

test("sanitizeFilenameSegment: strips characters unsafe in filenames (/, \\, :, etc.)", () => {
  assert.equal(sanitizeFilenameSegment("Team/Name:Test\\Path"), "team-name-test-path");
});

test("buildQrFilename: combines school + sport into a sensible filename", () => {
  assert.equal(buildQrFilename("Monroe Valley", "Track & Field"), "monroe-valley-track-field-join-qr.png");
});

test("buildQrFilename: falls back to a generic name if both inputs sanitize to empty", () => {
  assert.equal(buildQrFilename("!!!", "###"), "team-join-qr.png");
});

// ── Signup sheet data mapping ───────────────────────────────────────────

test("buildSignupSheetData: full settings (school, sport, mascot, season)", () => {
  const data = buildSignupSheetData("https://app.elitelevelfundraising.com", "AB23CD", {
    school_name: "Monroe Valley",
    sport_name:  "Track & Field",
    mascot:      "Wolves",
    season:      "Fall 2027",
  });
  assert.equal(data.heading, "Join Monroe Valley Track & Field on ELF");
  assert.equal(data.teamLine, "Monroe Valley Track & Field Wolves");
  assert.equal(data.seasonLine, "Fall 2027");
  assert.equal(data.code, "AB23CD");
  assert.equal(data.joinUrl, "https://app.elitelevelfundraising.com/join/AB23CD");
});

test("buildSignupSheetData: falls back cleanly when mascot is missing", () => {
  const data = buildSignupSheetData("https://app.elitelevelfundraising.com", "AB23CD", {
    school_name: "Monroe Valley",
    sport_name:  "Track & Field",
    mascot:      null,
    season:      "Fall 2027",
  });
  assert.equal(data.teamLine, "Monroe Valley Track & Field");
});

test("buildSignupSheetData: falls back cleanly when season is missing/blank", () => {
  const data = buildSignupSheetData("https://app.elitelevelfundraising.com", "AB23CD", {
    school_name: "Monroe Valley",
    sport_name:  "Track & Field",
    mascot:      undefined,
    season:      "   ",
  });
  assert.equal(data.seasonLine, null);
});
