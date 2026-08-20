// Phase 5: pure helpers for the Team QR / Join Code feature — no React,
// no fetch, so these are directly node:test-able. Both TeamQrModal.tsx
// and PrintSignupSheet.tsx call these instead of independently
// formatting the same values, so they can never drift.

// Canonical QR/join-link target — /join/[code] already exists
// specifically for this purpose (see src/app/join/[code]/page.tsx) and
// re-validates server-side on every visit; this function only builds the
// URL string, it has no bearing on what's actually allowed to join.
export function buildJoinUrl(origin: string, code: string): string {
  return `${origin}/join/${code}`;
}

// Filenames must be filesystem/URL-safe on every OS a downloaded PNG
// might land on — lowercase, alphanumerics and hyphens only, no
// repeated/leading/trailing hyphens.
export function sanitizeFilenameSegment(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildQrFilename(schoolName: string, sportName: string): string {
  const parts = [schoolName, sportName].map(sanitizeFilenameSegment).filter(Boolean);
  const base = parts.join("-") || "team";
  return `${base}-join-qr.png`;
}

// Phase 8b: filename for the shared/downloaded signup-sheet image (used
// by the iOS share-sheet fallback for Print Signup Sheet — see
// TeamQrModal.tsx). Mirrors buildQrFilename's convention exactly.
export function buildSignupSheetFilename(schoolName: string, sportName: string): string {
  const parts = [schoolName, sportName].map(sanitizeFilenameSegment).filter(Boolean);
  const base = parts.join("-") || "team";
  return `${base}-signup-sheet.png`;
}

export type SignupSheetData = {
  heading:      string; // "Join <School> <Sport> on ELF"
  teamLine:     string; // "<School> <Sport>" — mascot appended if present
  seasonLine:   string | null;
  code:         string;
  joinUrl:      string;
};

// Single source of truth for what text the modal preview and the print
// sheet both show — "fallback cleanly if logo/mascot/season is missing"
// lives here, once, rather than duplicated in two components.
export function buildSignupSheetData(
  origin: string,
  code: string,
  settings: { school_name: string; sport_name: string; mascot?: string | null; season?: string | null },
): SignupSheetData {
  const schoolAndSport = [settings.school_name, settings.sport_name].filter(Boolean).join(" ");
  const teamLine = settings.mascot ? `${schoolAndSport} ${settings.mascot}` : schoolAndSport;
  return {
    heading:    `Join ${schoolAndSport} on ELF`,
    teamLine,
    seasonLine: settings.season?.trim() ? settings.season.trim() : null,
    code,
    joinUrl:    buildJoinUrl(origin, code),
  };
}
