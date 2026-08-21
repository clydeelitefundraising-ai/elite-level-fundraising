import test from "node:test";
import assert from "node:assert/strict";
import { isCategoryEnabled } from "./pushDevices.ts";

test("isCategoryEnabled: true when the category is explicitly on", () => {
  assert.equal(isCategoryEnabled({ team_updates: true, messages: true, calendar: true, requests: true }, "messages"), true);
});

test("isCategoryEnabled: false when the category is explicitly off", () => {
  assert.equal(isCategoryEnabled({ team_updates: true, messages: false, calendar: true, requests: true }, "messages"), false);
});

test("isCategoryEnabled: defaults to true (allowed) when no preferences row exists at all", () => {
  assert.equal(isCategoryEnabled(null, "calendar"), true);
  assert.equal(isCategoryEnabled(undefined, "requests"), true);
});
