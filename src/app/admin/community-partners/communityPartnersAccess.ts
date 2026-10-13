// Phase 2.2A relocation — the authorization DECISION for
// /admin/community-partners/page.tsx, extracted into a pure function so
// it's directly unit-testable (this repo has no JSX/component-rendering
// harness — plain `node --test` cannot parse a .tsx file's JSX syntax at
// all, only erase plain TypeScript type annotations, so the page itself
// can never be imported/called directly in a test; see
// platformAdminLanding.ts's resolvePlatformAdminGateRedirect for the
// identical "extract the decision, leave the JSX untested" pattern used
// everywhere else in this codebase).
//
// This function only decides WHICH state the page should show — it does
// not, by itself, enforce anything. The actual security boundary is (and
// must remain) every /api/platform-admin/community-partners/* route's own
// independent getPlatformAdminSession() check — even if this function or
// the page's JSX had a bug, no partner data or mutation would become
// reachable, since the APIs never trust anything the page decided.
export type CommunityPartnersAdminPageState = "sign-in-required" | "management";

export function resolveCommunityPartnersAdminPageState(
  admin: unknown,
): CommunityPartnersAdminPageState {
  return admin != null ? "management" : "sign-in-required";
}
