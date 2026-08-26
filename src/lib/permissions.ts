// Client-safe. No server-only imports. Safe to use in "use client" components.
import type { CoachSession } from "@/lib/teamSession";
import type { MemberSession } from "@/lib/memberSession";

// ── Role sets ─────────────────────────────────────────────────────────────────

/** All roles stored in team_coaches that grant team-hub management access. */
const STAFF_ROLES = new Set(["head_coach", "assistant_coach", "booster"]);

/** team_coaches roles that are coaching staff specifically — excludes booster.
 *  Used where a feature intentionally restricts write access to coaches only
 *  (boosters view-only), as opposed to isStaff()'s broader coach+booster set. */
const COACH_ONLY_ROLES = new Set(["head_coach", "assistant_coach"]);

/** Staff roles that additionally carry destructive (delete) access. */
const HEAD_COACH_ROLES = new Set(["head_coach"]);

// ── Actor type ────────────────────────────────────────────────────────────────

/** Identity of an authorized ELF employee acting on a team, resolved from
 *  the `platform_admins` table (see src/lib/platformAdminSession.ts) — never
 *  from a team_coaches/team_members row. campaign_slug is the team currently
 *  being managed, not a stored membership; a platform admin has no row in
 *  team_coaches/team_members for any team. */
export type PlatformAdminActorSession = {
  platformAdminId: string;
  accountId:        string;
  name:             string;
  email:            string;
  campaign_slug:    string;
};

export type TeamActor =
  | { kind: "coach";          session: CoachSession }
  | { kind: "member";         session: MemberSession }
  | { kind: "platform_admin"; session: PlatformAdminActorSession }
  | { kind: "public" };

// ── Actor-level helpers ───────────────────────────────────────────────────────

/** True for any team staff (head coach, assistant coach, booster…) plus
 *  platform admins, who get Head-Coach-equivalent access to every team
 *  under their own ELF employee identity (see PlatformAdminActorSession).
 *  Boosters who join via team code are members with role="booster" and
 *  receive the same staff access as team_coaches with role="booster". */
export function isStaff(actor: TeamActor): boolean {
  if (actor.kind === "platform_admin") return true;
  if (actor.kind === "coach" && STAFF_ROLES.has(actor.session.role)) return true;
  if (actor.kind === "member" && actor.session.role === "booster") return true;
  return false;
}

/** True for roles with destructive (delete) access — the real Head Coach of
 *  the team, or a platform admin acting under their own identity. */
export function isHeadCoach(actor: TeamActor): boolean {
  if (actor.kind === "platform_admin") return true;
  return actor.kind === "coach" && HEAD_COACH_ROLES.has(actor.session.role);
}

/** True only for coaching staff (head/assistant coach) or a platform admin —
 *  excludes boosters. Use for features where boosters are intentionally
 *  view-only, e.g. Sponsors. */
export function isCoachOnly(actor: TeamActor): boolean {
  if (actor.kind === "platform_admin") return true;
  return actor.kind === "coach" && COACH_ONLY_ROLES.has(actor.session.role);
}

/** True for joined team members (athlete / parent). Platform admins are
 *  never members — they hold no team_members row. */
export function isMember(actor: TeamActor): boolean {
  return actor.kind === "member";
}

/** True only for a platform admin (an authorized ELF employee acting on a
 *  team under their own identity, not a team_coaches/team_members row). */
export function isPlatformAdmin(actor: TeamActor): boolean {
  return actor.kind === "platform_admin";
}

/** Returns the CoachSession if the actor is a real coach, null otherwise.
 *  Deliberately does NOT synthesize a CoachSession for a platform admin —
 *  doing so would fake a head_coach identity in session-shaped data, which
 *  is explicitly disallowed. Call sites typed against CoachSession | null
 *  must be updated to also check isPlatformAdmin()/isHeadCoach() rather
 *  than assuming a non-null coachSession() whenever isHeadCoach() is true;
 *  see the Phase 2 report for the enumerated call sites that need this. */
export function coachSession(actor: TeamActor): CoachSession | null {
  return actor.kind === "coach" ? actor.session : null;
}

/** @deprecated Prefer isStaff() — kept for backward compatibility. */
export function canWrite(actor: TeamActor): boolean {
  return isStaff(actor);
}

/** True only for the Head Coach of the campaign this actor is currently
 *  resolved against — the sole role allowed to manage Team Staff (invite,
 *  assign, remove Assistant Coaches/Boosters). Assistant coaches and
 *  boosters are staff too but must not get management rights, so this is
 *  deliberately narrower than isStaff()/isCoachOnly(). Single source of
 *  truth for staff-management authorization — reused by every staff route. */
export function canManageStaff(actor: TeamActor): boolean {
  return isHeadCoach(actor);
}

// ── Role-string helpers (for use with raw CoachSession.role values) ───────────

/** True if a raw team_coaches role string carries destructive access. */
export function isHeadCoachRole(role: string): boolean {
  return HEAD_COACH_ROLES.has(role);
}

/** Display label for a platform admin acting as author/sender/creator —
 *  platform_admins has no team_coaches-shaped role string to label, so
 *  this is the single place that decides what shows up in place of
 *  "Head Coach"/"Asst. Coach" wherever a platform admin authors content. */
export function platformAdminRoleLabel(): string {
  return "ELF Admin";
}

/** Human-readable display label for any team_coaches role string.
 *  Single place to update when new staff roles are added. */
export function staffRoleLabel(role: string): string {
  if (role === "head_coach")      return "Head Coach";
  if (role === "assistant_coach") return "Asst. Coach";
  if (role === "booster")         return "Booster";
  return role;
}

/** Human-readable display label for any team_members role string. */
export function memberRoleLabel(role: string): string {
  if (role === "athlete") return "Athlete";
  if (role === "parent")  return "Parent";
  if (role === "booster") return "Booster";
  return role;
}

/** Role label for a Team Selector card, given the raw role + which table it came from. */
export function teamRoleLabel(role: string, roleKind: "coach" | "member"): string {
  return roleKind === "coach" ? staffRoleLabel(role) : memberRoleLabel(role);
}
