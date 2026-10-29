// Settings Redesign — which Settings categories each role sees, in one pure
// place. The Settings home (rows shown) and every dedicated screen (direct
// URL access) use the same rule, so a row can never appear for a role that
// the screen itself would refuse. These are presentation boundaries only:
// every write behind them is still authorized server-side by its existing
// API route (isHeadCoach / isStaff / account session), unchanged.
//
// Same boundaries as the previous single Settings page:
//   - Head Coach: everything.
//   - Assistant Coach: Team Access (copy link, QR, signup sheet — join-code
//     generate/revoke stays Head-Coach-only inside the screen), Switch
//     Teams, plus the personal categories.
//   - Athlete, Parent, Booster and a Platform Admin browsing a team: the
//     personal categories only (Notifications + Account & Privacy).
import type { TeamActor } from "../../../../lib/permissions.ts";

export type SettingsCategory =
  | "access" | "branding" | "coach-fundraising" | "athlete-photos" | "staff" | "teams"
  | "notifications" | "account";

export const TEAM_CATEGORIES: readonly SettingsCategory[] =
  ["access", "branding", "coach-fundraising", "athlete-photos", "staff", "teams"];
export const PERSONAL_CATEGORIES: readonly SettingsCategory[] = ["notifications", "account"];

const HEAD_COACH_ONLY = new Set<SettingsCategory>(["branding", "coach-fundraising", "athlete-photos", "staff"]);
const ANY_COACH = new Set<SettingsCategory>(["access", "teams"]);

export function isHeadCoachActor(actor: TeamActor): boolean {
  return actor.kind === "coach" && actor.session.role === "head_coach";
}

export function canOpenSettingsCategory(actor: TeamActor, category: SettingsCategory): boolean {
  if (actor.kind === "public") return false;
  if (PERSONAL_CATEGORIES.includes(category)) return true;
  if (HEAD_COACH_ONLY.has(category)) return isHeadCoachActor(actor);
  if (ANY_COACH.has(category)) return actor.kind === "coach";
  return false;
}

export function settingsCategoriesFor(actor: TeamActor): { team: SettingsCategory[]; personal: SettingsCategory[] } {
  return {
    team: TEAM_CATEGORIES.filter(c => canOpenSettingsCategory(actor, c)),
    personal: PERSONAL_CATEGORIES.filter(c => canOpenSettingsCategory(actor, c)),
  };
}

/** Where each category opens. Team Staff and Switch Teams are existing
 *  pages, linked rather than duplicated. */
export function settingsCategoryHref(slug: string, category: SettingsCategory): string {
  if (category === "staff") return `/team/${slug}/staff`;
  if (category === "teams") return "/teams";
  return `/team/${slug}/settings/${category}`;
}

export const SETTINGS_CATEGORY_TITLES: Record<SettingsCategory, string> = {
  access: "Team Access",
  branding: "Team Branding",
  "coach-fundraising": "Coach Fundraising",
  "athlete-photos": "Public Athlete Photos",
  staff: "Team Staff",
  teams: "Switch Teams",
  notifications: "Notifications",
  account: "Account & Privacy",
};
