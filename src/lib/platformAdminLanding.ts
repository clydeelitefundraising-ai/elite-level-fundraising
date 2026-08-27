// Pure redirect-decision logic for the platform-admin landing/gate flow —
// deliberately has zero imports (not even `@/lib/*`) so it can be unit
// tested directly via Node's native test runner without any module-alias
// or mocking setup. Callers (login/page.tsx, teams/page.tsx,
// platform-admin/layout.tsx) resolve the actual session/platform-admin
// booleans via getAccountSession()/getPlatformAdminSession() and pass them
// in here — this file does no I/O of its own.

/** Where an authenticated account should land after login (or when
 *  visiting a page like /login or /teams that redirects an already-
 *  authenticated visitor onward). Platform-admin status always takes
 *  precedence over the normal Team Selector — even for an account that
 *  ALSO happens to be a coach/parent/booster/athlete on some team, per
 *  the explicit precedence rule: platform admin landing wins. */
export function resolveAuthenticatedLandingPath(isPlatformAdmin: boolean): string {
  return isPlatformAdmin ? "/platform-admin/schools" : "/teams";
}

/** The /platform-admin/* server-side gate's redirect decision — the
 *  layout calls this with the two already-resolved booleans and redirects
 *  if it gets a non-null path back.
 *
 *  - No account at all                   -> "/login"
 *  - Account, but not a platform admin    -> "/teams" (same landing as
 *    any other authenticated non-platform-admin visitor — not a special
 *    "access denied" page, just routed to where they actually belong)
 *  - Platform admin                       -> null (render the tree) */
export function resolvePlatformAdminGateRedirect(params: {
  hasAccount:      boolean;
  isPlatformAdmin: boolean;
}): string | null {
  if (!params.hasAccount) return "/login";
  if (!params.isPlatformAdmin) return "/teams";
  return null;
}
