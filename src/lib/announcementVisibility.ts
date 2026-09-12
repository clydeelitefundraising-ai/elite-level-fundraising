// Phase QA-Build8 — Issue 7 (critical audience-leak fix).
//
// isAnnouncementVisibleToActor lives in its own small file (rather than
// inline in teamData.ts, which imports several modules via the "@/lib/..."
// alias that node --test cannot resolve) purely so this pure, critical
// predicate stays directly unit-testable without a live DB/Next.js — see
// teamData.test.ts. teamData.ts imports it via its own existing "@/lib/..."
// alias style, unchanged from how it imports everything else.
import { isVisibleToMember } from "./notifications.ts";
import type { TeamActor } from "./permissions.ts";

// The single shared audience-filter predicate used by BOTH
// getAnnouncements() and getAnnouncementMeta() (teamData.ts) — the feed
// and the nav badge count — so the two data-fetchers can never drift from
// each other. Reuses isVisibleToMember() (notifications.ts), the one
// already-correct, already-proven implementation of the per-role audience
// matrix in this app — never reimplemented here. Coaches and platform
// admins are exempted from the filter entirely (see every authorized
// announcement regardless of audience), matching the exact same
// actor.kind === "member" branching notifications.ts's own caller already
// uses for the identical "coach always sees everything" rule.
export function isAnnouncementVisibleToActor(
  announcement: { recipient_scope: string; recipient_athlete_id: string | null },
  actor: TeamActor,
): boolean {
  if (actor.kind !== "member") return true;
  return isVisibleToMember(announcement, { role: actor.session.role, athlete_id: actor.session.athlete_id });
}
