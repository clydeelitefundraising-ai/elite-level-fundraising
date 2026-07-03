// Client-safe. No server-only imports. Safe to use in "use client" components.
import type { CoachSession } from "@/lib/teamSession";
import type { MemberSession } from "@/lib/memberSession";

// ── Role sets ─────────────────────────────────────────────────────────────────

/** All roles stored in team_coaches that grant team-hub management access. */
const STAFF_ROLES = new Set(["head_coach", "assistant_coach", "booster"]);

/** Staff roles that additionally carry destructive (delete) access. */
const HEAD_COACH_ROLES = new Set(["head_coach"]);

// ── Actor type ────────────────────────────────────────────────────────────────

export type TeamActor =
  | { kind: "coach";  session: CoachSession  }
  | { kind: "member"; session: MemberSession }
  | { kind: "public" };

// ── Actor-level helpers ───────────────────────────────────────────────────────

/** True for any team staff (head coach, assistant coach, booster…).
 *  Boosters who join via team code are members with role="booster" and
 *  receive the same staff access as team_coaches with role="booster". */
export function isStaff(actor: TeamActor): boolean {
  if (actor.kind === "coach" && STAFF_ROLES.has(actor.session.role)) return true;
  if (actor.kind === "member" && actor.session.role === "booster") return true;
  return false;
}

/** True only for roles with destructive (delete) access. */
export function isHeadCoach(actor: TeamActor): boolean {
  return actor.kind === "coach" && HEAD_COACH_ROLES.has(actor.session.role);
}

/** True for joined team members (athlete / parent). */
export function isMember(actor: TeamActor): boolean {
  return actor.kind === "member";
}

/** Returns the CoachSession if the actor is staff, null otherwise.
 *  Use this to satisfy components typed against CoachSession | null. */
export function coachSession(actor: TeamActor): CoachSession | null {
  return actor.kind === "coach" ? actor.session : null;
}

/** @deprecated Prefer isStaff() — kept for backward compatibility. */
export function canWrite(actor: TeamActor): boolean {
  return isStaff(actor);
}

// ── Role-string helpers (for use with raw CoachSession.role values) ───────────

/** True if a raw team_coaches role string carries destructive access. */
export function isHeadCoachRole(role: string): boolean {
  return HEAD_COACH_ROLES.has(role);
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
