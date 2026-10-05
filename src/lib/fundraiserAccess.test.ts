import test from "node:test";
import assert from "node:assert/strict";
import { resolveFundraiserRouteView } from "./fundraiserAccess.ts";
import type { TeamActor } from "./permissions.ts";

const headCoach: TeamActor = { kind: "coach", session: { id: "c1", name: "Coach", role: "head_coach", campaign_slug: "s" } };
const assistantCoach: TeamActor = { kind: "coach", session: { id: "c2", name: "Asst", role: "assistant_coach", campaign_slug: "s" } };
const booster: TeamActor = { kind: "member", session: { id: "m1", name: "Booster", role: "booster", campaign_slug: "s", athlete_id: null, account_id: null } };
const athlete: TeamActor = { kind: "member", session: { id: "m2", name: "Athlete", role: "athlete", campaign_slug: "s", athlete_id: "a1", account_id: null } };
const parent: TeamActor = { kind: "member", session: { id: "m3", name: "Parent", role: "parent", campaign_slug: "s", athlete_id: "a1", account_id: null } };
const platformAdmin: TeamActor = { kind: "platform_admin", session: { platformAdminId: "p1", accountId: "acc1", name: "Admin", email: "a@b.com", campaign_slug: "s" } };
const publicActor: TeamActor = { kind: "public" };

// ── fundraising_enabled = true: unchanged for every actor kind ──────────────

test("resolveFundraiserRouteView: enabled -> dashboard for head coach", () => {
  assert.equal(resolveFundraiserRouteView(true, headCoach), "dashboard");
});
test("resolveFundraiserRouteView: enabled -> dashboard for assistant coach", () => {
  assert.equal(resolveFundraiserRouteView(true, assistantCoach), "dashboard");
});
test("resolveFundraiserRouteView: enabled -> dashboard for booster", () => {
  assert.equal(resolveFundraiserRouteView(true, booster), "dashboard");
});
test("resolveFundraiserRouteView: enabled -> dashboard for athlete", () => {
  assert.equal(resolveFundraiserRouteView(true, athlete), "dashboard");
});
test("resolveFundraiserRouteView: enabled -> dashboard for parent", () => {
  assert.equal(resolveFundraiserRouteView(true, parent), "dashboard");
});
test("resolveFundraiserRouteView: enabled -> dashboard for platform admin", () => {
  assert.equal(resolveFundraiserRouteView(true, platformAdmin), "dashboard");
});
test("resolveFundraiserRouteView: enabled -> dashboard for public visitor", () => {
  assert.equal(resolveFundraiserRouteView(true, publicActor), "dashboard");
});

// ── fundraising_enabled = false: only coaching staff gets inquiry; nobody
//    else is ever shown the dashboard; platform admin is unaffected ───────

test("resolveFundraiserRouteView: disabled -> coach-inquiry for head coach", () => {
  assert.equal(resolveFundraiserRouteView(false, headCoach), "coach-inquiry");
});
test("resolveFundraiserRouteView: disabled -> coach-inquiry for assistant coach", () => {
  assert.equal(resolveFundraiserRouteView(false, assistantCoach), "coach-inquiry");
});
test("resolveFundraiserRouteView: disabled -> unavailable for booster", () => {
  assert.equal(resolveFundraiserRouteView(false, booster), "unavailable");
});
test("resolveFundraiserRouteView: disabled -> unavailable for athlete", () => {
  assert.equal(resolveFundraiserRouteView(false, athlete), "unavailable");
});
test("resolveFundraiserRouteView: disabled -> unavailable for parent", () => {
  assert.equal(resolveFundraiserRouteView(false, parent), "unavailable");
});
test("resolveFundraiserRouteView: disabled -> unavailable for public visitor", () => {
  assert.equal(resolveFundraiserRouteView(false, publicActor), "unavailable");
});
test("resolveFundraiserRouteView: disabled -> dashboard for platform admin (unchanged behavior)", () => {
  assert.equal(resolveFundraiserRouteView(false, platformAdmin), "dashboard");
});
