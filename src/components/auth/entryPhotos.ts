// Phase A36 — deterministic daily photo rotation for the auth/entry
// surfaces only (/login, /teams, /forgot-password, /reset-password/[token],
// /enter-code, /join/[code] error states). No database, API route, cron, or
// external service — the selected photo is a pure function of the calendar
// date, computed at server-render time in each route's page.tsx and passed
// down as a prop, so every visitor sees the same image for that day with no
// client-side timer, no hydration mismatch, and no re-randomization on
// refresh.
//
// Adding a new sport later is a one-line addition to ELF_ENTRY_PHOTOS below
// — no other file needs to change.

export type EntryPhoto = {
  src:   string;
  sport: string;
  alt:   string;
};

export const ELF_ENTRY_PHOTOS: EntryPhoto[] = [
  {
    src:   "/auth/auth-track-01.webp",
    sport: "track",
    alt:   "An ELF Team athlete walking along a track at sunset, carrying spikes and a water bottle.",
  },
  {
    src:   "/auth/auth-tennis-01.webp",
    sport: "tennis",
    alt:   "An ELF Team tennis player standing courtside at golden hour with palm trees in the background.",
  },
  {
    src:   "/auth/auth-volleyball-01.webp",
    sport: "volleyball",
    alt:   "An ELF Team volleyball player walking onto an indoor court as teammates huddle near the net.",
  },
];

// Per-screen offsets into the same daily rotation, so the auth/entry
// journey shows variety across screens rather than one repeated image.
// With only 3 approved photos today, offsets wrap (mod the array length) —
// real reuse across screens is expected and approved, not a bug.
export const ENTRY_PHOTO_OFFSET = {
  login:          0,
  teams:          1,
  forgotPassword: 2,
  resetPassword:  3,
  enterCode:      4,
  joinError:      5,
} as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Exported for tests — a pure day-number derived from the date, not the
// current time-of-day, so every request within the same calendar day
// (UTC-based, deliberately timezone-independent so all visitors worldwide
// see the same photo on the same day) resolves to the same index.
export function dayIndex(date: Date = new Date()): number {
  return Math.floor(date.getTime() / MS_PER_DAY);
}

export function entryPhotoForOffset(
  offset: number,
  date: Date = new Date(),
  photos: readonly EntryPhoto[] = ELF_ENTRY_PHOTOS,
): EntryPhoto {
  const len = photos.length;
  const idx = ((dayIndex(date) + offset) % len + len) % len;
  return photos[idx];
}
