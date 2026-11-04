// Test-only stand-in for "next/navigation"'s redirect(), used solely by
// nextStubLoader.mjs's module resolution hook. Never imported by production
// code. permissions.server.ts imports redirect() at module top level (for
// requireTeamMembership(), not getTeamActor() itself), so it must resolve
// even in tests that never actually trigger a redirect path. The real
// redirect() throws a special Next.js control-flow signal to halt
// rendering — tests exercising route handlers here never hit that path
// (actor is never "public"), so a no-op is sufficient.
// The thrown error carries the destination (`redirectTo`) so tests can
// assert where a gate sends a visitor.
export function redirect(url) {
  const err = new Error(`redirect() was called in a test (to ${url}) — this stub does not implement real redirect control flow.`);
  err.redirectTo = url;
  throw err;
}
