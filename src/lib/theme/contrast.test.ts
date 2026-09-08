import test from "node:test";
import assert from "node:assert/strict";
import { getForegroundForBackground } from "./contrast.ts";

test("getForegroundForBackground: pure black background resolves to light foreground", () => {
  assert.equal(getForegroundForBackground("#000000"), "#ffffff");
});

test("getForegroundForBackground: pure white background resolves to dark foreground", () => {
  assert.equal(getForegroundForBackground("#ffffff"), "#111318");
});

test("getForegroundForBackground: dark school navy resolves to light foreground", () => {
  assert.equal(getForegroundForBackground("#1A2F4E"), "#ffffff");
});

test("getForegroundForBackground: light school yellow resolves to dark foreground", () => {
  assert.equal(getForegroundForBackground("#F4E04D"), "#111318");
});

test("getForegroundForBackground: 3-digit hex shorthand is parsed correctly", () => {
  assert.equal(getForegroundForBackground("#fff"), "#111318");
  assert.equal(getForegroundForBackground("#000"), "#ffffff");
});

test("getForegroundForBackground: malformed input falls back to dark-on-white default", () => {
  assert.equal(getForegroundForBackground("not-a-color"), "#111318");
  assert.equal(getForegroundForBackground(""), "#111318");
});
