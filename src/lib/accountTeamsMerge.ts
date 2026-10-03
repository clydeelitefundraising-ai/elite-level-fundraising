// Pure extraction of getAccountTeams()'s role-merge step (accountSession.ts)
// so it's testable without pulling in next/headers (which that file also
// imports, and which this repo's node:test runner can't resolve outside a
// Next build).
import { isCoachOnlyRole } from "./permissions.ts";

export type AccountRoleRow = { campaign_slug: string; role: string };
export type RoleBySlug = Record<string, { role: string; role_kind: "coach" | "member" }>;

// Family Relationships Phase A: shared precedence rule for resolving which
// relationship "wins" for one account on one campaign, used by BOTH
// getActorForAccount() (accountSession.ts — the real per-request actor
// resolution) and mergeRoleBySlug() below (the Team Selector's display
// merge), so the two can never disagree about which role an account
// actually has on a given team.
//
// head_coach/assistant_coach must never be silently lost just because the
// same account also holds a team_members row for that campaign (e.g. a
// coach who is also a parent) — that was the bug this phase fixes. A
// booster team_coaches row does NOT override a member row: isStaff()
// already grants identical staff access via a member-booster role, so
// overriding would only discard member-specific session data (athlete_id)
// with no authorization benefit — this exactly preserves the previous
// "member wins" behavior for every booster case.
export function resolveAccountActorKind(
  coachRole:    string | null,
  hasMemberRow: boolean,
): "coach" | "member" | "none" {
  if (coachRole && isCoachOnlyRole(coachRole)) return "coach";
  if (hasMemberRow) return "member";
  if (coachRole) return "coach";
  return "none";
}

export function mergeRoleBySlug(coachRows: AccountRoleRow[], memberRows: AccountRoleRow[]): RoleBySlug {
  const coachBySlug  = new Map(coachRows.map(r => [r.campaign_slug, r.role]));
  const memberBySlug = new Map(memberRows.map(r => [r.campaign_slug, r.role]));
  const slugs = new Set([...coachBySlug.keys(), ...memberBySlug.keys()]);

  const roleBySlug: RoleBySlug = {};
  for (const slug of slugs) {
    const coachRole = coachBySlug.get(slug) ?? null;
    const kind = resolveAccountActorKind(coachRole, memberBySlug.has(slug));
    if (kind === "coach")  roleBySlug[slug] = { role: coachRole as string, role_kind: "coach" };
    if (kind === "member") roleBySlug[slug] = { role: memberBySlug.get(slug) as string, role_kind: "member" };
  }

  return roleBySlug;
}
