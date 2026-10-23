// Complete Season — is a team's season completed? Pure and dependency-free
// so client components can use it too (seasonWritable.ts is the server
// guard built on it).
export const SEASON_COMPLETED_CODE = "season_completed";
export const SEASON_COMPLETED_MESSAGE = "This season has been completed and is read-only.";

export type SeasonState = {
  season_completed_at?: string | null;
  successor_campaign_slug?: string | null;
};

/** True once the season has been completed (either marker is enough). */
export function isSeasonCompleted(state: SeasonState | null | undefined): boolean {
  return !!state && (!!state.season_completed_at || !!state.successor_campaign_slug);
}

// Displayed in Arizona time, like every other team-facing date (see
// calendarShared.ts), so server and browser always agree on the day.
const SEASON_DATE_TZ = "America/Phoenix";

/** "October 22, 2026" — or null when the timestamp is missing/invalid. */
export function formatSeasonCompletedDate(completedAt: string | null | undefined): string | null {
  if (!completedAt) return null;
  const d = new Date(completedAt);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", { timeZone: SEASON_DATE_TZ, year: "numeric", month: "long", day: "numeric" }).format(d);
}

/** The completed-season banner copy, with the real completion date. */
export function completedSeasonBannerText(completedAt: string | null | undefined): string {
  const date = formatSeasonCompletedDate(completedAt);
  return `This season was completed${date ? ` on ${date}` : ""}. You are viewing archived information. This season is read-only.`;
}
