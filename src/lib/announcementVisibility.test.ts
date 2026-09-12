import test from "node:test";
import assert from "node:assert/strict";
import { isAnnouncementVisibleToActor } from "./announcementVisibility.ts";
import type { TeamActor } from "./permissions.ts";

// Phase QA-Build8 — Issue 7 (critical): announcements previously leaked
// across audiences with zero server-side filtering. isAnnouncementVisibleToActor
// is the single predicate now used by BOTH getAnnouncements() and
// getAnnouncementMeta() (the feed and the nav badge count) — it delegates
// the actual per-role matrix to isVisibleToMember() (notifications.ts,
// already correct/unchanged) and adds only the "coach/platform_admin
// always sees everything" exemption on top.

const HEAD_COACH: TeamActor = { kind: "coach", session: { id: "coach-1", name: "Head Coach", role: "head_coach", campaign_slug: "s" } };
const ASSISTANT_COACH: TeamActor = { kind: "coach", session: { id: "coach-2", name: "Assistant Coach", role: "assistant_coach", campaign_slug: "s" } };
const PLATFORM_ADMIN: TeamActor = { kind: "platform_admin", session: { platformAdminId: "pa-1", accountId: "acct-1", name: "Admin", email: "a@b.com", campaign_slug: "s" } };

const athlete = (athleteId = "athlete-1"): TeamActor => ({
  kind: "member",
  session: { id: "member-athlete", name: "Athlete", role: "athlete", campaign_slug: "s", athlete_id: athleteId, account_id: null },
});
const parent = (linkedAthleteId = "athlete-1"): TeamActor => ({
  kind: "member",
  session: { id: "member-parent", name: "Parent", role: "parent", campaign_slug: "s", athlete_id: linkedAthleteId, account_id: null },
});
const booster: TeamActor = {
  kind: "member",
  session: { id: "member-booster", name: "Booster", role: "booster", campaign_slug: "s", athlete_id: null, account_id: null },
};

type Scope = "everyone" | "athletes" | "parents" | "boosters" | "athlete_specific";
function announcement(scope: Scope, recipientAthleteId: string | null = null) {
  return { recipient_scope: scope, recipient_athlete_id: recipientAthleteId };
}

// ── Coaches / platform admin: ALWAYS see everything, regardless of scope ──

test("head coach sees every audience scope, including Specific Athlete for an unrelated athlete", () => {
  for (const scope of ["everyone", "athletes", "parents", "boosters"] as const) {
    assert.equal(isAnnouncementVisibleToActor(announcement(scope), HEAD_COACH), true, scope);
  }
  assert.equal(isAnnouncementVisibleToActor(announcement("athlete_specific", "some-other-athlete"), HEAD_COACH), true);
});

test("assistant coach sees every audience scope, including Specific Athlete for an unrelated athlete", () => {
  for (const scope of ["everyone", "athletes", "parents", "boosters"] as const) {
    assert.equal(isAnnouncementVisibleToActor(announcement(scope), ASSISTANT_COACH), true, scope);
  }
  assert.equal(isAnnouncementVisibleToActor(announcement("athlete_specific", "some-other-athlete"), ASSISTANT_COACH), true);
});

test("platform admin sees every audience scope, including Specific Athlete for an unrelated athlete", () => {
  for (const scope of ["everyone", "athletes", "parents", "boosters"] as const) {
    assert.equal(isAnnouncementVisibleToActor(announcement(scope), PLATFORM_ADMIN), true, scope);
  }
  assert.equal(isAnnouncementVisibleToActor(announcement("athlete_specific", "some-other-athlete"), PLATFORM_ADMIN), true);
});

// ── Everyone: every role sees it ──

test("Everyone scope is visible to athlete, parent, and booster", () => {
  assert.equal(isAnnouncementVisibleToActor(announcement("everyone"), athlete()), true);
  assert.equal(isAnnouncementVisibleToActor(announcement("everyone"), parent()), true);
  assert.equal(isAnnouncementVisibleToActor(announcement("everyone"), booster), true);
});

// ── Athletes: athletes only, not parents/boosters ──

test("Athletes scope is visible to an athlete", () => {
  assert.equal(isAnnouncementVisibleToActor(announcement("athletes"), athlete()), true);
});
test("Athletes scope is NOT visible to a parent (regression: this was the reported leak)", () => {
  assert.equal(isAnnouncementVisibleToActor(announcement("athletes"), parent()), false);
});
test("Athletes scope is NOT visible to a booster", () => {
  assert.equal(isAnnouncementVisibleToActor(announcement("athletes"), booster), false);
});

// ── Parents: parents only, not athletes/boosters ──

test("Parents scope is visible to a parent", () => {
  assert.equal(isAnnouncementVisibleToActor(announcement("parents"), parent()), true);
});
test("Parents scope is NOT visible to an athlete (the exact bug reported)", () => {
  assert.equal(isAnnouncementVisibleToActor(announcement("parents"), athlete()), false);
});
test("Parents scope is NOT visible to a booster", () => {
  assert.equal(isAnnouncementVisibleToActor(announcement("parents"), booster), false);
});

// ── Boosters: boosters only, not athletes/parents ──

test("Boosters scope is visible to a booster", () => {
  assert.equal(isAnnouncementVisibleToActor(announcement("boosters"), booster), true);
});
test("Boosters scope is NOT visible to an athlete", () => {
  assert.equal(isAnnouncementVisibleToActor(announcement("boosters"), athlete()), false);
});
test("Boosters scope is NOT visible to a parent", () => {
  assert.equal(isAnnouncementVisibleToActor(announcement("boosters"), parent()), false);
});

// ── Specific Athlete: only the matching athlete/linked parent, never others ──

test("Specific Athlete scope is visible to the matching athlete", () => {
  assert.equal(isAnnouncementVisibleToActor(announcement("athlete_specific", "athlete-1"), athlete("athlete-1")), true);
});
test("Specific Athlete scope is NOT visible to a different athlete", () => {
  assert.equal(isAnnouncementVisibleToActor(announcement("athlete_specific", "athlete-1"), athlete("athlete-2")), false);
});
test("Specific Athlete scope is visible to that athlete's linked parent (legacy athlete_id match)", () => {
  assert.equal(isAnnouncementVisibleToActor(announcement("athlete_specific", "athlete-1"), parent("athlete-1")), true);
});
test("Specific Athlete scope is NOT visible to a different parent", () => {
  assert.equal(isAnnouncementVisibleToActor(announcement("athlete_specific", "athlete-1"), parent("athlete-2")), false);
});
test("Specific Athlete scope is NOT visible to a booster", () => {
  assert.equal(isAnnouncementVisibleToActor(announcement("athlete_specific", "athlete-1"), booster), false);
});
