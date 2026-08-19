import test from "node:test";
import assert from "node:assert/strict";
import { aggregateTeamStaff, type CoachSourceRow, type MemberBoosterRow } from "./staffAggregation.ts";

function coach(id: string, name: string, role: "head_coach" | "assistant_coach" | "booster", account_id: string | null = null): CoachSourceRow {
  return { id, name, role, account_id };
}

function memberBooster(id: string, name: string, account_id: string | null = null): MemberBoosterRow {
  return { id, name, account_id };
}

test("includes Head Coach and Assistant Coaches regardless of booster visibility", () => {
  const rows = [coach("c1", "Jane Smith", "head_coach"), coach("c2", "Sarah Jones", "assistant_coach")];
  const result = aggregateTeamStaff(rows, [], false);
  assert.deepEqual(result.map(r => r.name), ["Jane Smith", "Sarah Jones"]);
});

test("booster visibility ON: booster from team_coaches appears", () => {
  const rows = [coach("c1", "Jane Smith", "head_coach"), coach("c2", "Stephanie Nielsen", "booster")];
  const result = aggregateTeamStaff(rows, [], true);
  assert.deepEqual(result.map(r => r.name), ["Jane Smith", "Stephanie Nielsen"]);
});

test("booster visibility OFF: no booster entries at all, from either source", () => {
  const coachRows = [coach("c1", "Jane Smith", "head_coach"), coach("c2", "Coach Booster", "booster", "acct-1")];
  const memberRows = [memberBooster("m1", "Member Booster", "acct-2")];
  const result = aggregateTeamStaff(coachRows, memberRows, false);
  assert.deepEqual(result.map(r => r.name), ["Jane Smith"]);
});

test("booster from team_members only (no team_coaches booster) is included when visible", () => {
  const coachRows = [coach("c1", "Jane Smith", "head_coach")];
  const memberRows = [memberBooster("m1", "Parent Booster", null)];
  const result = aggregateTeamStaff(coachRows, memberRows, true);
  assert.deepEqual(result.map(r => r.name), ["Jane Smith", "Parent Booster"]);
});

// ── Deduplication rule: account_id match only ──────────────────────────────

test("dedup: same account_id on both sides merges into one entry", () => {
  const coachRows = [coach("c1", "Jane Smith", "head_coach"), coach("c2", "Coach-Side Name", "booster", "acct-shared")];
  const memberRows = [memberBooster("m1", "Member-Side Name", "acct-shared")];
  const result = aggregateTeamStaff(coachRows, memberRows, true);
  const boosters = result.filter(r => r.role === "booster");
  assert.equal(boosters.length, 1, "expected exactly one merged booster entry");
  // Coach-side row wins the merged entry's identity (arbitrary but deterministic — first source wins).
  assert.equal(boosters[0].name, "Coach-Side Name");
});

test("dedup: different (non-null) account_ids are NOT merged — listed independently", () => {
  const coachRows = [coach("c1", "Jane Smith", "head_coach"), coach("c2", "Coach Booster", "booster", "acct-A")];
  const memberRows = [memberBooster("m1", "Different Booster", "acct-B")];
  const result = aggregateTeamStaff(coachRows, memberRows, true);
  const boosters = result.filter(r => r.role === "booster");
  assert.equal(boosters.length, 2);
  assert.deepEqual(boosters.map(b => b.name).sort(), ["Coach Booster", "Different Booster"]);
});

test("dedup: missing account_id on either side never merges (no fuzzy name matching), even with identical names", () => {
  const coachRows = [coach("c1", "Jane Smith", "head_coach"), coach("c2", "Same Name Booster", "booster", null)];
  const memberRows = [memberBooster("m1", "Same Name Booster", null)];
  const result = aggregateTeamStaff(coachRows, memberRows, true);
  const boosters = result.filter(r => r.role === "booster");
  assert.equal(boosters.length, 2, "rows with no linked account must never be fuzzy-matched by name");
});

test("dedup: one side has account_id, other side null — not merged", () => {
  const coachRows = [coach("c1", "Jane Smith", "head_coach"), coach("c2", "Coach Booster", "booster", "acct-1")];
  const memberRows = [memberBooster("m1", "Member Booster", null)];
  const result = aggregateTeamStaff(coachRows, memberRows, true);
  assert.equal(result.filter(r => r.role === "booster").length, 2);
});

test("multiple distinct boosters from both sources, no overlap, all included", () => {
  const coachRows = [coach("c1", "Jane Smith", "head_coach"), coach("c2", "Booster One", "booster", "acct-1")];
  const memberRows = [memberBooster("m1", "Booster Two", "acct-2"), memberBooster("m2", "Booster Three", null)];
  const result = aggregateTeamStaff(coachRows, memberRows, true);
  assert.deepEqual(result.filter(r => r.role === "booster").map(r => r.name).sort(), ["Booster One", "Booster Three", "Booster Two"]);
});

// ── Field safety: only name + role are ever exposed ────────────────────────

test("returned entries expose only key/name/role — no email, phone, account_id, or other metadata", () => {
  const coachRows = [coach("c1", "Jane Smith", "head_coach", "acct-1")];
  const result = aggregateTeamStaff(coachRows, [], true);
  assert.deepEqual(Object.keys(result[0]).sort(), ["key", "name", "role"]);
});

// ── Ordering ─────────────────────────────────────────────────────────────

test("orders Head Coach, then Assistant Coaches, then Boosters", () => {
  const coachRows = [
    coach("c1", "A Booster", "booster"),
    coach("c2", "The Assistant", "assistant_coach"),
    coach("c3", "The Head Coach", "head_coach"),
  ];
  const result = aggregateTeamStaff(coachRows, [], true);
  assert.deepEqual(result.map(r => r.role), ["head_coach", "assistant_coach", "booster"]);
});
