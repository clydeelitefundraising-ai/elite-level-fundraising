import test from "node:test";
import assert from "node:assert/strict";
import { resolveAuthenticatedLandingPath, resolvePlatformAdminGateRedirect } from "./platformAdminLanding.ts";

test("resolveAuthenticatedLandingPath: platform admin lands on Schools, never the Team Selector", () => {
  assert.equal(resolveAuthenticatedLandingPath(true), "/platform-admin/schools");
});

test("resolveAuthenticatedLandingPath: a normal account lands on the Team Selector, unchanged", () => {
  assert.equal(resolveAuthenticatedLandingPath(false), "/teams");
});

test("resolvePlatformAdminGateRedirect: no account at all -> /login", () => {
  assert.equal(resolvePlatformAdminGateRedirect({ hasAccount: false, isPlatformAdmin: false }), "/login");
  // Even a stray isPlatformAdmin=true can't matter without an account — the
  // account check always runs first.
  assert.equal(resolvePlatformAdminGateRedirect({ hasAccount: false, isPlatformAdmin: true }), "/login");
});

test("resolvePlatformAdminGateRedirect: authenticated but not a platform admin -> /teams, not a dead end", () => {
  assert.equal(resolvePlatformAdminGateRedirect({ hasAccount: true, isPlatformAdmin: false }), "/teams");
});

test("resolvePlatformAdminGateRedirect: platform admin -> null (render the /platform-admin/* tree)", () => {
  assert.equal(resolvePlatformAdminGateRedirect({ hasAccount: true, isPlatformAdmin: true }), null);
});
