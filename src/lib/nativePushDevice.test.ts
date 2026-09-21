// Phase 1C.1: platform-aware native logout. Pure helpers are exercised
// directly; the component gates are checked as static source (this repo has
// no jsdom/React Testing Library harness -- same constraint as
// androidBackWiring.test.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  resolveNativePlatform,
  buildLogoutBody,
  getNativePlatform,
  isNativeApp,
  isNativeIosApp,
} from "./nativePushDevice.ts";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

test("resolveNativePlatform: installed iOS app -> ios", () => {
  assert.equal(resolveNativePlatform(true, "ios"), "ios");
});

test("resolveNativePlatform: installed Android app -> android", () => {
  assert.equal(resolveNativePlatform(true, "android"), "android");
});

test("resolveNativePlatform: browser/PWA (not native) -> null, regardless of platform string", () => {
  assert.equal(resolveNativePlatform(false, "web"), null);
  assert.equal(resolveNativePlatform(false, "ios"), null);
  assert.equal(resolveNativePlatform(false, "android"), null);
});

test("resolveNativePlatform: unknown native hosts -> null (never invents a platform)", () => {
  assert.equal(resolveNativePlatform(true, "web"), null);
  assert.equal(resolveNativePlatform(true, "electron"), null);
});

test("buildLogoutBody: iOS sends exactly {platform:'ios', device_token} (unchanged wire shape)", () => {
  assert.deepEqual(buildLogoutBody("ios", "tok-1"), { platform: "ios", device_token: "tok-1" });
});

test("buildLogoutBody: Android sends its OWN platform, not 'ios'", () => {
  assert.deepEqual(buildLogoutBody("android", "tok-2"), { platform: "android", device_token: "tok-2" });
});

test("buildLogoutBody: no saved token or no native platform -> empty body (server no-op for push)", () => {
  assert.deepEqual(buildLogoutBody("ios", null), {});
  assert.deepEqual(buildLogoutBody("android", null), {});
  assert.deepEqual(buildLogoutBody(null, "stale-token"), {});
  assert.deepEqual(buildLogoutBody(null, null), {});
});

test("web/Node runtime: no native platform detected (web logout unaffected)", () => {
  assert.equal(getNativePlatform(), null);
  assert.equal(isNativeApp(), false);
  assert.equal(isNativeIosApp(), false);
});

test("performNativeAwareLogout builds its body via the platform helpers, with no hardcoded 'ios'", () => {
  const source = read("src/lib/nativePushDevice.ts");
  assert.ok(
    source.includes("buildLogoutBody(getNativePlatform(), token)"),
    "logout must derive the platform from the running app",
  );
  assert.ok(
    !/platform:\s*"ios"/.test(source),
    "no literal platform: \"ios\" may remain in nativePushDevice.ts",
  );
});

// The logout forms intercept only inside an installed app; widening them from
// iOS-only to any native app is what lets Android deactivate its own token.
const LOGOUT_GATE_FILES = [
  "src/app/team/[slug]/_components/AccountMenu.tsx",
  "src/app/teams/TeamsView.tsx",
  "src/app/platform-admin/_components/PlatformAdminHeader.tsx",
];

for (const file of LOGOUT_GATE_FILES) {
  test(`${file} gates its native logout on isNativeApp() (iOS + Android), not iOS only`, () => {
    const source = read(file);
    assert.ok(source.includes("isNativeApp"), "must import/use isNativeApp");
    assert.ok(source.includes("if (!isNativeApp()) return;"));
    assert.ok(!source.includes("isNativeIosApp"), "iOS-only gate must be gone from the logout form");
    assert.ok(source.includes("performNativeAwareLogout(router)"));
  });
}

test("NativePushRegistrar.tsx stays iOS-only (Android push registration is FCM work, not this phase)", () => {
  const source = read("src/app/team/[slug]/_components/NativePushRegistrar.tsx");
  assert.ok(source.includes("if (!isNativeIosApp()) return;"));
  assert.ok(!source.includes("isNativeApp"));
});
