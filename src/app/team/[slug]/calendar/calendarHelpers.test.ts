import test from "node:test";
import assert from "node:assert/strict";
import {
  shouldShowDesktopCalendar,
  splitDayEvents,
  DESKTOP_MAX_VISIBLE_EVENTS_PER_DAY,
} from "./calendarHelpers.ts";
import { isStaff, type TeamActor } from "../../../../lib/permissions.ts";

// Same fixture convention as src/app/team/[slug]/team/rosterHelpers.test.ts /
// src/lib/permissions.test.ts.

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

// ─── shouldShowDesktopCalendar ──────────────────────────────────────────────

test("shouldShowDesktopCalendar: true for Head Coach", () => {
  assert.equal(shouldShowDesktopCalendar(coachActor("head_coach")), true);
});

test("shouldShowDesktopCalendar: true for Assistant Coach", () => {
  assert.equal(shouldShowDesktopCalendar(coachActor("assistant_coach")), true);
});

test("shouldShowDesktopCalendar: true for Platform Admin", () => {
  assert.equal(shouldShowDesktopCalendar(platformAdminActor()), true);
});

test("shouldShowDesktopCalendar: false for Booster (team_coaches role)", () => {
  assert.equal(shouldShowDesktopCalendar(coachActor("booster")), false);
});

test("shouldShowDesktopCalendar: false for Booster (team_members role)", () => {
  assert.equal(shouldShowDesktopCalendar(memberActor("booster")), false);
});

test("shouldShowDesktopCalendar: false for Parent", () => {
  assert.equal(shouldShowDesktopCalendar(memberActor("parent")), false);
});

test("shouldShowDesktopCalendar: false for Athlete", () => {
  assert.equal(shouldShowDesktopCalendar(memberActor("athlete")), false);
});

test("shouldShowDesktopCalendar: false for public/unauthenticated", () => {
  assert.equal(shouldShowDesktopCalendar(publicActor), false);
});

// ─── Desktop eligibility never alters write permissions ─────────────────────

test("Booster is excluded from the desktop workspace but retains full isStaff write permission (both role shapes)", () => {
  const boosterCoachRow = coachActor("booster");
  const boosterMemberRow = memberActor("booster");
  assert.equal(shouldShowDesktopCalendar(boosterCoachRow), false);
  assert.equal(shouldShowDesktopCalendar(boosterMemberRow), false);
  assert.equal(isStaff(boosterCoachRow), true);
  assert.equal(isStaff(boosterMemberRow), true);
});

test("Head Coach is both desktop-eligible and retains isStaff write permission", () => {
  const headCoach = coachActor("head_coach");
  assert.equal(shouldShowDesktopCalendar(headCoach), true);
  assert.equal(isStaff(headCoach), true);
});

// ─── splitDayEvents ─────────────────────────────────────────────────────────

test("splitDayEvents: 0 events -> empty, no overflow", () => {
  const { visible, overflowCount } = splitDayEvents([]);
  assert.deepEqual(visible, []);
  assert.equal(overflowCount, 0);
});

test("splitDayEvents: 1 event -> 1 visible, no overflow", () => {
  const { visible, overflowCount } = splitDayEvents(["a"]);
  assert.deepEqual(visible, ["a"]);
  assert.equal(overflowCount, 0);
});

test("splitDayEvents: exactly 3 events -> all visible, no overflow", () => {
  const { visible, overflowCount } = splitDayEvents(["a", "b", "c"]);
  assert.deepEqual(visible, ["a", "b", "c"]);
  assert.equal(overflowCount, 0);
});

test("splitDayEvents: 4 events -> 3 visible + '+1 more'", () => {
  const { visible, overflowCount } = splitDayEvents(["a", "b", "c", "d"]);
  assert.deepEqual(visible, ["a", "b", "c"]);
  assert.equal(overflowCount, 1);
});

test("splitDayEvents: 6 events -> 3 visible + '+3 more'", () => {
  const { visible, overflowCount } = splitDayEvents(["a", "b", "c", "d", "e", "f"]);
  assert.deepEqual(visible, ["a", "b", "c"]);
  assert.equal(overflowCount, 3);
});

test("splitDayEvents: order is deterministic — preserves input order, never re-sorts", () => {
  const { visible } = splitDayEvents(["z", "a", "m", "q", "b"]);
  assert.deepEqual(visible, ["z", "a", "m"]);
});

test("splitDayEvents: respects a custom max", () => {
  const { visible, overflowCount } = splitDayEvents(["a", "b", "c", "d", "e"], 2);
  assert.deepEqual(visible, ["a", "b"]);
  assert.equal(overflowCount, 3);
});

test("DESKTOP_MAX_VISIBLE_EVENTS_PER_DAY is 3", () => {
  assert.equal(DESKTOP_MAX_VISIBLE_EVENTS_PER_DAY, 3);
});
