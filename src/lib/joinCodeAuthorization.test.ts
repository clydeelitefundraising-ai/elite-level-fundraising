import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isHeadCoach, isStaff, type TeamActor } from "./permissions.ts";

// Regression coverage for pilot-hardening P1 #1: manual QA found a Booster
// could revoke/regenerate the team join code from Team Settings. Root
// cause was /api/team/[slug]/join-codes (POST) and .../join-codes/[id]
// (PATCH) gating on isStaff (head_coach + assistant_coach + booster)
// instead of isHeadCoach. Fixed by switching both mutation handlers to
// isHeadCoach — this file locks that in two ways: a direct unit test of
// the permission helpers' semantics, and a source-scan confirming the two
// route files actually call isHeadCoach (not isStaff) for their mutating
// handlers, since there's no HTTP test harness in this repo to hit the
// routes directly.

function coachActor(role: "head_coach" | "assistant_coach" | "booster"): TeamActor {
  return { kind: "coach", session: { id: "c1", name: "Test Coach", role, campaign_slug: "test-team" } };
}
function memberActor(role: "athlete" | "parent" | "booster"): TeamActor {
  return { kind: "member", session: { id: "m1", name: "Test Member", role, campaign_slug: "test-team", athlete_id: null } };
}
const publicActor: TeamActor = { kind: "public" };

test("isHeadCoach: true only for the coach-kind head_coach role", () => {
  assert.equal(isHeadCoach(coachActor("head_coach")), true);
  assert.equal(isHeadCoach(coachActor("assistant_coach")), false);
  assert.equal(isHeadCoach(coachActor("booster")), false);
  assert.equal(isHeadCoach(memberActor("athlete")), false);
  assert.equal(isHeadCoach(memberActor("parent")), false);
  assert.equal(isHeadCoach(memberActor("booster")), false);
  assert.equal(isHeadCoach(publicActor), false);
});

test("isStaff: still true for assistant_coach and booster (unchanged — GET/view access is intentionally broader than mutation access)", () => {
  assert.equal(isStaff(coachActor("head_coach")), true);
  assert.equal(isStaff(coachActor("assistant_coach")), true);
  assert.equal(isStaff(coachActor("booster")), true);
  assert.equal(isStaff(memberActor("booster")), true);
  assert.equal(isStaff(memberActor("athlete")), false);
  assert.equal(isStaff(memberActor("parent")), false);
});

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("join-codes POST (generate/regenerate) is gated on isHeadCoach, not isStaff", () => {
  const src = read("src/app/api/team/[slug]/join-codes/route.ts");
  const postFn = src.slice(src.indexOf("export async function POST"));
  assert.match(postFn, /isHeadCoach\(actor\)/, "POST handler must call isHeadCoach(actor)");
  assert.doesNotMatch(postFn, /isStaff\(actor\)/, "POST handler must not fall back to isStaff(actor)");
});

test("join-codes GET (view/copy the active code) stays isStaff — any staff member can still see and share the link", () => {
  const src = read("src/app/api/team/[slug]/join-codes/route.ts");
  const getFn = src.slice(src.indexOf("export async function GET"), src.indexOf("export async function POST"));
  assert.match(getFn, /isStaff\(actor\)/, "GET handler should remain isStaff-gated (read access for all staff)");
});

test("join-codes/[id] PATCH (revoke) is gated on isHeadCoach, not isStaff", () => {
  const src = read("src/app/api/team/[slug]/join-codes/[id]/route.ts");
  assert.match(src, /isHeadCoach\(actor\)/, "PATCH handler must call isHeadCoach(actor)");
  assert.doesNotMatch(src, /isStaff\(actor\)/, "PATCH handler must not fall back to isStaff(actor)");
});

test("the normal athlete/parent join flow (consuming an existing code) is untouched", () => {
  for (const routePath of ["src/app/api/auth/join/route.ts", "src/app/api/auth/join-request/route.ts"]) {
    const src = read(routePath);
    // These only ever SELECT against team_join_codes to validate a
    // supplied code — never PATCH/POST to mutate one.
    assert.doesNotMatch(src, /method:\s*["']PATCH["']/, `${routePath} must not mutate join codes`);
    assert.doesNotMatch(src, /isHeadCoach/, `${routePath} is unauthenticated by design — it must not gate on coach role at all`);
  }
});
