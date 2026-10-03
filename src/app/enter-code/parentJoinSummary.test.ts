// Family Relationships Phase C2 — pure-function tests for the parent-facing
// join summary text. No fake DB needed; buildParentJoinSummary/
// isFullyAlreadyMember take plain data in and return plain data out.
import test from "node:test";
import assert from "node:assert/strict";
import { buildParentJoinSummary, isFullyAlreadyMember, isTotalFailure, type ParentJoinResult } from "./parentJoinSummary.ts";

const NAMES = { "a1": "Emma", "a2": "Jake" };

test("single created athlete", () => {
  const results: ParentJoinResult[] = [{ athleteId: "a1", status: "created" }];
  const summary = buildParentJoinSummary(results, NAMES);
  assert.match(summary, /Emma/);
  assert.doesNotMatch(summary, /team_member_athletes|parent_access_requests|campaign_slug/i);
});

test("two created athletes are joined with 'and'", () => {
  const results: ParentJoinResult[] = [{ athleteId: "a1", status: "created" }, { athleteId: "a2", status: "created" }];
  const summary = buildParentJoinSummary(results, NAMES);
  assert.match(summary, /Emma and Jake/);
});

test("mixed created + already_pending", () => {
  const results: ParentJoinResult[] = [{ athleteId: "a1", status: "created" }, { athleteId: "a2", status: "already_pending" }];
  const summary = buildParentJoinSummary(results, NAMES);
  assert.match(summary, /Emma/);
  assert.match(summary, /Jake/);
  assert.match(summary, /pending/i);
});

test("already_member uses 'already linked' phrasing", () => {
  const results: ParentJoinResult[] = [{ athleteId: "a1", status: "already_member", memberId: "m1" } as ParentJoinResult];
  const summary = buildParentJoinSummary(results, NAMES);
  assert.match(summary, /already linked to Emma/);
});

test("partial failure clearly names both the succeeded and the failed athlete, never collapsing into one generic message", () => {
  const results: ParentJoinResult[] = [
    { athleteId: "a1", status: "created" },
    { athleteId: "a2", status: "failed", reason: "x" },
  ];
  const summary = buildParentJoinSummary(results, NAMES);
  assert.match(summary, /sent for Emma/, "must say Emma's request succeeded");
  assert.match(summary, /couldn't submit a request for Jake/, "must name Jake as the one that failed, not just a count");
});

test("total failure never implies partial success, and names the athlete(s) that failed", () => {
  const results: ParentJoinResult[] = [{ athleteId: "a1", status: "failed", reason: "x" }];
  const summary = buildParentJoinSummary(results, NAMES);
  assert.doesNotMatch(summary, /sent for/i);
  assert.match(summary, /couldn't submit a request for Emma/);
});

test("multiple failures are all named, joined naturally", () => {
  const results: ParentJoinResult[] = [
    { athleteId: "a1", status: "failed", reason: "x" },
    { athleteId: "a2", status: "failed", reason: "x" },
  ];
  const summary = buildParentJoinSummary(results, NAMES);
  assert.match(summary, /couldn't submit a request for Emma and Jake/);
});

test("unknown athlete id falls back to a safe generic label", () => {
  const results: ParentJoinResult[] = [{ athleteId: "unknown-id", status: "created" }];
  const summary = buildParentJoinSummary(results, {});
  assert.match(summary, /your child/);
});

test("isFullyAlreadyMember: true only when every result is already_member", () => {
  assert.equal(isFullyAlreadyMember([{ athleteId: "a1", status: "already_member", memberId: "m1" } as ParentJoinResult]), true);
  assert.equal(isFullyAlreadyMember([
    { athleteId: "a1", status: "already_member", memberId: "m1" } as ParentJoinResult,
    { athleteId: "a2", status: "created" },
  ]), false);
  assert.equal(isFullyAlreadyMember([]), false);
});

test("isTotalFailure: true only when every result failed — drives the 'Request Not Sent' UI, never a false 'Request Sent'", () => {
  assert.equal(isTotalFailure([{ athleteId: "a1", status: "failed", reason: "x" }]), true);
  assert.equal(isTotalFailure([
    { athleteId: "a1", status: "failed", reason: "x" },
    { athleteId: "a2", status: "failed", reason: "x" },
  ]), true);
});

test("isTotalFailure: false when at least one athlete succeeded, is pending, or is already a member", () => {
  assert.equal(isTotalFailure([
    { athleteId: "a1", status: "created" },
    { athleteId: "a2", status: "failed", reason: "x" },
  ]), false);
  assert.equal(isTotalFailure([{ athleteId: "a1", status: "already_pending" }]), false);
  assert.equal(isTotalFailure([{ athleteId: "a1", status: "already_member", memberId: "m1" } as ParentJoinResult]), false);
  assert.equal(isTotalFailure([]), false, "an empty results array must never be treated as a total failure");
});
