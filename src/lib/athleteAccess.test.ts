import test from "node:test";
import assert from "node:assert/strict";
import { canViewAthleteProfile } from "./athleteAccess.ts";

test("staff (coach/booster) can always open any athlete profile", () => {
  assert.equal(canViewAthleteProfile({
    isStaffActor: true, memberRole: null, selfAthleteId: null, linkedAthleteIds: [], athleteId: "a1",
  }), true);
});

test("an athlete can open their own profile", () => {
  assert.equal(canViewAthleteProfile({
    isStaffActor: false, memberRole: "athlete", selfAthleteId: "a1", linkedAthleteIds: [], athleteId: "a1",
  }), true);
});

test("an athlete cannot open a different athlete's profile", () => {
  assert.equal(canViewAthleteProfile({
    isStaffActor: false, memberRole: "athlete", selfAthleteId: "a1", linkedAthleteIds: [], athleteId: "a2",
  }), false);
});

test("a parent can open their legacy single-linked athlete's profile", () => {
  assert.equal(canViewAthleteProfile({
    isStaffActor: false, memberRole: "parent", selfAthleteId: "a1", linkedAthleteIds: [], athleteId: "a1",
  }), true);
});

test("a parent can open any athlete in their multi-child linked set", () => {
  assert.equal(canViewAthleteProfile({
    isStaffActor: false, memberRole: "parent", selfAthleteId: "a1", linkedAthleteIds: ["a1", "a2"], athleteId: "a2",
  }), true);
});

test("a parent cannot open an athlete they are not linked to", () => {
  assert.equal(canViewAthleteProfile({
    isStaffActor: false, memberRole: "parent", selfAthleteId: "a1", linkedAthleteIds: ["a1"], athleteId: "a99",
  }), false);
});

test("an unrecognized/null member role is denied, not granted by default", () => {
  assert.equal(canViewAthleteProfile({
    isStaffActor: false, memberRole: null, selfAthleteId: null, linkedAthleteIds: [], athleteId: "a1",
  }), false);
});
