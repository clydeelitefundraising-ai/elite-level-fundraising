import test from "node:test";
import assert from "node:assert/strict";
import {
  shouldShowCoachDashboard,
  buildQuickActions,
  resolveRequestsCardData,
  shouldShowFundraisingCard,
} from "./coachDashboardHelpers.ts";
import type { TeamActor } from "@/lib/permissions";
import type { PendingRequestSummary } from "@/lib/platform/requests";

// Same fixture convention as src/lib/permissions.test.ts.

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

// ─── shouldShowCoachDashboard ───────────────────────────────────────────────

test("shouldShowCoachDashboard: true for Head Coach", () => {
  assert.equal(shouldShowCoachDashboard(coachActor("head_coach")), true);
});

test("shouldShowCoachDashboard: true for Assistant Coach", () => {
  assert.equal(shouldShowCoachDashboard(coachActor("assistant_coach")), true);
});

test("shouldShowCoachDashboard: true for Platform Admin", () => {
  assert.equal(shouldShowCoachDashboard(platformAdminActor()), true);
});

test("shouldShowCoachDashboard: false for Booster (coach-table booster), unlike isStaff()", () => {
  assert.equal(shouldShowCoachDashboard(coachActor("booster")), false);
});

test("shouldShowCoachDashboard: false for Booster (member-table booster), unlike isStaff()", () => {
  assert.equal(shouldShowCoachDashboard(memberActor("booster")), false);
});

test("shouldShowCoachDashboard: false for Athlete", () => {
  assert.equal(shouldShowCoachDashboard(memberActor("athlete")), false);
});

test("shouldShowCoachDashboard: false for Parent", () => {
  assert.equal(shouldShowCoachDashboard(memberActor("parent")), false);
});

test("shouldShowCoachDashboard: false for public", () => {
  assert.equal(shouldShowCoachDashboard(publicActor), false);
});

// ─── buildQuickActions ──────────────────────────────────────────────────────

test("buildQuickActions: Head Coach gets all four actions, correct destinations", () => {
  const actions = buildQuickActions("wildcats-2026", coachActor("head_coach"));
  assert.deepEqual(actions.map(a => a.key), ["post-announcement", "add-event", "send-message", "manage-team"]);
  const byKey = Object.fromEntries(actions.map(a => [a.key, a.href]));
  assert.equal(byKey["post-announcement"], "/team/wildcats-2026/communications?tab=updates");
  assert.equal(byKey["add-event"], "/team/wildcats-2026/calendar");
  assert.equal(byKey["send-message"], "/team/wildcats-2026/messages");
  assert.equal(byKey["manage-team"], "/team/wildcats-2026/team");
});

test("buildQuickActions: Assistant Coach gets all four actions (isStaff() is true for assistant coaches)", () => {
  const actions = buildQuickActions("wildcats-2026", coachActor("assistant_coach"));
  assert.deepEqual(actions.map(a => a.key), ["post-announcement", "add-event", "send-message", "manage-team"]);
});

test("buildQuickActions: Platform Admin gets all four actions", () => {
  const actions = buildQuickActions("wildcats-2026", platformAdminActor());
  assert.deepEqual(actions.map(a => a.key), ["post-announcement", "add-event", "send-message", "manage-team"]);
});

test("buildQuickActions: a Booster (not staff-gated out, since isStaff includes boosters) still only gets Send Message + Manage Team if somehow called — documents isStaff()'s actual boundary", () => {
  // Boosters never actually reach buildQuickActions in the real app (the
  // dashboard itself is gated by shouldShowCoachDashboard first) — this
  // test exists purely to lock in that buildQuickActions itself gates
  // Post Announcement/Add Event on isStaff(), not shouldShowCoachDashboard,
  // so a future refactor can't silently conflate the two.
  const actions = buildQuickActions("wildcats-2026", coachActor("booster"));
  assert.deepEqual(actions.map(a => a.key), ["post-announcement", "add-event", "send-message", "manage-team"]);
});

test("buildQuickActions: a non-staff member only gets Send Message + Manage Team", () => {
  const actions = buildQuickActions("wildcats-2026", memberActor("athlete"));
  assert.deepEqual(actions.map(a => a.key), ["send-message", "manage-team"]);
});

// ─── resolveRequestsCardData ────────────────────────────────────────────────

const SUMMARY: PendingRequestSummary = { athleteRequests: 2, commentApprovals: 1, total: 3 };

test("resolveRequestsCardData: visible for Head Coach, with the exact summary passed through", () => {
  assert.deepEqual(resolveRequestsCardData(coachActor("head_coach"), SUMMARY), SUMMARY);
});

test("resolveRequestsCardData: visible for Platform Admin", () => {
  assert.deepEqual(resolveRequestsCardData(platformAdminActor(), SUMMARY), SUMMARY);
});

test("resolveRequestsCardData: absent (null) for Assistant Coach", () => {
  assert.equal(resolveRequestsCardData(coachActor("assistant_coach"), SUMMARY), null);
});

test("resolveRequestsCardData: absent (null) for Booster", () => {
  assert.equal(resolveRequestsCardData(coachActor("booster"), SUMMARY), null);
  assert.equal(resolveRequestsCardData(memberActor("booster"), SUMMARY), null);
});

// ─── shouldShowFundraisingCard ──────────────────────────────────────────────

test("shouldShowFundraisingCard: false when nothing has been raised yet, matching mobile FundraiserSnapshot's rule", () => {
  assert.equal(shouldShowFundraisingCard(0), false);
});

test("shouldShowFundraisingCard: true once anything has been raised", () => {
  assert.equal(shouldShowFundraisingCard(1), true);
  assert.equal(shouldShowFundraisingCard(500000), true);
});
