// Pure logic for the Schools directory/detail read layer (schools.ts) —
// deliberately zero-dependency (not even ./_client) so it's directly
// unit-testable via Node's native test runner without hitting the
// extensionless-relative-import resolution limit that module has.

/** True for a campaign_settings row that counts as an "active" team for
 *  directory/status purposes — archived is the only signal the schema
 *  gives us for this; a null archived value (legacy rows) counts as active
 *  rather than being silently excluded. */
export function isActiveTeam(team: { archived: boolean | null }): boolean {
  return team.archived !== true;
}

/** Given every campaign_settings row already fetched for a set of
 *  organizations, groups them by organization_id. A row with no
 *  organization_id (not yet linked) is excluded, never guessed. */
export function groupTeamsByOrganization<T extends { organization_id: string | null }>(
  teams: T[],
): Map<string, T[]> {
  const byOrg = new Map<string, T[]>();
  for (const t of teams) {
    if (!t.organization_id) continue;
    const list = byOrg.get(t.organization_id) ?? [];
    list.push(t);
    byOrg.set(t.organization_id, list);
  }
  return byOrg;
}

/** A school's "head coach" is only ever shown when unambiguous — exactly
 *  one team at that school. Multiple teams could each have a different
 *  head coach, and guessing one would misattribute a team's coach to the
 *  whole school; zero teams obviously has none. */
export function pickDirectoryHeadCoach(
  orgTeams: { campaign_slug: string }[],
  headCoachBySlug: Map<string, string>,
): string | null {
  if (orgTeams.length !== 1) return null;
  return headCoachBySlug.get(orgTeams[0].campaign_slug) ?? null;
}

export function deriveSchoolStatus(activeTeamCount: number): "active" | "no_active_teams" {
  return activeTeamCount > 0 ? "active" : "no_active_teams";
}
