// Complete Season Phase 5A — the typed confirmation, shared by the browser
// (to enable the button) and the server (checked again before anything
// runs). Pure and dependency-free so client components can import it.

/** The database's normalization of a typed phrase: trimmed, inner spaces
 *  collapsed, upper case (team_season_complete compares the same way). */
export function normalizeConfirmation(s: string): string {
  return s.trim().replace(/\s+/g, " ").toUpperCase();
}

/** Both typed confirmations match: the team's address and the season's
 *  phrase (e.g. "COMPLETE 2027 SEASON"). */
export function confirmationMatches(
  typed: { teamSlug: string; phrase: string },
  expected: { teamSlug: string; phrase: string },
): boolean {
  return typed.teamSlug.trim().toLowerCase() === expected.teamSlug.toLowerCase()
    && normalizeConfirmation(typed.phrase) === normalizeConfirmation(expected.phrase)
    && expected.phrase.trim() !== "";
}
