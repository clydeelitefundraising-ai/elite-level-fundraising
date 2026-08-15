// Phase 4C: targeted tests for the RFC 5545 ICS serializer. Run with
// `npm test` (node:test — same infra Phase 4B introduced, no new dep).
import test from "node:test";
import assert from "node:assert/strict";
import { icsEscapeText, foldIcsLine, buildVEvent, buildIcsCalendar } from "./ics.ts";
import type { CalendarEventRow } from "./teamData.ts";

function ev(overrides: Partial<CalendarEventRow>): CalendarEventRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    campaign_slug: "test-team",
    title: "Practice",
    event_date: "2026-08-15",
    event_time: "",
    start_time: null,
    end_time: null,
    location: "",
    description: null,
    type: "practice",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// ── Escaping ──────────────────────────────────────────────────────────────

test("icsEscapeText: escapes backslash, comma, semicolon, newline (backslash first)", () => {
  assert.equal(icsEscapeText("a\\b"), "a\\\\b");
  assert.equal(icsEscapeText("a,b"), "a\\,b");
  assert.equal(icsEscapeText("a;b"), "a\\;b");
  assert.equal(icsEscapeText("a\nb"), "a\\nb");
  assert.equal(icsEscapeText("a\r\nb"), "a\\nb");
  // Backslash escaped first so a literal comma's own escaping backslash
  // isn't re-escaped.
  assert.equal(icsEscapeText("a\\,b"), "a\\\\\\,b");
});

test("icsEscapeText: combination of all special characters", () => {
  assert.equal(icsEscapeText("Bring: spikes, water; snacks\nThanks!"), "Bring: spikes\\, water\\; snacks\\nThanks!");
});

// ── CRLF ──────────────────────────────────────────────────────────────────

test("buildIcsCalendar: uses CRLF line endings throughout", () => {
  const ics = buildIcsCalendar([ev({})], "Test Team");
  assert.ok(ics.includes("\r\n"));
  assert.ok(!/[^\r]\n/.test(ics), "found a bare LF not preceded by CR");
});

test("buildIcsCalendar: wraps events in BEGIN:VCALENDAR/END:VCALENDAR", () => {
  const ics = buildIcsCalendar([], "Test Team");
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(ics.trim().endsWith("END:VCALENDAR"));
  assert.ok(ics.includes("METHOD:PUBLISH"));
});

// ── 75-octet folding ─────────────────────────────────────────────────────

test("foldIcsLine: short line is not folded", () => {
  assert.equal(foldIcsLine("SUMMARY:Practice"), "SUMMARY:Practice");
});

test("foldIcsLine: long ASCII line folds at 75 octets with a leading-space continuation", () => {
  const long = "DESCRIPTION:" + "a".repeat(100);
  const folded = foldIcsLine(long);
  const segments = folded.split("\r\n");
  assert.ok(segments.length > 1);
  assert.equal(Buffer.byteLength(segments[0], "utf8"), 75);
  for (let i = 1; i < segments.length; i++) {
    assert.ok(segments[i].startsWith(" "), "continuation line must start with a single space");
  }
});

test("foldIcsLine: never splits a multibyte UTF-8 character across a fold boundary", () => {
  // Accented + emoji characters are 2-4 bytes each in UTF-8.
  const long = "LOCATION:" + "café🏃".repeat(20);
  const folded = foldIcsLine(long);
  const rejoined = folded.split("\r\n").map(s => s.replace(/^ /, "")).join("");
  assert.equal(rejoined, long);
  // Every fold boundary must land on a whole character, not mid-sequence —
  // reconstructing byte-for-byte and decoding must not throw or produce
  // replacement characters.
  assert.ok(!rejoined.includes("�"));
});

// ── Stable UID ────────────────────────────────────────────────────────────

test("buildVEvent: UID is stable and derived from the event id", () => {
  const lines = buildVEvent(ev({ id: "abc-123" }));
  assert.ok(lines.some(l => l === "UID:abc-123@elitelevelfundraising.com"));
});

test("buildVEvent: editing other fields keeps the same UID (same id)", () => {
  const original = buildVEvent(ev({ id: "abc-123", title: "Original Title" }));
  const edited   = buildVEvent(ev({ id: "abc-123", title: "Edited Title" }));
  const uidOf = (lines: string[]) => lines.find(l => l.startsWith("UID:"));
  assert.equal(uidOf(original), uidOf(edited));
});

// ── Structured start/end ────────────────────────────────────────────────

test("buildVEvent: structured start+end converts Arizona wall-clock to UTC (+7h, no DST)", () => {
  const lines = buildVEvent(ev({ event_date: "2026-08-15", start_time: "08:00:00", end_time: "10:30:00" }));
  assert.ok(lines.includes("DTSTART:20260815T150000Z"));
  assert.ok(lines.includes("DTEND:20260815T173000Z"));
});

test("buildVEvent: start-only defaults to a one-hour duration in the export only", () => {
  const lines = buildVEvent(ev({ event_date: "2026-08-15", start_time: "14:00:00", end_time: null }));
  assert.ok(lines.includes("DTSTART:20260815T210000Z"));
  assert.ok(lines.includes("DTEND:20260815T220000Z"));
});

test("buildVEvent: a late-evening Arizona start correctly rolls the UTC date forward", () => {
  // 6:00 PM Arizona = 01:00 UTC the *next* calendar day.
  const lines = buildVEvent(ev({ event_date: "2026-08-15", start_time: "18:00:00", end_time: null }));
  assert.ok(lines.includes("DTSTART:20260816T010000Z"));
});

// ── Legacy (no structured time) ─────────────────────────────────────────

test("buildVEvent: legacy event (no start_time) exports as all-day with legacy time in DESCRIPTION", () => {
  const lines = buildVEvent(ev({
    event_date: "2026-08-15", start_time: null, end_time: null,
    event_time: "Meet at the track, 7pm", description: null,
  }));
  assert.ok(lines.includes("DTSTART;VALUE=DATE:20260815"));
  assert.ok(lines.includes("DTEND;VALUE=DATE:20260816"));
  assert.ok(lines.some(l => l === "DESCRIPTION:Time: Meet at the track\\, 7pm"));
  // SUMMARY carries only the plain title, never the legacy time text.
  assert.ok(lines.some(l => l.startsWith("SUMMARY:") && !l.includes("7pm")));
});

test("buildVEvent: legacy event never attempts to parse event_time into a real time", () => {
  const lines = buildVEvent(ev({ start_time: null, event_time: "TBD - check with coach" }));
  assert.ok(lines.includes("DTSTART;VALUE=DATE:20260815"));
  assert.ok(lines.some(l => l.includes("TBD - check with coach")));
});

test("buildVEvent: legacy event with both a description and legacy time includes both", () => {
  const lines = buildVEvent(ev({
    start_time: null, event_time: "7:00 PM", description: "Bring spikes.",
  }));
  const desc = lines.find(l => l.startsWith("DESCRIPTION:"));
  assert.ok(desc?.includes("Bring spikes."));
  assert.ok(desc?.includes("Time: 7:00 PM"));
});

// ── No-time event ────────────────────────────────────────────────────────

test("buildVEvent: no time at all (empty legacy event_time, no start_time) is all-day with no Time: line", () => {
  const lines = buildVEvent(ev({ start_time: null, event_time: "", description: null }));
  assert.ok(lines.includes("DTSTART;VALUE=DATE:20260815"));
  assert.ok(!lines.some(l => l.startsWith("DESCRIPTION:")), "no DESCRIPTION property when there is nothing to say");
});

// ── Year boundary / leap year ────────────────────────────────────────────

test("buildVEvent: Dec 31 -> Jan 1 all-day DTEND crosses the year boundary correctly", () => {
  const lines = buildVEvent(ev({ event_date: "2026-12-31", start_time: null }));
  assert.ok(lines.includes("DTSTART;VALUE=DATE:20261231"));
  assert.ok(lines.includes("DTEND;VALUE=DATE:20270101"));
});

test("buildVEvent: Feb 29 leap-year all-day DTEND rolls to Mar 1", () => {
  const lines = buildVEvent(ev({ event_date: "2028-02-29", start_time: null }));
  assert.ok(lines.includes("DTSTART;VALUE=DATE:20280229"));
  assert.ok(lines.includes("DTEND;VALUE=DATE:20280301"));
});

test("buildVEvent: Dec 31 structured event converts to UTC without corrupting the year", () => {
  const lines = buildVEvent(ev({ event_date: "2026-12-31", start_time: "20:00:00", end_time: null }));
  assert.ok(lines.includes("DTSTART:20270101T030000Z"));
});

// ── DESCRIPTION / LOCATION ───────────────────────────────────────────────

test("buildVEvent: structured event includes DESCRIPTION and LOCATION when present, escaped", () => {
  const lines = buildVEvent(ev({
    start_time: "09:00:00", description: "Meet, warm up; then go.", location: "Field House, Gate 2",
  }));
  assert.ok(lines.some(l => l === "DESCRIPTION:Meet\\, warm up\\; then go."));
  assert.ok(lines.some(l => l === "LOCATION:Field House\\, Gate 2"));
});

test("buildVEvent: omits LOCATION property entirely when location is empty", () => {
  const lines = buildVEvent(ev({ location: "" }));
  assert.ok(!lines.some(l => l.startsWith("LOCATION:")));
});

// ── Deletion via full-feed omission ─────────────────────────────────────

test("buildIcsCalendar: a removed event's UID is simply absent from the next feed (no CANCELLED VEVENT needed)", () => {
  const before = buildIcsCalendar([ev({ id: "keep-me" }), ev({ id: "delete-me" })], "Test Team");
  assert.ok(before.includes("UID:keep-me@elitelevelfundraising.com"));
  assert.ok(before.includes("UID:delete-me@elitelevelfundraising.com"));

  const after = buildIcsCalendar([ev({ id: "keep-me" })], "Test Team");
  assert.ok(after.includes("UID:keep-me@elitelevelfundraising.com"));
  assert.ok(!after.includes("UID:delete-me@elitelevelfundraising.com"));
});
