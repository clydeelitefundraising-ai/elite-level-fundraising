// Phase 2D-B.1: focused web-only coverage for the platform-aware logout path
// introduced by this scoped production integration. Deliberately independent
// of every Android-native file (AndroidManifest.xml, google-services.json,
// ic_stat_elf.xml, MainActivity.java, DeepLinkValidator.java).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  resolveNativePlatform,
  getNativePlatform,
  isNativeApp,
  buildLogoutBody,
} from "./nativePushDevice.ts";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

// ── getNativePlatform / resolveNativePlatform ────────────────────────────────

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

test("getNativePlatform: this test runs under plain Node, no Capacitor runtime -> null (web behavior)", () => {
  assert.equal(getNativePlatform(), null);
});

// ── isNativeApp ───────────────────────────────────────────────────────────────

test("isNativeApp: true whenever resolveNativePlatform resolves either platform", () => {
  assert.equal(resolveNativePlatform(true, "ios") !== null, true);
  assert.equal(resolveNativePlatform(true, "android") !== null, true);
});

test("isNativeApp: false under plain Node/browser (no Capacitor runtime)", () => {
  assert.equal(isNativeApp(), false);
});

// ── buildLogoutBody ───────────────────────────────────────────────────────────

test("buildLogoutBody: Android + token -> {platform: 'android', device_token}", () => {
  assert.deepEqual(buildLogoutBody("android", "android-tok-1"), {
    platform: "android",
    device_token: "android-tok-1",
  });
});

test("buildLogoutBody: iOS + token -> {platform: 'ios', device_token} (existing behavior preserved)", () => {
  assert.deepEqual(buildLogoutBody("ios", "ios-tok-1"), { platform: "ios", device_token: "ios-tok-1" });
});

test("buildLogoutBody: no native platform (web) -> empty body, never pretends to be native", () => {
  assert.deepEqual(buildLogoutBody(null, "some-token"), {});
});

test("buildLogoutBody: native platform known but no saved token -> empty body (safe no-op)", () => {
  assert.deepEqual(buildLogoutBody("android", null), {});
  assert.deepEqual(buildLogoutBody("ios", null), {});
});

test("buildLogoutBody: neither platform nor token -> empty body", () => {
  assert.deepEqual(buildLogoutBody(null, null), {});
});

// ── Every real "Sign Out" form-based logout surface in the app ───────────────
//
// Each of these renders its own <form method="POST" action="/api/auth/logout">
// with an onSubmit intercept for installed native apps. All four were found
// (by grepping every isNativeIosApp()/performNativeAwareLogout()/
// /api/auth/logout usage in src/) to share the exact same iOS-only gate bug —
// Android fell through to a plain, unauthenticated form POST that never
// deactivated the device's push token. Covered together so no future logout
// surface can regress silently.
const FORM_LOGOUT_SURFACES = [
  "src/app/team/[slug]/_components/AccountMenu.tsx",
  "src/app/teams/TeamsView.tsx",
  "src/app/platform-admin/_components/PlatformAdminHeader.tsx",
  "src/app/team/[slug]/_components/TeamSwitcher.tsx",
];

for (const file of FORM_LOGOUT_SURFACES) {
  test(`${file}: imports isNativeApp, not the iOS-only isNativeIosApp`, () => {
    const source = read(file);
    assert.ok(source.includes("isNativeApp"), "must import isNativeApp");
    assert.ok(!source.includes("isNativeIosApp"), "iOS-only gate must not remain");
  });

  test(`${file}: Sign Out form gates the native intercept on isNativeApp() (Android intercepts too)`, () => {
    const source = read(file);
    assert.ok(source.includes("if (!isNativeApp()) return;"), "must gate on isNativeApp(), not isNativeIosApp()");
    assert.ok(source.includes("performNativeAwareLogout(router)"), "must still route through the native-aware logout helper");
  });

  test(`${file}: plain browser/PWA form POST target and method are unchanged`, () => {
    const source = read(file);
    assert.ok(source.includes('method="POST"'));
    assert.ok(source.includes('action="/api/auth/logout"'));
  });
}

// ── SettingsView.tsx: a genuine logout surface with no gate at all ───────────
//
// Unlike the form-based surfaces above, this one already called
// performNativeAwareLogout() unconditionally (no isNativeIosApp()/isNativeApp()
// gate whatsoever) -- correct as-is, since the helper itself resolves the
// platform internally via getNativePlatform() and is a safe no-op body on the
// web. No code change was needed here; this test only guards against a future
// edit accidentally adding a narrowing gate.
test("SettingsView.tsx: Sign Out calls performNativeAwareLogout unconditionally (already platform-safe)", () => {
  const source = read("src/app/team/[slug]/settings/SettingsView.tsx");
  assert.ok(
    /const handleSignOut = \(\) => performNativeAwareLogout\(router\);/.test(source),
    "must call performNativeAwareLogout directly, with no isNativeIosApp/isNativeApp gate narrowing it to one platform",
  );
  assert.ok(!source.includes("isNativeIosApp"), "must not gain an iOS-only gate");
});

// ── NativePushRegistrar.tsx wiring (registration context) ────────────────────

const REGISTRAR = "src/app/team/[slug]/_components/NativePushRegistrar.tsx";

test("NativePushRegistrar.tsx: registers on any native platform via getNativePlatform(), never hardcodes iOS", () => {
  const source = read(REGISTRAR);
  assert.ok(source.includes("const platform = getNativePlatform();"));
  assert.ok(source.includes("if (!platform) return;"));
  assert.ok(!source.includes("isNativeIosApp"));
});

test("NativePushRegistrar.tsx: registration only proceeds when the caller reports an authenticated session", () => {
  const source = read(REGISTRAR);
  assert.ok(source.includes("isAuthenticated"), "must accept an authentication gate");
  assert.ok(source.includes("if (!isAuthenticated) return;"), "must bail before touching platform/permission when unauthenticated");
});

test("NativePushRegistrar.tsx: is mounted exactly once, inside the authenticated team layout", () => {
  const layout = read("src/app/team/[slug]/layout.tsx");
  assert.equal(layout.split("<NativePushRegistrar").length - 1, 1);
});
