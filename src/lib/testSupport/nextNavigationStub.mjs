// Test-only stand-in for "next/navigation"'s redirect(), used solely by
// nextStubLoader.mjs's module resolution hook. Never imported by production
// code. permissions.server.ts imports redirect() at module top level (for
// requireTeamMembership(), not getTeamActor() itself), so it must resolve
// even in tests that never actually trigger a redirect path. The real
// redirect() throws a special Next.js control-flow signal to halt
// rendering — tests exercising route handlers here never hit that path
// (actor is never "public"), so a no-op is sufficient.
export function redirect() {
  throw new Error("redirect() was called in a test — this stub does not implement real redirect control flow.");
}
