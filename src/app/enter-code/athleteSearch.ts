// Parent athlete picker UX polish (follow-up to Family Relationships Phase
// C2). Pure client-side search over the roster the page already loaded —
// no new API endpoint, no server changes. Deliberately tiny: this file only
// answers "which athletes match this query, excluding ones already
// selected" — selection state itself stays in EnterCodeView's
// selectedAthleteIds, the single source of truth untouched since Phase C2.
export type SearchableAthlete = { id: string; name: string; event?: string };

// Client-side mirror of MAX_PARENT_JOIN_ATHLETES
// (src/lib/platform/parentJoinRequest.ts) — kept as a separate constant
// rather than importing that module here, since it pulls in server-only
// REST/DB code that must never ship in a client bundle. This only gates
// the UI (a graceful "you've selected enough" message); the server's own
// cap is the real enforcement and is unchanged by this UX patch. Keep this
// number in sync with MAX_PARENT_JOIN_ATHLETES if that ever changes.
export const MAX_PARENT_ATHLETES_CLIENT = 10;

// Keeps the result list short enough that it never grows into another
// full-roster wall on a large team — the exact problem this patch exists
// to fix for the "Browse roster" alternative, just applied to search too.
export const MAX_SEARCH_RESULTS = 8;

export function searchAthletes(
  athletes: SearchableAthlete[],
  query: string,
  excludeIds: readonly string[] = [],
): SearchableAthlete[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];
  const excluded = new Set(excludeIds);
  const matches: SearchableAthlete[] = [];
  for (const athlete of athletes) {
    if (excluded.has(athlete.id)) continue;
    if (!athlete.name.toLowerCase().includes(trimmed)) continue;
    matches.push(athlete);
    if (matches.length >= MAX_SEARCH_RESULTS) break;
  }
  return matches;
}
