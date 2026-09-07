// Pure extraction of getAccountTeams()'s role-merge step (accountSession.ts)
// so it's testable without pulling in next/headers (which that file also
// imports, and which this repo's node:test runner can't resolve outside a
// Next build). Behavior is unchanged from the inline version this replaced
// — member role wins over coach role for the same campaign_slug, exactly
// mirroring getActorForAccount()'s documented precedence.
export type AccountRoleRow = { campaign_slug: string; role: string };
export type RoleBySlug = Record<string, { role: string; role_kind: "coach" | "member" }>;

export function mergeRoleBySlug(coachRows: AccountRoleRow[], memberRows: AccountRoleRow[]): RoleBySlug {
  const roleBySlug: RoleBySlug = {};

  for (const r of memberRows) {
    roleBySlug[r.campaign_slug] = { role: r.role, role_kind: "member" };
  }
  for (const r of coachRows) {
    if (!roleBySlug[r.campaign_slug]) roleBySlug[r.campaign_slug] = { role: r.role, role_kind: "coach" };
  }

  return roleBySlug;
}
