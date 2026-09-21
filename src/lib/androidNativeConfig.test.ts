// Phase 1C.1: static guards over the Android native project files. Nothing
// here can execute Java/Gradle from node:test, so these pin the structural
// properties that matter: ONE AndroidX back implementation (required on
// Android 16 / targetSdk 36, where the legacy onBackPressed() path is no
// longer dispatched), and a release build that can never fall back to the
// debug signing key.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const MAIN_ACTIVITY = "android/app/src/main/java/com/elitelevelfundraising/team/MainActivity.java";
const MANIFEST = "android/app/src/main/AndroidManifest.xml";
const APP_GRADLE = "android/app/build.gradle";

test("MainActivity registers back handling through the AndroidX OnBackPressedDispatcher", () => {
  const source = read(MAIN_ACTIVITY);
  assert.ok(source.includes("import androidx.activity.OnBackPressedCallback;"));
  assert.ok(source.includes("new OnBackPressedCallback(true)"));
  assert.ok(source.includes("getOnBackPressedDispatcher().addCallback(this,"));
});

test("MainActivity has NO legacy onBackPressed() override (single Back implementation)", () => {
  const source = read(MAIN_ACTIVITY);
  assert.ok(
    !/void\s+onBackPressed\s*\(/.test(source),
    "a legacy override would be a second, competing Back path (and is not dispatched on Android 16)",
  );
});

test("MainActivity preserves the validated overlay -> history -> background decision tree", () => {
  const source = read(MAIN_ACTIVITY);
  assert.ok(source.includes("window.__elfHasOpenOverlay && window.__elfHasOpenOverlay()"));
  assert.ok(source.includes("window.dispatchEvent(new Event('elfAndroidBackButton'))"));
  assert.ok(source.includes("webView.canGoBack()"));
  assert.ok(source.includes("webView.goBack()"));
  assert.ok(source.includes("moveTaskToBack(false)"));
  // overlay branch must come first, then history, then background
  const overlay = source.indexOf("elfAndroidBackButton");
  const history = source.indexOf("webView.canGoBack()");
  const background = source.lastIndexOf("moveTaskToBack(false)");
  assert.ok(overlay < history && history < background, "branch order must be overlay, history, background");
});

test("MainActivity never re-dispatches to the dispatcher from inside its own callback (no re-entry loop)", () => {
  const source = read(MAIN_ACTIVITY);
  assert.ok(!source.includes("setEnabled(false)"));
  assert.ok(!/getOnBackPressedDispatcher\(\)\.onBackPressed\(/.test(source));
});

test("AndroidManifest opts the app into the on-back-invoked-callback (predictive back) path", () => {
  const source = read(MANIFEST);
  const application = source.match(/<application[^>]*>/)?.[0] ?? "";
  assert.ok(application.includes('android:enableOnBackInvokedCallback="true"'));
});

test("build.gradle release build type no longer falls back to the debug signing key", () => {
  const source = read(APP_GRADLE);
  assert.ok(!/hasReleaseSigning\s*\?/.test(source), "the ternary debug fallback must be gone");
  assert.ok(!/signingConfig\s+[^\n]*signingConfigs\.debug/.test(source));
  assert.ok(/if \(hasReleaseSigning\) \{\s*signingConfig signingConfigs\.release\s*\}/.test(source));
});

test("build.gradle refuses release packaging without credentials, with an actionable message", () => {
  const source = read(APP_GRADLE);
  assert.ok(source.includes("gradle.taskGraph.whenReady"));
  assert.ok(source.includes("throw new GradleException("));
  assert.ok(source.includes("(assemble|bundle|package)"));
  assert.ok(source.includes("android/keystore.properties"));
  assert.ok(source.includes("keystore.properties.example"));
});

test("build.gradle requires every signing field, not just the file's existence", () => {
  const source = read(APP_GRADLE);
  for (const key of ["storeFile", "storePassword", "keyAlias", "keyPassword"]) {
    assert.ok(source.includes(`'${key}'`), `${key} must be validated`);
  }
});

test("build.gradle leaves the debug signing/build configuration untouched", () => {
  const source = read(APP_GRADLE);
  assert.ok(!/\bdebug\s*\{/.test(source), "no custom debug signingConfig/buildType block may be introduced");
});
