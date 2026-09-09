import test from "node:test";
import assert from "node:assert/strict";
import { computeCalendarSignature } from "./calendarSignature.ts";

function row(overrides: Partial<Parameters<typeof computeCalendarSignature>[0][number]> = {}) {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    title: "Practice",
    event_date: "2026-09-10",
    event_time: "",
    start_time: "15:00:00",
    end_time: "16:30:00",
    location: "Main Gym",
    type: "practice",
    description: null,
    ...overrides,
  };
}

test("computeCalendarSignature: empty list is deterministic and stable", () => {
  assert.equal(computeCalendarSignature([]), computeCalendarSignature([]));
});

test("computeCalendarSignature: identical rows (any input order) produce the same signature", () => {
  const a = row({ id: "aaaaaaaa-0000-0000-0000-000000000000" });
  const b = row({ id: "bbbbbbbb-0000-0000-0000-000000000000" });
  const sig1 = computeCalendarSignature([a, b]);
  const sig2 = computeCalendarSignature([b, a]); // reversed DB return order
  assert.equal(sig1, sig2);
});

test("computeCalendarSignature: an EDIT to an existing row's title changes the signature", () => {
  const original = [row()];
  const edited = [row({ title: "Practice (moved indoors)" })];
  assert.notEqual(computeCalendarSignature(original), computeCalendarSignature(edited));
});

test("computeCalendarSignature: an EDIT to location changes the signature", () => {
  const original = [row()];
  const edited = [row({ location: "Away — Central High" })];
  assert.notEqual(computeCalendarSignature(original), computeCalendarSignature(edited));
});

test("computeCalendarSignature: an EDIT to start_time/end_time changes the signature", () => {
  const original = [row()];
  const edited = [row({ start_time: "16:00:00", end_time: "17:30:00" })];
  assert.notEqual(computeCalendarSignature(original), computeCalendarSignature(edited));
});

test("computeCalendarSignature: an EDIT clearing start_time/end_time to null changes the signature", () => {
  const original = [row()];
  const edited = [row({ start_time: null, end_time: null })];
  assert.notEqual(computeCalendarSignature(original), computeCalendarSignature(edited));
});

test("computeCalendarSignature: adding a row (event creation) changes the signature", () => {
  const before = [row({ id: "aaaaaaaa-0000-0000-0000-000000000000" })];
  const after  = [row({ id: "aaaaaaaa-0000-0000-0000-000000000000" }), row({ id: "bbbbbbbb-0000-0000-0000-000000000000" })];
  assert.notEqual(computeCalendarSignature(before), computeCalendarSignature(after));
});

test("computeCalendarSignature: removing a row (event deletion) changes the signature", () => {
  const before = [row({ id: "aaaaaaaa-0000-0000-0000-000000000000" }), row({ id: "bbbbbbbb-0000-0000-0000-000000000000" })];
  const after  = [row({ id: "aaaaaaaa-0000-0000-0000-000000000000" })];
  assert.notEqual(computeCalendarSignature(before), computeCalendarSignature(after));
});

test("computeCalendarSignature: field-boundary values don't collide (no separator ambiguity)", () => {
  const a = [row({ id: "aaaaaaaa-0000-0000-0000-000000000000", title: "AB", event_date: "C" })];
  const b = [row({ id: "aaaaaaaa-0000-0000-0000-000000000000", title: "A", event_date: "BC" })];
  assert.notEqual(computeCalendarSignature(a), computeCalendarSignature(b));
});

test("computeCalendarSignature: an idle re-poll with truly unchanged rows is stable", () => {
  const rows = [row({ id: "aaaaaaaa-0000-0000-0000-000000000000" }), row({ id: "bbbbbbbb-0000-0000-0000-000000000000", title: "Game" })];
  assert.equal(computeCalendarSignature(rows), computeCalendarSignature([...rows]));
});
