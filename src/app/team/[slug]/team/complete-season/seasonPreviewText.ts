// Complete Season Phase 3 — plain-language text for the preview's codes.
// Client-safe (no imports).

/** Why completion can't happen yet (team_season_preview blockers). */
export const BLOCKER_TEXT: Record<string, string> = {
  season_already_completed: "This season has already been completed.",
  season_team_archived: "This team is archived, so its season can't be completed.",
  season_successor_slug_required: "Choose the new team address — this team's address has no year to advance.",
  season_successor_slug_invalid: "The new team address isn't valid. Use lowercase letters, numbers and hyphens.",
  season_successor_slug_same: "The new team address must be different from the current one.",
  season_successor_slug_taken: "A team already uses that address. Choose a different one.",
  season_label_required: "Choose the new season name — this season's name isn't in a format that can be advanced automatically.",
  season_label_invalid: "The new season name can be at most 40 characters.",
  season_no_head_coach_carried: "No Head Coach with an ELF account would carry over to the new season.",
  season_pending_athlete_requests: "Athlete join requests are waiting. Approve or decline them first.",
  season_pending_parent_requests: "Parent access requests are waiting. Approve or decline them first.",
  season_pending_staff_invitations: "Staff invitations haven't been accepted. Wait for them, or revoke them, first.",
};

/** Things to know that don't block completion (preview warnings). */
export const WARNING_TEXT: Record<string, string> = {
  season_flagged_grades: "Some athletes have a blank or unrecognized grade. They'll carry over with that grade unchanged — review them first.",
  season_members_must_rejoin: "Some members don't have ELF accounts and won't carry over. They'll need to rejoin the new season.",
  season_coaches_must_rejoin: "Some coaches don't have ELF accounts and won't carry over. They'll need to be invited to the new season.",
  season_pending_fundraising_inquiries: "A fundraising inquiry for this team is still open with ELF.",
  season_recent_donations: "Donations came in during the last 24 hours. They stay with this season.",
  season_attendance_drafts_frozen: "Attendance from the last two weeks will become read-only.",
  season_label_slug_year_mismatch: "The new team address and season name point to different years. Check both.",
};

export function blockerText(code: string): string {
  return BLOCKER_TEXT[code] ?? "Something needs attention before this season can be completed.";
}
export function warningText(code: string): string {
  return WARNING_TEXT[code] ?? "Review this before completing the season.";
}

export const FLAG_REASON_TEXT: Record<string, string> = {
  blank: "No grade",
  other: "Other",
  nonstandard: "Unrecognized grade",
};

export const ROLE_TEXT: Record<string, string> = {
  athlete: "Athlete", parent: "Parent", booster: "Booster",
  head_coach: "Head Coach", assistant_coach: "Assistant Coach",
};

export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
