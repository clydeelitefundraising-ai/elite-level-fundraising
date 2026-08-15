// Phase 4B: targeted tests for the pure calendar-grid/date logic shared by
// Month view and Agenda. Run with `npm test` (Node's built-in test runner,
// node:test — no new dependency). No network/DB/React involved: everything
// under test here is a pure function operating on plain dates/strings.
import test from "node:test";
import assert from "node:assert/strict";
import {
  arizonaDateISO,
  daysInMonth,
  buildMonthGrid,
  addMonths,
  monthKeyFromISO,
  formatMonthYear,
  isoFromParts,
  displayEventTime,
  formatTimeOfDay,
  groupEventsByDate,
} from "./calendarShared.ts";

// ── daysInMonth: 28/29/30/31-day months, leap years ────────────────────────

test("daysInMonth: 31-day month (January)", () => {
  assert.equal(daysInMonth(2026, 1), 31);
});

test("daysInMonth: 30-day month (April)", () => {
  assert.equal(daysInMonth(2026, 4), 30);
});

test("daysInMonth: February, non-leap year", () => {
  assert.equal(daysInMonth(2026, 2), 28);
});

test("daysInMonth: February, leap year (2028)", () => {
  assert.equal(daysInMonth(2028, 2), 29);
});

test("daysInMonth: February, century non-leap year (2100)", () => {
  assert.equal(daysInMonth(2100, 2), 28);
});

test("daysInMonth: February, century leap year (2000)", () => {
  assert.equal(daysInMonth(2000, 2), 29);
});

// ── buildMonthGrid: leading/trailing days, complete weeks ──────────────────

test("buildMonthGrid: month beginning on Sunday has zero leading days", () => {
  // Feb 2026 starts on a Sunday.
  const cells = buildMonthGrid({ year: 2026, month: 2 });
  assert.equal(cells[0].iso, "2026-02-01");
  assert.equal(cells[0].inCurrentMonth, true);
  assert.equal(cells.length % 7, 0);
});

test("buildMonthGrid: month beginning on Saturday has six leading days", () => {
  // August 2026 starts on a Saturday.
  const cells = buildMonthGrid({ year: 2026, month: 8 });
  const firstOfMonthIdx = cells.findIndex(c => c.iso === "2026-08-01");
  assert.equal(firstOfMonthIdx, 6);
  for (let i = 0; i < 6; i++) assert.equal(cells[i].inCurrentMonth, false);
  assert.equal(cells.length % 7, 0);
});

test("buildMonthGrid: always returns complete weeks (28/35/42 cells)", () => {
  for (let month = 1; month <= 12; month++) {
    const cells = buildMonthGrid({ year: 2026, month });
    assert.ok([28, 35, 42].includes(cells.length), `month ${month} produced ${cells.length} cells`);
  }
});

test("buildMonthGrid: every current-month day appears exactly once", () => {
  const cells = buildMonthGrid({ year: 2026, month: 8 });
  const inMonth = cells.filter(c => c.inCurrentMonth).map(c => c.iso);
  assert.equal(inMonth.length, 31);
  assert.equal(new Set(inMonth).size, 31);
  assert.equal(inMonth[0], "2026-08-01");
  assert.equal(inMonth[30], "2026-08-31");
});

test("buildMonthGrid: leap-year February grid contains Feb 29", () => {
  const cells = buildMonthGrid({ year: 2028, month: 2 });
  assert.ok(cells.some(c => c.iso === "2028-02-29" && c.inCurrentMonth));
});

// ── addMonths: year boundaries, forward and backward ────────────────────────

test("addMonths: December -> January rolls the year forward", () => {
  assert.deepEqual(addMonths({ year: 2026, month: 12 }, 1), { year: 2027, month: 1 });
});

test("addMonths: January -> December rolls the year backward", () => {
  assert.deepEqual(addMonths({ year: 2026, month: 1 }, -1), { year: 2025, month: 12 });
});

test("addMonths: mid-year forward step stays within the year", () => {
  assert.deepEqual(addMonths({ year: 2026, month: 6 }, 1), { year: 2026, month: 7 });
});

test("addMonths: mid-year backward step stays within the year", () => {
  assert.deepEqual(addMonths({ year: 2026, month: 6 }, -1), { year: 2026, month: 5 });
});

// ── monthKeyFromISO / formatMonthYear ───────────────────────────────────────

test("monthKeyFromISO extracts year/month from an event date", () => {
  assert.deepEqual(monthKeyFromISO("2026-08-23"), { year: 2026, month: 8 });
});

test("formatMonthYear renders a human label", () => {
  assert.equal(formatMonthYear({ year: 2026, month: 8 }), "August 2026");
});

test("isoFromParts pads single-digit month/day", () => {
  assert.equal(isoFromParts(2026, 3, 5), "2026-03-05");
});

// ── Arizona "today" / UTC rollover boundary (re-verifies Phase 4A guarantee) ─

test("arizonaDateISO does not shift near UTC midnight (protects against UTC-slice bugs)", () => {
  // 2026-08-23T06:59:00Z is 2026-08-22 23:59 in Arizona (UTC-7, no DST) —
  // one minute before the Arizona date rolls over. A UTC-slicing bug
  // (e.g. `new Date().toISOString().slice(0,10)`) would incorrectly read
  // this as 2026-08-23.
  assert.equal(arizonaDateISO(new Date("2026-08-23T06:59:00Z")), "2026-08-22");
  // One minute later, Arizona has rolled over to the 23rd.
  assert.equal(arizonaDateISO(new Date("2026-08-23T07:00:00Z")), "2026-08-23");
});

// ── event date/time display (structured vs legacy) ──────────────────────────

test("displayEventTime prefers structured start/end time", () => {
  assert.equal(
    displayEventTime({ event_time: "legacy text", start_time: "14:00:00", end_time: "16:30:00" }),
    "2:00 PM – 4:30 PM",
  );
});

test("displayEventTime falls back to legacy event_time when no start_time", () => {
  assert.equal(
    displayEventTime({ event_time: "Meet at the field", start_time: null, end_time: null }),
    "Meet at the field",
  );
});

test("displayEventTime with structured start but no end shows a single time", () => {
  assert.equal(
    displayEventTime({ event_time: "", start_time: "08:00:00", end_time: null }),
    "8:00 AM",
  );
});

test("formatTimeOfDay handles midnight and noon boundaries", () => {
  assert.equal(formatTimeOfDay("00:00:00"), "12:00 AM");
  assert.equal(formatTimeOfDay("12:00:00"), "12:00 PM");
});

// ── groupEventsByDate: shared by Agenda and Month view ──────────────────────

test("groupEventsByDate: multiple events on the same date are grouped together, in order", () => {
  const groups = groupEventsByDate([
    { event_date: "2026-08-23", title: "Practice" },
    { event_date: "2026-08-24", title: "Meet" },
    { event_date: "2026-08-23", title: "Team Dinner" },
  ]);
  assert.equal(groups.size, 2);
  assert.deepEqual(groups.get("2026-08-23")!.map(e => e.title), ["Practice", "Team Dinner"]);
  assert.deepEqual(groups.get("2026-08-24")!.map(e => e.title), ["Meet"]);
});

test("groupEventsByDate: a date with zero events is simply absent from the map", () => {
  const groups = groupEventsByDate([{ event_date: "2026-08-23", title: "Practice" }]);
  assert.equal(groups.get("2026-08-24"), undefined);
  assert.deepEqual(groups.get("2026-08-24") ?? [], []);
});
