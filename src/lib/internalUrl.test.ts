import test from "node:test";
import assert from "node:assert/strict";
import { isSafeInternalPath } from "./internalUrl.ts";

test("isSafeInternalPath: accepts an ordinary relative app route", () => {
  assert.equal(isSafeInternalPath("/team/monroe-valley/messages/thread-1"), true);
});

test("isSafeInternalPath: accepts a route with a query string", () => {
  assert.equal(isSafeInternalPath("/team/monroe-valley/team?tab=roster&section=staff"), true);
});

test("isSafeInternalPath: rejects a full external URL", () => {
  assert.equal(isSafeInternalPath("https://evil.example.com/phish"), false);
});

test("isSafeInternalPath: rejects a protocol-relative URL", () => {
  assert.equal(isSafeInternalPath("//evil.example.com/phish"), false);
});

test("isSafeInternalPath: rejects a javascript: scheme smuggled after a leading slash", () => {
  assert.equal(isSafeInternalPath("/javascript:alert(1)"), false);
});

test("isSafeInternalPath: rejects a path not starting with /", () => {
  assert.equal(isSafeInternalPath("team/monroe-valley"), false);
});

test("isSafeInternalPath: rejects a backslash-containing path", () => {
  assert.equal(isSafeInternalPath("/team\\evil"), false);
});

test("isSafeInternalPath: rejects non-string/empty input", () => {
  assert.equal(isSafeInternalPath(null), false);
  assert.equal(isSafeInternalPath(undefined), false);
  assert.equal(isSafeInternalPath(""), false);
  assert.equal(isSafeInternalPath(42), false);
});
