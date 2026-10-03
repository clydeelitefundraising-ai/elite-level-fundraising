// Family Relationships Phase D — pure-function tests for computeFamilyStatus().
import test from "node:test";
import assert from "node:assert/strict";
import { computeFamilyStatus, type FamilyAthlete } from "./familyStatus.ts";

const ROSTER: FamilyAthlete[] = [
  { id: "emma", name: "Emma Wagner", event: "Sprints" },
  { id: "jake", name: "Jake Wagner", event: "Hurdles" },
  { id: "abby", name: "Abby Cooper", event: null },
];

test("an athlete with no linked/pending relationship is searchable (available)", () => {
  const result = computeFamilyStatus(ROSTER, [], []);
  assert.deepEqual(result.linked, []);
  assert.deepEqual(result.pending, []);
  assert.deepEqual(result.searchable.map(a => a.id).sort(), ["abby", "emma", "jake"]);
});

test("linked ids land in linked, not searchable or pending", () => {
  const result = computeFamilyStatus(ROSTER, ["emma"], []);
  assert.deepEqual(result.linked.map(a => a.id), ["emma"]);
  assert.ok(!result.searchable.some(a => a.id === "emma"));
  assert.ok(!result.pending.some(a => a.id === "emma"));
});

test("pending ids land in pending, not searchable", () => {
  const result = computeFamilyStatus(ROSTER, [], ["jake"]);
  assert.deepEqual(result.pending.map(a => a.id), ["jake"]);
  assert.ok(!result.searchable.some(a => a.id === "jake"));
});

test("linked takes precedence over pending for the same athlete (defense in depth)", () => {
  const result = computeFamilyStatus(ROSTER, ["emma"], ["emma"]);
  assert.deepEqual(result.linked.map(a => a.id), ["emma"]);
  assert.ok(!result.pending.some(a => a.id === "emma"));
});

test("a previously-declined athlete (absent from both linked and pending) is searchable again, never a separate 'declined' bucket", () => {
  // Simulates: emma was declined, so she has no linked and no pending id —
  // computeFamilyStatus has no concept of "declined" at all.
  const result = computeFamilyStatus(ROSTER, [], []);
  assert.ok(result.searchable.some(a => a.id === "emma"));
});

test("mixed roster: one linked, one pending, one available", () => {
  const result = computeFamilyStatus(ROSTER, ["emma"], ["jake"]);
  assert.deepEqual(result.linked.map(a => a.id), ["emma"]);
  assert.deepEqual(result.pending.map(a => a.id), ["jake"]);
  assert.deepEqual(result.searchable.map(a => a.id), ["abby"]);
});

test("empty roster produces all-empty buckets", () => {
  const result = computeFamilyStatus([], ["emma"], ["jake"]);
  assert.deepEqual(result, { linked: [], pending: [], searchable: [] });
});
