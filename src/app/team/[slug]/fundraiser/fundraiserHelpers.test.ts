import test from "node:test";
import assert from "node:assert/strict";
import { shouldShowDesktopFundraiserFollowUps } from "./fundraiserHelpers.ts";
import { isStaff, isHeadCoach, type TeamActor } from "../../../../lib/permissions.ts";

// Same fixture convention as rosterHelpers.test.ts / calendarHelpers.test.ts /
// communicationsHelpers.test.ts.

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

// ─── shouldShowDesktopFundraiserFollowUps: desktop eligibility ──────────────

test("shouldShowDesktopFundraiserFollowUps: true for Head Coach", () => {
  assert.equal(shouldShowDesktopFundraiserFollowUps(coachActor("head_coach")), true);
});

test("shouldShowDesktopFundraiserFollowUps: true for Assistant Coach", () => {
  assert.equal(shouldShowDesktopFundraiserFollowUps(coachActor("assistant_coach")), true);
});

test("shouldShowDesktopFundraiserFollowUps: true for Platform Admin", () => {
  assert.equal(shouldShowDesktopFundraiserFollowUps(platformAdminActor()), true);
});

test("shouldShowDesktopFundraiserFollowUps: false for Booster (team_coaches role)", () => {
  assert.equal(shouldShowDesktopFundraiserFollowUps(coachActor("booster")), false);
});

test("shouldShowDesktopFundraiserFollowUps: false for Booster (team_members role)", () => {
  assert.equal(shouldShowDesktopFundraiserFollowUps(memberActor("booster")), false);
});

test("shouldShowDesktopFundraiserFollowUps: false for Parent", () => {
  assert.equal(shouldShowDesktopFundraiserFollowUps(memberActor("parent")), false);
});

test("shouldShowDesktopFundraiserFollowUps: false for Athlete", () => {
  assert.equal(shouldShowDesktopFundraiserFollowUps(memberActor("athlete")), false);
});

test("shouldShowDesktopFundraiserFollowUps: false for public/unauthenticated", () => {
  assert.equal(shouldShowDesktopFundraiserFollowUps(publicActor), false);
});

// ─── Permission invariants (locking Step 0's authoritative audit) ──────────
//
// Follow-Ups viewing + every action (update outreach, export, print) is
// gated identically by isStaff() at the API level (see
// src/app/api/team/[slug]/outreach/[athleteId]/route.ts) — there is no
// Head-Coach-only action inside Follow-Ups itself, unlike Calendar/
// Communications' Delete. Desktop *presentation* eligibility
// (isCoachOnly) is a separate, narrower concept that must never be
// confused with this.

test("Booster is excluded from the desktop workspace but retains isStaff (view/update/export/print) on both role shapes", () => {
  const boosterCoachRow = coachActor("booster");
  const boosterMemberRow = memberActor("booster");
  assert.equal(shouldShowDesktopFundraiserFollowUps(boosterCoachRow), false);
  assert.equal(shouldShowDesktopFundraiserFollowUps(boosterMemberRow), false);
  assert.equal(isStaff(boosterCoachRow), true);
  assert.equal(isStaff(boosterMemberRow), true);
});

test("Assistant Coach is desktop-eligible and retains isStaff outreach-action permission", () => {
  const assistant = coachActor("assistant_coach");
  assert.equal(shouldShowDesktopFundraiserFollowUps(assistant), true);
  assert.equal(isStaff(assistant), true);
});

test("Platform Admin is desktop-eligible and retains isStaff outreach-action permission", () => {
  const admin = platformAdminActor();
  assert.equal(shouldShowDesktopFundraiserFollowUps(admin), true);
  assert.equal(isStaff(admin), true);
});

test("Head Coach is desktop-eligible and retains full isStaff/isHeadCoach permissions", () => {
  const headCoach = coachActor("head_coach");
  assert.equal(shouldShowDesktopFundraiserFollowUps(headCoach), true);
  assert.equal(isStaff(headCoach), true);
  assert.equal(isHeadCoach(headCoach), true);
});

test("Parent/Athlete (plain members) do not satisfy isStaff — no Follow-Ups access at all, matching page.tsx's routing to the athlete FundraiserView instead", () => {
  assert.equal(isStaff(memberActor("parent")), false);
  assert.equal(isStaff(memberActor("athlete")), false);
});
