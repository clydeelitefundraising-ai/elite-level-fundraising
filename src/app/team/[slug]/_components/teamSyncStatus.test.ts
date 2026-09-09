import test from "node:test";
import assert from "node:assert/strict";
import { decidePollAction, signatureOf, type SyncStatus } from "./teamSyncStatus.ts";

const BASE: SyncStatus = {
  announcements: { count: 3, latestAt: "2026-09-01T00:00:00Z" },
  calendar:      { count: 5, signature: "abc123" },
  notifications: { count: 2, latestAt: "2026-09-02T00:00:00Z" },
};

test("decidePollAction: no prior baseline establishes one, never refreshes", () => {
  const result = decidePollAction(null, BASE);
  assert.deepEqual(result, { action: "establish-baseline", signature: signatureOf(BASE) });
});

test("decidePollAction: identical signature to the baseline is a no-op (no refresh)", () => {
  const baseline = signatureOf(BASE);
  const result = decidePollAction(baseline, BASE);
  assert.deepEqual(result, { action: "no-op" });
});

test("decidePollAction: changed announcement count triggers refresh", () => {
  const baseline = signatureOf(BASE);
  const next: SyncStatus = { ...BASE, announcements: { count: 4, latestAt: BASE.announcements.latestAt } };
  const result = decidePollAction(baseline, next);
  assert.equal(result.action, "refresh");
});

test("decidePollAction: changed announcement latestAt triggers refresh", () => {
  const baseline = signatureOf(BASE);
  const next: SyncStatus = { ...BASE, announcements: { count: BASE.announcements.count, latestAt: "2026-09-05T00:00:00Z" } };
  const result = decidePollAction(baseline, next);
  assert.equal(result.action, "refresh");
});

test("decidePollAction: changed calendar signature (an EDIT, same count) triggers refresh", () => {
  const baseline = signatureOf(BASE);
  // Same row count as BASE — models an in-place edit to an existing event,
  // not a create/delete — the calendar signature alone must still differ.
  const next: SyncStatus = { ...BASE, calendar: { count: BASE.calendar.count, signature: "def456" } };
  const result = decidePollAction(baseline, next);
  assert.equal(result.action, "refresh");
});

test("decidePollAction: changed calendar count (create/delete) triggers refresh", () => {
  const baseline = signatureOf(BASE);
  const next: SyncStatus = { ...BASE, calendar: { count: BASE.calendar.count + 1, signature: "ghi789" } };
  const result = decidePollAction(baseline, next);
  assert.equal(result.action, "refresh");
});

test("decidePollAction: changed notification count triggers refresh", () => {
  const baseline = signatureOf(BASE);
  const next: SyncStatus = { ...BASE, notifications: { count: BASE.notifications.count + 1, latestAt: BASE.notifications.latestAt } };
  const result = decidePollAction(baseline, next);
  assert.equal(result.action, "refresh");
});

test("decidePollAction: a fresh baseline after establish matches the same status (idempotent re-poll)", () => {
  const first = decidePollAction(null, BASE);
  assert.equal(first.action, "establish-baseline");
  const second = decidePollAction(first.signature, BASE);
  assert.deepEqual(second, { action: "no-op" });
});

test("signatureOf: never includes anything beyond the typed minimal shape (no accidental content leakage)", () => {
  const sig = signatureOf(BASE);
  const parsed = JSON.parse(sig);
  assert.deepEqual(Object.keys(parsed).sort(), ["announcements", "calendar", "notifications"]);
  assert.deepEqual(Object.keys(parsed.announcements).sort(), ["count", "latestAt"]);
  assert.deepEqual(Object.keys(parsed.calendar).sort(), ["count", "signature"]);
  assert.deepEqual(Object.keys(parsed.notifications).sort(), ["count", "latestAt"]);
});
