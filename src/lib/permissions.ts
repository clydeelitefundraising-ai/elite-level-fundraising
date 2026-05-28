// Client-safe. No server-only imports. Safe to use in "use client" components.
import type { CoachSession } from "@/lib/teamSession";
import type { MemberSession } from "@/lib/memberSession";

export type TeamActor =
  | { kind: "coach";  session: CoachSession  }
  | { kind: "member"; session: MemberSession }
  | { kind: "public" };

/** True only for coaches — the only role that can write. */
export function canWrite(actor: TeamActor): boolean {
  return actor.kind === "coach";
}

/** True only for head coaches (can delete). */
export function isHeadCoach(actor: TeamActor): boolean {
  return actor.kind === "coach" && actor.session.role === "head_coach";
}

/** Returns the CoachSession if the actor is a coach, null otherwise.
 *  Use this to satisfy existing components typed against CoachSession | null. */
export function coachSession(actor: TeamActor): CoachSession | null {
  return actor.kind === "coach" ? actor.session : null;
}
