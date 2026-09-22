// Phase 2E: pure-function coverage for the Notification Preferences UI
// helpers (no DOM/React harness needed — see nativePushRegistration.test.ts
// for the same pattern).
import test from "node:test";
import assert from "node:assert/strict";
import { parsePreferencesResponse, toggledPreferences, PUSH_CATEGORIES } from "./notificationPreferences.ts";

test("PUSH_CATEGORIES: exactly the four existing backend categories, in a stable order", () => {
  assert.deepEqual(PUSH_CATEGORIES, ["team_updates", "messages", "calendar", "requests"]);
});

// ── parsePreferencesResponse ──────────────────────────────────────────────────

test("parsePreferencesResponse: all-true response parses to all-true", () => {
  assert.deepEqual(
    parsePreferencesResponse({ team_updates: true, messages: true, calendar: true, requests: true }),
    { team_updates: true, messages: true, calendar: true, requests: true },
  );
});

test("parsePreferencesResponse: explicit false is preserved per category", () => {
  assert.deepEqual(
    parsePreferencesResponse({ team_updates: true, messages: false, calendar: true, requests: true }),
    { team_updates: true, messages: false, calendar: true, requests: true },
  );
});

test("parsePreferencesResponse: missing/malformed fields default to true (server's own default-ON rule)", () => {
  assert.deepEqual(
    parsePreferencesResponse({}),
    { team_updates: true, messages: true, calendar: true, requests: true },
  );
  assert.deepEqual(
    parsePreferencesResponse({ messages: false }),
    { team_updates: true, messages: false, calendar: true, requests: true },
  );
});

test("parsePreferencesResponse: only the literal boolean false counts as off -- truthy/falsy non-boolean never does", () => {
  for (const value of [0, "", null, undefined, "false", NaN]) {
    assert.equal(parsePreferencesResponse({ messages: value }).messages, true, `value ${String(value)} must not be treated as off`);
  }
});

test("parsePreferencesResponse: non-object input never throws, defaults to all-true", () => {
  for (const input of [null, undefined, "oops", 42, []]) {
    assert.deepEqual(parsePreferencesResponse(input), { team_updates: true, messages: true, calendar: true, requests: true });
  }
});

// ── toggledPreferences ────────────────────────────────────────────────────────

test("toggledPreferences: flips exactly the targeted category, leaves the other three untouched", () => {
  const current = { team_updates: true, messages: true, calendar: true, requests: true };
  const next = toggledPreferences(current, "messages");
  assert.deepEqual(next, { team_updates: true, messages: false, calendar: true, requests: true });
});

test("toggledPreferences: toggling back and forth returns to the original value", () => {
  const current = { team_updates: true, messages: false, calendar: true, requests: false };
  const once = toggledPreferences(current, "calendar");
  const twice = toggledPreferences(once, "calendar");
  assert.deepEqual(twice, current);
});

test("toggledPreferences: each of the four categories can be changed independently", () => {
  const current = { team_updates: true, messages: true, calendar: true, requests: true };
  for (const key of PUSH_CATEGORIES) {
    const next = toggledPreferences(current, key);
    for (const other of PUSH_CATEGORIES) {
      if (other === key) assert.equal(next[other], false, `${key} should flip to false`);
      else assert.equal(next[other], current[other], `${other} must stay unchanged while toggling ${key}`);
    }
  }
});

test("toggledPreferences: result always carries all four keys, ready to send as a full PATCH body", () => {
  const current = { team_updates: false, messages: true, calendar: false, requests: true };
  const next = toggledPreferences(current, "requests");
  assert.deepEqual(Object.keys(next).sort(), [...PUSH_CATEGORIES].sort());
});
