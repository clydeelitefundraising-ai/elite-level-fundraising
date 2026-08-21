import test from "node:test";
import assert from "node:assert/strict";
import { buildApnsAlert, buildApnsPayload, classifyApnsFailure } from "./apns.ts";

// ── buildApnsAlert — privacy-safe payload content ───────────────────────────

test("buildApnsAlert: announcement — matches the approved privacy-safe example", () => {
  const alert = buildApnsAlert("announcement", { actorName: "Coach Smith" });
  assert.equal(alert.body, "New team update from Coach Smith");
});

test("buildApnsAlert: message — matches the approved privacy-safe example", () => {
  const alert = buildApnsAlert("message", { actorName: "Coach Smith" });
  assert.equal(alert.body, "Coach Smith sent you a message");
});

test("buildApnsAlert: calendar_event — matches the approved privacy-safe example", () => {
  const alert = buildApnsAlert("calendar_event", {});
  assert.equal(alert.body, "Practice schedule updated");
});

test("buildApnsAlert: request — matches the approved privacy-safe example", () => {
  const alert = buildApnsAlert("request", {});
  assert.equal(alert.body, "A new team request needs review");
});

test("buildApnsAlert: never includes anything beyond the safe title/body/actor name", () => {
  const alert = buildApnsAlert("message", { actorName: "Coach Smith" });
  assert.deepEqual(Object.keys(alert).sort(), ["body", "title"]);
});

// ── buildApnsPayload — no badge field in V1 ─────────────────────────────────

test("buildApnsPayload: omits badge entirely (explicit V1 decision)", () => {
  const payload = buildApnsPayload({ title: "t", body: "b" }, "/team/slug/notifications");
  assert.equal("badge" in payload.aps, false);
});

test("buildApnsPayload: includes the deep-link url for the native tap handler", () => {
  const payload = buildApnsPayload({ title: "t", body: "b" }, "/team/slug/messages/thread-1");
  assert.equal(payload.url, "/team/slug/messages/thread-1");
});

// ── classifyApnsFailure — mirrors dispatchPush()'s existing stale-token rule ─

test("classifyApnsFailure: 410 Unregistered deactivates", () => {
  assert.equal(classifyApnsFailure(410, "Unregistered"), "deactivate");
});

test("classifyApnsFailure: 400 BadDeviceToken deactivates", () => {
  assert.equal(classifyApnsFailure(400, "BadDeviceToken"), "deactivate");
});

test("classifyApnsFailure: other 400 reasons are ignored, not deactivated", () => {
  assert.equal(classifyApnsFailure(400, "BadTopic"), "ignore");
});

test("classifyApnsFailure: transient 5xx errors are ignored, token stays active", () => {
  assert.equal(classifyApnsFailure(503, "ServiceUnavailable"), "ignore");
});

test("classifyApnsFailure: an unreachable/network-failure status (0) is ignored", () => {
  assert.equal(classifyApnsFailure(0, null), "ignore");
});
