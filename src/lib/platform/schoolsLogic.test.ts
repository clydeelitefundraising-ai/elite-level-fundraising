import test from "node:test";
import assert from "node:assert/strict";
import { groupTeamsByOrganization, pickDirectoryHeadCoach, deriveSchoolStatus } from "./schoolsLogic.ts";

test("groupTeamsByOrganization: groups campaign rows by organization_id", () => {
  const teams = [
    { organization_id: "org-1", campaign_slug: "a" },
    { organization_id: "org-1", campaign_slug: "b" },
    { organization_id: "org-2", campaign_slug: "c" },
  ];
  const grouped = groupTeamsByOrganization(teams);
  assert.equal(grouped.get("org-1")?.length, 2);
  assert.equal(grouped.get("org-2")?.length, 1);
  assert.equal(grouped.get("org-3"), undefined);
});

test("groupTeamsByOrganization: a campaign not yet linked to any organization is excluded, never guessed", () => {
  const teams = [
    { organization_id: null, campaign_slug: "unlinked" },
    { organization_id: "org-1", campaign_slug: "linked" },
  ];
  const grouped = groupTeamsByOrganization(teams);
  assert.equal(grouped.size, 1);
  assert.equal(grouped.get("org-1")?.length, 1);
});

test("pickDirectoryHeadCoach: returns the head coach only when the school has exactly one team", () => {
  const headCoachBySlug = new Map([["only-team", "Jane Coach"]]);
  assert.equal(pickDirectoryHeadCoach([{ campaign_slug: "only-team" }], headCoachBySlug), "Jane Coach");
});

test("pickDirectoryHeadCoach: never guesses when a school has multiple teams, even if all have coaches", () => {
  const headCoachBySlug = new Map([["team-a", "Coach A"], ["team-b", "Coach B"]]);
  assert.equal(pickDirectoryHeadCoach([{ campaign_slug: "team-a" }, { campaign_slug: "team-b" }], headCoachBySlug), null);
});

test("pickDirectoryHeadCoach: null when the school has zero teams", () => {
  assert.equal(pickDirectoryHeadCoach([], new Map()), null);
});

test("pickDirectoryHeadCoach: null (not fabricated) when the single team has no head coach on file", () => {
  assert.equal(pickDirectoryHeadCoach([{ campaign_slug: "no-coach-team" }], new Map()), null);
});

test("deriveSchoolStatus: active when at least one active team exists", () => {
  assert.equal(deriveSchoolStatus(1), "active");
  assert.equal(deriveSchoolStatus(5), "active");
});

test("deriveSchoolStatus: no_active_teams when the count is zero — never fabricated as active", () => {
  assert.equal(deriveSchoolStatus(0), "no_active_teams");
});
