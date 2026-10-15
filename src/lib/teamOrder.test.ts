import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MAX_SAVED_TEAM_SLUGS,
  applySlugOrder,
  dedupeTeamSlugs,
  earliestJoinedAtBySlug,
  moveItem,
  orderAccountTeams,
  sameOrder,
  sortByJoinedAt,
} from "./teamOrder.ts";

const t = (slug: string) => ({ campaign_slug: slug });
const slugsOf = (teams: { campaign_slug: string }[]) => teams.map(x => x.campaign_slug);

const JOINED = earliestJoinedAtBySlug([
  { campaign_slug: "wolves",  created_at: "2025-01-10T00:00:00Z" },
  { campaign_slug: "hawks",   created_at: "2024-06-01T00:00:00Z" },
  { campaign_slug: "bears",   created_at: "2026-03-01T00:00:00Z" },
]);

// ── Module shape ──────────────────────────────────────────────────────────

test("teamOrder.ts is client-safe: no imports, no env reads", () => {
  const code = readFileSync(new URL("./teamOrder.ts", import.meta.url), "utf8");
  assert.doesNotMatch(code, /^\s*import\s/m);
  assert.doesNotMatch(code, /process\.env/);
});

// ── Default order (no saved preference) ───────────────────────────────────

test("no saved order: oldest membership first", () => {
  assert.deepEqual(slugsOf(orderAccountTeams([t("wolves"), t("bears"), t("hawks")], JOINED, null)), ["hawks", "wolves", "bears"]);
  assert.deepEqual(slugsOf(orderAccountTeams([t("bears"), t("hawks"), t("wolves")], JOINED, [])), ["hawks", "wolves", "bears"]);
});

test("default order does not depend on the incoming (database) row order", () => {
  const a = orderAccountTeams([t("wolves"), t("bears"), t("hawks")], JOINED, null);
  const b = orderAccountTeams([t("hawks"), t("wolves"), t("bears")], JOINED, null);
  assert.deepEqual(slugsOf(a), slugsOf(b));
});

test("identical join times tie-break deterministically by slug", () => {
  const joined = earliestJoinedAtBySlug([
    { campaign_slug: "zeta",  created_at: "2025-01-01T00:00:00Z" },
    { campaign_slug: "alpha", created_at: "2025-01-01T00:00:00Z" },
  ]);
  assert.deepEqual(slugsOf(sortByJoinedAt([t("zeta"), t("alpha")], joined)), ["alpha", "zeta"]);
  assert.deepEqual(slugsOf(sortByJoinedAt([t("alpha"), t("zeta")], joined)), ["alpha", "zeta"]);
});

test("missing or unparseable join times sort last, then by slug", () => {
  const joined = earliestJoinedAtBySlug([
    { campaign_slug: "b", created_at: null },
    { campaign_slug: "a", created_at: "not a date" },
    { campaign_slug: "c", created_at: "2025-01-01T00:00:00Z" },
  ]);
  assert.deepEqual(slugsOf(sortByJoinedAt([t("b"), t("a"), t("c"), t("d")], joined)), ["c", "a", "b", "d"]);
});

test("coach + member rows on the same team: the earlier one is the join date", () => {
  const joined = earliestJoinedAtBySlug([
    { campaign_slug: "wolves", created_at: "2026-05-01T00:00:00Z" }, // member row
    { campaign_slug: "hawks",  created_at: "2025-01-01T00:00:00Z" },
    { campaign_slug: "wolves", created_at: "2024-01-01T00:00:00Z" }, // coach row, earlier
  ]);
  assert.deepEqual(slugsOf(sortByJoinedAt([t("hawks"), t("wolves")], joined)), ["wolves", "hawks"]);
});

// ── Saved order ───────────────────────────────────────────────────────────

test("full saved order is applied exactly", () => {
  assert.deepEqual(slugsOf(orderAccountTeams([t("hawks"), t("wolves"), t("bears")], JOINED, ["bears", "hawks", "wolves"])), ["bears", "hawks", "wolves"]);
});

test("newly joined teams (not in the saved list) appear at the bottom, oldest first", () => {
  const joined = earliestJoinedAtBySlug([
    { campaign_slug: "wolves", created_at: "2025-01-01T00:00:00Z" },
    { campaign_slug: "hawks",  created_at: "2024-01-01T00:00:00Z" },
    { campaign_slug: "new2",   created_at: "2026-09-02T00:00:00Z" },
    { campaign_slug: "new1",   created_at: "2026-09-01T00:00:00Z" },
  ]);
  const ordered = orderAccountTeams([t("new2"), t("hawks"), t("new1"), t("wolves")], joined, ["wolves", "hawks"]);
  assert.deepEqual(slugsOf(ordered), ["wolves", "hawks", "new1", "new2"]);
});

test("stale saved slugs (left/removed teams) are ignored, never shown", () => {
  const ordered = orderAccountTeams([t("hawks"), t("wolves")], JOINED, ["gone", "wolves", "also-gone", "hawks"]);
  assert.deepEqual(slugsOf(ordered), ["wolves", "hawks"]);
});

test("a rejoined team whose slug is still saved returns to its saved position", () => {
  const ordered = orderAccountTeams([t("hawks"), t("wolves"), t("bears")], JOINED, ["bears", "wolves", "hawks"]);
  assert.deepEqual(slugsOf(ordered), ["bears", "wolves", "hawks"]);
});

test("duplicate saved slugs never duplicate a team", () => {
  const ordered = orderAccountTeams([t("hawks"), t("wolves")], JOINED, ["wolves", "wolves", "hawks", "wolves"]);
  assert.deepEqual(slugsOf(ordered), ["wolves", "hawks"]);
});

test("ordering never adds or drops teams and keeps each team object intact", () => {
  const teams = [
    { campaign_slug: "hawks",  role: "parent" },
    { campaign_slug: "wolves", role: "head_coach" },
  ];
  const ordered = orderAccountTeams(teams, JOINED, ["wolves", "ghost"]);
  assert.equal(ordered.length, 2);
  assert.equal(ordered[0], teams[1]);
  assert.equal(ordered[1], teams[0]);
});

test("applySlugOrder: unlisted teams keep their incoming relative order", () => {
  assert.deepEqual(slugsOf(applySlugOrder([t("c"), t("a"), t("b")], ["b"])), ["b", "c", "a"]);
  assert.deepEqual(slugsOf(applySlugOrder([t("c"), t("a")], null)), ["c", "a"]);
});

// ── Save-side helpers ─────────────────────────────────────────────────────

test("dedupeTeamSlugs: first occurrence wins; non-strings and blanks dropped", () => {
  assert.deepEqual(dedupeTeamSlugs(["a", "b", "a", "", 3, null, "c", "b"]), ["a", "b", "c"]);
});

test("MAX_SAVED_TEAM_SLUGS is a sane bound", () => {
  assert.ok(MAX_SAVED_TEAM_SLUGS >= 50 && MAX_SAVED_TEAM_SLUGS <= 1000);
});

test("moveItem: up, down, and out-of-range moves", () => {
  assert.deepEqual(moveItem(["a", "b", "c"], 2, 0), ["c", "a", "b"]);
  assert.deepEqual(moveItem(["a", "b", "c"], 0, 1), ["b", "a", "c"]);
  assert.deepEqual(moveItem(["a", "b", "c"], 0, -1), ["a", "b", "c"]);
  assert.deepEqual(moveItem(["a", "b", "c"], 2, 3), ["a", "b", "c"]);
});

test("sameOrder", () => {
  assert.equal(sameOrder(["a", "b"], ["a", "b"]), true);
  assert.equal(sameOrder(["a", "b"], ["b", "a"]), false);
  assert.equal(sameOrder(["a"], ["a", "b"]), false);
});
