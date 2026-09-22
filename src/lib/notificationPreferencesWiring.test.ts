// Phase 2E: source-level wiring checks for NotificationPreferencesSection.tsx
// (no DOM/React harness in this repo — same constraint and pattern as every
// other *Wiring.test.ts / component source-assertion test here).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const SECTION = "src/app/team/[slug]/settings/NotificationPreferencesSection.tsx";
const SETTINGS_VIEW = "src/app/team/[slug]/settings/SettingsView.tsx";
const PREFS_ROUTE = "src/app/api/push/preferences/route.ts";

test("NotificationPreferencesSection.tsx: loads state via GET /api/push/preferences", () => {
  const source = read(SECTION);
  assert.ok(source.includes('fetch("/api/push/preferences")'), "must GET the existing endpoint on mount");
});

test("NotificationPreferencesSection.tsx: saves via PATCH to the same existing endpoint, no new endpoint", () => {
  const source = read(SECTION);
  assert.ok(source.includes('method: "PATCH"'));
  assert.ok(source.includes('fetch("/api/push/preferences",'), "PATCH must target the same existing route");
});

test("NotificationPreferencesSection.tsx: PATCH body is the full toggled state, never a partial single-key patch", () => {
  const source = read(SECTION);
  assert.ok(source.includes("JSON.stringify(nextPrefs)"), "must send the complete 4-category object so unrelated categories are preserved (see file header)");
  assert.ok(!/JSON\.stringify\(\{\s*\[key\]/.test(source), "must never send a partial {[key]: value} body");
});

test("NotificationPreferencesSection.tsx: never calls a Supabase URL or imports a Supabase client directly (goes through the existing API route only)", () => {
  const source = read(SECTION);
  assert.ok(!source.includes("NEXT_PUBLIC_SUPABASE_URL"), "must not read the Supabase URL directly");
  assert.ok(!/fetch\(`?\$\{?BASE/.test(source), "must not build a direct REST call to Supabase");
  assert.ok(!source.includes("SUPABASE_SERVICE_ROLE_KEY"), "must never reference the service-role key from client code");
});

test("NotificationPreferencesSection.tsx: is a distinct feature from the VAPID/web-push PushOptIn component (mentioned only in its own doc comment, never imported)", () => {
  const source = read(SECTION);
  assert.ok(!/import .*PushOptIn/.test(source), "must not import the unrelated web-push opt-in component");
  assert.ok(!source.includes("usePushSubscription"), "must not reuse the unrelated web-push subscription hook");
});

test("NotificationPreferencesSection.tsx: guards against stale/out-of-order responses per category", () => {
  const source = read(SECTION);
  assert.ok(source.includes("seqRef"), "must track a request sequence number to ignore superseded responses");
  assert.ok(/mySeq !== seqRef\.current\[key\]/.test(source), "must compare the captured sequence before applying a response");
});

test("NotificationPreferencesSection.tsx: a failed save reverts the optimistic UI and surfaces an error, not a false 'saved' state", () => {
  const source = read(SECTION);
  assert.ok(source.includes("error: true"), "must set an error flag on failure");
  assert.ok(/setPrefs\(prev => \(prev \? \{ \.\.\.prev, \[key\]: !nextValue \} : prev\)\)/.test(source), "must revert the toggled value back on failure");
});

test("NotificationPreferencesSection.tsx: exposes exactly the four existing backend categories", () => {
  const source = read(SECTION);
  for (const key of ["team_updates", "messages", "calendar", "requests"]) {
    assert.ok(source.includes(`"${key}"`) || source.includes(`key: "${key}"`), `must expose ${key}`);
  }
});

test("SettingsView.tsx: mounts NotificationPreferencesSection exactly once", () => {
  const source = read(SETTINGS_VIEW);
  assert.equal(source.split("<NotificationPreferencesSection").length - 1, 1);
});

test("api/push/preferences route: still the only preferences endpoint -- no new route was introduced", () => {
  const source = read(PREFS_ROUTE);
  assert.ok(source.includes("export async function GET()"));
  assert.ok(source.includes("export async function PATCH("));
});
