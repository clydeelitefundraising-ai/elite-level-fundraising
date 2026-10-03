// Parent athlete picker UX polish — pure-function tests for searchAthletes().
import test from "node:test";
import assert from "node:assert/strict";
import { searchAthletes, MAX_SEARCH_RESULTS, type SearchableAthlete } from "./athleteSearch.ts";

const ROSTER: SearchableAthlete[] = [
  { id: "a1", name: "Carter Sanders", event: "Jumps" },
  { id: "a2", name: "Colin Morgan", event: "Hurdles" },
  { id: "a3", name: "Abigail Cooper" },
  { id: "a4", name: "Aaron Jackson" },
];

test("empty query returns no results", () => {
  assert.deepEqual(searchAthletes(ROSTER, ""), []);
});

test("whitespace-only query returns no results", () => {
  assert.deepEqual(searchAthletes(ROSTER, "   "), []);
});

test("partial, case-insensitive match: 'car' matches Carter Sanders", () => {
  const results = searchAthletes(ROSTER, "car");
  assert.deepEqual(results.map(r => r.id), ["a1"]);
});

test("partial, case-insensitive match: 'MORG' matches Colin Morgan", () => {
  const results = searchAthletes(ROSTER, "MORG");
  assert.deepEqual(results.map(r => r.id), ["a2"]);
});

test("query is trimmed before matching", () => {
  const results = searchAthletes(ROSTER, "  car  ");
  assert.deepEqual(results.map(r => r.id), ["a1"]);
});

test("already-selected athletes are excluded from results", () => {
  const results = searchAthletes(ROSTER, "a", ["a3", "a4"]);
  assert.deepEqual(results.map(r => r.id).sort(), ["a1", "a2"]);
});

test("no match returns an empty array", () => {
  assert.deepEqual(searchAthletes(ROSTER, "zzz"), []);
});

test("results are capped at MAX_SEARCH_RESULTS", () => {
  const bigRoster: SearchableAthlete[] = Array.from({ length: 20 }, (_, i) => ({ id: `id-${i}`, name: `Match Athlete ${i}` }));
  const results = searchAthletes(bigRoster, "match");
  assert.equal(results.length, MAX_SEARCH_RESULTS);
});
