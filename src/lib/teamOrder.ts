// Custom Team Ordering — pure ordering rules shared by getAccountTeams()
// (server, accountSession.ts), the save route (api/account/team-order) and
// the Team Selector's reorder mode (client, TeamsView.tsx). No imports and
// no env reads, so it is safe in client bundles and plain `node --test`.
//
// Saved order lives in account_team_order.team_slugs (see supabase/
// migrations/phase_t1_account_team_order.sql). Display rules:
//   1. saved slugs that are still current memberships, in saved order
//   2. every other membership (newly joined teams), oldest membership
//      first — so a new team lands at the bottom
//   3. saved slugs that are no longer memberships are ignored
// With no saved order, the whole list is just rule 2.

// Upper bound on a submitted order — far above any real account's team
// count, only here so a malformed request can't write an unbounded array.
export const MAX_SAVED_TEAM_SLUGS = 200;

type Sluggable = { campaign_slug: string };
type MembershipRow = { campaign_slug: string; created_at?: string | null };

/** First occurrence wins; non-strings and empty strings are dropped. */
export function dedupeTeamSlugs(slugs: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of slugs) {
    if (typeof s !== "string" || s === "" || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/**
 * Earliest membership timestamp per campaign_slug. An account can hold a
 * team_coaches row and a team_members row for the same team; the team
 * "joined" date is whichever came first. Missing/unparseable timestamps
 * are null.
 */
export function earliestJoinedAtBySlug(rows: readonly MembershipRow[]): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const row of rows) {
    const t = row.created_at ? Date.parse(row.created_at) : NaN;
    const time = Number.isNaN(t) ? null : t;
    const prev = out[row.campaign_slug];
    if (prev === undefined) out[row.campaign_slug] = time;
    else if (time !== null && (prev === null || time < prev)) out[row.campaign_slug] = time;
  }
  return out;
}

/**
 * Default order: oldest membership first. Ties (and missing timestamps,
 * which sort last) break on campaign_slug so the result never depends on
 * database row order.
 */
export function sortByJoinedAt<T extends Sluggable>(teams: readonly T[], joinedAtBySlug: Record<string, number | null>): T[] {
  return [...teams].sort((a, b) => {
    const ta = joinedAtBySlug[a.campaign_slug] ?? null;
    const tb = joinedAtBySlug[b.campaign_slug] ?? null;
    if (ta !== tb) {
      if (ta === null) return 1;
      if (tb === null) return -1;
      return ta - tb;
    }
    return a.campaign_slug < b.campaign_slug ? -1 : a.campaign_slug > b.campaign_slug ? 1 : 0;
  });
}

/**
 * Listed slugs first, in list order; every unlisted team keeps its
 * incoming relative order after them. Listed slugs with no matching team
 * (stale) are ignored.
 */
export function applySlugOrder<T extends Sluggable>(teams: readonly T[], slugs: readonly string[] | null | undefined): T[] {
  if (!slugs || slugs.length === 0) return [...teams];
  const bySlug = new Map(teams.map(t => [t.campaign_slug, t]));
  const listed: T[] = [];
  const used = new Set<string>();
  for (const slug of slugs) {
    const team = bySlug.get(slug);
    if (!team || used.has(slug)) continue;
    used.add(slug);
    listed.push(team);
  }
  return [...listed, ...teams.filter(t => !used.has(t.campaign_slug))];
}

/** The full rule set used by getAccountTeams(). */
export function orderAccountTeams<T extends Sluggable>(
  teams:          readonly T[],
  joinedAtBySlug: Record<string, number | null>,
  savedSlugs:     readonly string[] | null | undefined,
): T[] {
  return applySlugOrder(sortByJoinedAt(teams, joinedAtBySlug), savedSlugs);
}

/** Complete Season Phase 4: active seasons before completed (archived) ones.
 *  Stable — each group keeps the order it came in (the account's saved
 *  order), so custom ordering still applies within active and completed. */
export function activeSeasonsFirst<T>(teams: readonly T[], isCompleted: (team: T) => boolean): T[] {
  return [...teams.filter(t => !isCompleted(t)), ...teams.filter(t => isCompleted(t))];
}

/** Moves one item; out-of-range moves return an unchanged copy. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  if (from < 0 || from >= next.length || to < 0 || to >= next.length || from === to) return next;
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((s, i) => s === b[i]);
}
