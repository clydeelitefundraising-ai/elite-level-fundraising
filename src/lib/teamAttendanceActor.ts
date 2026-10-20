// Team Management Phase 5 — who is saving attendance, as the database
// function team_attendance_save_draft() expects it (p_actor).
//
// Trust boundary: the database can't see the request or its cookies — the
// app server authenticates the person (signed elf_session / legacy coach
// cookie, verified with secrets the database doesn't hold) and calls the
// database with the service-role key, exactly like every other ELF write.
// The database then re-checks that the identity is a Head/Assistant Coach
// of this team or a platform admin, but it cannot tell whether the server
// was handed that identity by the person or by a forged request body.
//
// So p_actor must ONLY ever be built here, from the TeamActor that
// getTeamActor(slug) resolved on the server — never from anything the
// client sends. Attendance routes pass the resolved actor to the store; the
// store calls attendanceDbActor(). Nothing else may construct p_actor
// (teamAttendanceActor.test.ts enforces this across the codebase).
//
// Deliberately import-free at runtime (type-only import) so client code
// can share canEditAttendance and Node's test runner loads it directly.
import type { TeamActor } from "./permissions.ts";

export type AttendanceDbActor =
  | { coach_id: string }
  | { platform_admin_id: string };

/** The database identity for an authorized attendance editor, or null for
 *  everyone else (boosters, athletes, parents, signed-out visitors).
 *  Head Coach / Assistant Coach -> their team_coaches id (legacy
 *  team-login coaches included); platform admin -> their platform_admins
 *  id, under their own identity. Builds a new object from the two session
 *  fields only — nothing else on the actor is copied. */
export function attendanceDbActor(actor: TeamActor): AttendanceDbActor | null {
  if (actor.kind === "platform_admin") {
    const id = actor.session.platformAdminId;
    return typeof id === "string" && id ? { platform_admin_id: id } : null;
  }
  if (actor.kind === "coach") {
    const role: string = actor.session.role;
    const id = actor.session.id;
    if ((role === "head_coach" || role === "assistant_coach") && typeof id === "string" && id) {
      return { coach_id: id };
    }
  }
  return null;
}

/** Who may create and edit attendance drafts: Head Coach, Assistant Coach,
 *  platform admin (isCoachOnly's set). The routes still rely on the
 *  database's own re-check. */
export function canEditAttendance(actor: TeamActor): boolean {
  return attendanceDbActor(actor) !== null;
}
