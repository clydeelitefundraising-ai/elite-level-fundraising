import test from "node:test";
import assert from "node:assert/strict";
import { resolveTeamTheme } from "./teamTheme.ts";

test("resolveTeamTheme: brandingCustomized=false ignores a well-formed stored color and returns ELF default", () => {
  const theme = resolveTeamTheme("#1A2F4E", "#F4E04D", false);
  assert.equal(theme["--team-primary"], "#FF5A1F");
  assert.equal(theme["--team-secondary"], "#FFC93C");
  assert.equal(theme["--team-primary-foreground"], "#ffffff");
});

test("resolveTeamTheme: brandingCustomized=false ignores known historical placeholder values too", () => {
  // The exact two values live QA found stored on real rows despite no
  // coach ever intentionally customizing branding.
  assert.equal(resolveTeamTheme("#1B4FA8", "#1B4FA8", false)["--team-primary"], "#FF5A1F");
  assert.equal(resolveTeamTheme("#0b1e3d", "#0b1e3d", false)["--team-primary"], "#FF5A1F");
});

test("resolveTeamTheme: brandingCustomized=true uses the stored dark color with a light foreground", () => {
  const theme = resolveTeamTheme("#1A2F4E", "#F4E04D", true);
  assert.equal(theme["--team-primary"], "#1A2F4E");
  assert.equal(theme["--team-secondary"], "#F4E04D");
  assert.equal(theme["--team-primary-foreground"], "#ffffff");
});

test("resolveTeamTheme: brandingCustomized=true uses the stored light color with a dark foreground", () => {
  const theme = resolveTeamTheme("#F4E04D", "#1A2F4E", true);
  assert.equal(theme["--team-primary"], "#F4E04D");
  assert.equal(theme["--team-primary-foreground"], "#111318");
});

test("resolveTeamTheme: brandingCustomized=true but no stored color falls back to ELF default", () => {
  const theme = resolveTeamTheme(null, undefined, true);
  assert.equal(theme["--team-primary"], "#FF5A1F");
  assert.equal(theme["--team-secondary"], "#FFC93C");
});
