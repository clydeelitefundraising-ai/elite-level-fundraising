// Team-level permission for showing athletes' ELF Team App profile photos on
// the team's PUBLIC fundraising pages (the personalized athlete page). Off
// for every team until the Head Coach turns it on and confirms the program
// holds the necessary media permissions; individual athletes can be hidden
// even while it is on. Client-safe and pure — the settings UI, the settings
// route and the public photo route share these rules.

/** Bumped whenever CONFIRMATION_TEXT changes materially, so the audit log
 *  records exactly which wording the Head Coach agreed to. */
export const PUBLIC_PHOTO_CONFIRMATION_VERSION = "2026-10-28";

export const PUBLIC_PHOTO_CONFIRMATION_TEXT =
  "I confirm that our school and program have the media permissions needed to publish these athletes' " +
  "photos for public fundraising — including permission from each athlete's parent or guardian where " +
  "required — and that I will hide any athlete whose photo may not be published.";

export const PUBLIC_PHOTO_SETTING_TITLE = "Show athlete photos on public fundraising pages";

export const PUBLIC_PHOTO_SETTING_DESCRIPTION =
  "When on, an athlete's ELF Team App profile photo appears on their personal fundraising link, which " +
  "anyone with the link can see. Athletes without a photo, and any athlete you hide, show your team logo instead. " +
  "Turning this off removes athlete photos from your public pages.";

/** The single rule for whether an athlete's photo may appear publicly.
 *  Anything other than an explicit `true` team setting (missing column,
 *  null, false) means no. */
export function publicAthletePhotoAllowed(teamSetting: unknown, athleteExcluded: unknown): boolean {
  return teamSetting === true && athleteExcluded !== true;
}

/** "Hana Head (Head Coach)" — who last changed the setting, for display. */
export function settingChangedBy(name: string, kind: "coach" | "platform_admin"): string {
  return `${name} (${kind === "coach" ? "Head Coach" : "ELF Platform Admin"})`;
}
