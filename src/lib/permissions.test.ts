import test from "node:test";
import assert from "node:assert/strict";
import {
  isStaff, isHeadCoach, isCoachOnly, isMember, isPlatformAdmin,
  coachSession, canManageStaff, platformAdminRoleLabel,
  type TeamActor,
} from "./permissions.ts";

// Phase 2/A30: platform_admin is a real fourth TeamActor kind, resolved
// from the platform_admins table (never a team_coaches/team_members row).
// This locks in the intended semantics across all three real actor kinds
// (coach/member/platform_admin) plus public, so a future change to any
// helper can't silently regress one of them without a failing test.

function coachActor(role: "head_coach" | "assistant_coach" | "booster"): TeamActor {
  return { kind: "coach", session: { id: "c1", name: "Test Coach", role, campaign_slug: "test-team" } };
}

function memberActor(role: "athlete" | "parent" | "booster"): TeamActor {
  return { kind: "member", session: { id: "m1", name: "Test Member", role, campaign_slug: "test-team", athlete_id: null } };
}

function platformAdminActor(): TeamActor {
  return {
    kind: "platform_admin",
    session: { platformAdminId: "pa1", accountId: "acct1", name: "ELF Employee", email: "employee@elitelevelfundraising.com", campaign_slug: "test-team" },
  };
}

const publicActor: TeamActor = { kind: "public" };

test("isStaff: true for coach/assistant/booster-coach, booster-member, and platform_admin", () => {
  assert.equal(isStaff(coachActor("head_coach")), true);
  assert.equal(isStaff(coachActor("assistant_coach")), true);
  assert.equal(isStaff(coachActor("booster")), true);
  assert.equal(isStaff(memberActor("booster")), true);
  assert.equal(isStaff(platformAdminActor()), true);
});

test("isStaff: false for athlete/parent members and public", () => {
  assert.equal(isStaff(memberActor("athlete")), false);
  assert.equal(isStaff(memberActor("parent")), false);
  assert.equal(isStaff(publicActor), false);
});

test("isHeadCoach: true only for head_coach and platform_admin — never assistant/booster/member", () => {
  assert.equal(isHeadCoach(coachActor("head_coach")), true);
  assert.equal(isHeadCoach(platformAdminActor()), true);
  assert.equal(isHeadCoach(coachActor("assistant_coach")), false);
  assert.equal(isHeadCoach(coachActor("booster")), false);
  assert.equal(isHeadCoach(memberActor("booster")), false);
  assert.equal(isHeadCoach(publicActor), false);
});

test("isCoachOnly: true for head/assistant coach and platform_admin — excludes boosters (coach or member)", () => {
  assert.equal(isCoachOnly(coachActor("head_coach")), true);
  assert.equal(isCoachOnly(coachActor("assistant_coach")), true);
  assert.equal(isCoachOnly(platformAdminActor()), true);
  assert.equal(isCoachOnly(coachActor("booster")), false);
  assert.equal(isCoachOnly(memberActor("booster")), false);
});

test("isMember: true only for member-kind actors, never platform_admin", () => {
  assert.equal(isMember(memberActor("athlete")), true);
  assert.equal(isMember(platformAdminActor()), false);
  assert.equal(isMember(coachActor("head_coach")), false);
});

test("isPlatformAdmin: true only for platform_admin-kind actors", () => {
  assert.equal(isPlatformAdmin(platformAdminActor()), true);
  assert.equal(isPlatformAdmin(coachActor("head_coach")), false);
  assert.equal(isPlatformAdmin(memberActor("athlete")), false);
  assert.equal(isPlatformAdmin(publicActor), false);
});

test("coachSession: returns the session for a real coach, null for platform_admin — never fabricates a CoachSession", () => {
  const coach = coachActor("head_coach");
  assert.deepEqual(coachSession(coach), coach.kind === "coach" ? coach.session : null);
  assert.equal(coachSession(platformAdminActor()), null);
  assert.equal(coachSession(memberActor("booster")), null);
});

test("canManageStaff: true for head_coach and platform_admin, false for everyone else (mirrors isHeadCoach)", () => {
  assert.equal(canManageStaff(coachActor("head_coach")), true);
  assert.equal(canManageStaff(platformAdminActor()), true);
  assert.equal(canManageStaff(coachActor("assistant_coach")), false);
  assert.equal(canManageStaff(memberActor("booster")), false);
});

test("platformAdminRoleLabel: stable display label used wherever a platform admin authors content", () => {
  assert.equal(platformAdminRoleLabel(), "ELF Admin");
});
