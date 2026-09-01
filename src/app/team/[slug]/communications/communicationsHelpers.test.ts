import test from "node:test";
import assert from "node:assert/strict";
import { shouldShowDesktopCommunications } from "./communicationsHelpers.ts";
import { isStaff, isHeadCoach, type TeamActor } from "../../../../lib/permissions.ts";

// Same fixture convention as rosterHelpers.test.ts / calendarHelpers.test.ts.

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

// ─── shouldShowDesktopCommunications: desktop eligibility ───────────────────

test("shouldShowDesktopCommunications: true for Head Coach", () => {
  assert.equal(shouldShowDesktopCommunications(coachActor("head_coach")), true);
});

test("shouldShowDesktopCommunications: true for Assistant Coach", () => {
  assert.equal(shouldShowDesktopCommunications(coachActor("assistant_coach")), true);
});

test("shouldShowDesktopCommunications: true for Platform Admin", () => {
  assert.equal(shouldShowDesktopCommunications(platformAdminActor()), true);
});

test("shouldShowDesktopCommunications: false for Booster (team_coaches role)", () => {
  assert.equal(shouldShowDesktopCommunications(coachActor("booster")), false);
});

test("shouldShowDesktopCommunications: false for Booster (team_members role)", () => {
  assert.equal(shouldShowDesktopCommunications(memberActor("booster")), false);
});

test("shouldShowDesktopCommunications: false for Parent", () => {
  assert.equal(shouldShowDesktopCommunications(memberActor("parent")), false);
});

test("shouldShowDesktopCommunications: false for Athlete", () => {
  assert.equal(shouldShowDesktopCommunications(memberActor("athlete")), false);
});

test("shouldShowDesktopCommunications: false for public/unauthenticated", () => {
  assert.equal(shouldShowDesktopCommunications(publicActor), false);
});

// ─── Permission invariants: desktop eligibility never alters isStaff/isHeadCoach ──

test("Booster is excluded from the desktop workspace but retains isStaff (Post/Edit) on both role shapes", () => {
  const boosterCoachRow = coachActor("booster");
  const boosterMemberRow = memberActor("booster");
  assert.equal(shouldShowDesktopCommunications(boosterCoachRow), false);
  assert.equal(shouldShowDesktopCommunications(boosterMemberRow), false);
  assert.equal(isStaff(boosterCoachRow), true);
  assert.equal(isStaff(boosterMemberRow), true);
});

test("Assistant Coach is desktop-eligible, retains isStaff, but does NOT satisfy isHeadCoach (no Delete)", () => {
  const assistant = coachActor("assistant_coach");
  assert.equal(shouldShowDesktopCommunications(assistant), true);
  assert.equal(isStaff(assistant), true);
  assert.equal(isHeadCoach(assistant), false);
});

test("Booster does NOT satisfy isHeadCoach (no Delete), regardless of desktop eligibility", () => {
  assert.equal(isHeadCoach(coachActor("booster")), false);
  assert.equal(isHeadCoach(memberActor("booster")), false);
});

test("Platform Admin retains Head-Coach-equivalent isHeadCoach behavior and is desktop-eligible", () => {
  const admin = platformAdminActor();
  assert.equal(shouldShowDesktopCommunications(admin), true);
  assert.equal(isHeadCoach(admin), true);
});

test("Head Coach is desktop-eligible and retains full isStaff + isHeadCoach permissions", () => {
  const headCoach = coachActor("head_coach");
  assert.equal(shouldShowDesktopCommunications(headCoach), true);
  assert.equal(isStaff(headCoach), true);
  assert.equal(isHeadCoach(headCoach), true);
});
