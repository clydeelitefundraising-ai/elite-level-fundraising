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
