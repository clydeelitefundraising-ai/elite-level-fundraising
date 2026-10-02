import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv } from "./csvParse.ts";

test("parseCsv: a standard roster with header + rows", () => {
  const csv = "Name,Class,Event\nMason Brooks,Freshman,Sprints\nAbby Cooper,Junior,Relay";
  assert.deepEqual(parseCsv(csv), [
    ["Name", "Class", "Event"],
    ["Mason Brooks", "Freshman", "Sprints"],
    ["Abby Cooper", "Junior", "Relay"],
  ]);
});

test("parseCsv: a quoted field containing a comma is kept as one field", () => {
  const csv = 'Name,Class\n"Cooper, Abby",Junior';
  assert.deepEqual(parseCsv(csv), [
    ["Name", "Class"],
    ["Cooper, Abby", "Junior"],
  ]);
});

test("parseCsv: a doubled quote inside a quoted field unescapes to one quote", () => {
  const csv = 'Name,Class\n"Liam ""The Rocket"" Foster",Senior';
  assert.deepEqual(parseCsv(csv)[1], ['Liam "The Rocket" Foster', "Senior"]);
});

test("parseCsv: handles CRLF line endings", () => {
  const csv = "Name,Class\r\nMason Brooks,Freshman\r\nAbby Cooper,Junior\r\n";
  assert.deepEqual(parseCsv(csv), [
    ["Name", "Class"],
    ["Mason Brooks", "Freshman"],
    ["Abby Cooper", "Junior"],
  ]);
});

test("parseCsv: handles bare LF line endings", () => {
  const csv = "Name,Class\nMason Brooks,Freshman\nAbby Cooper,Junior";
  assert.equal(parseCsv(csv).length, 3);
});

test("parseCsv: an empty optional cell (trailing comma) becomes an empty string, not dropped", () => {
  const csv = "Name,Class,Event\nMason Brooks,Freshman,";
  assert.deepEqual(parseCsv(csv)[1], ["Mason Brooks", "Freshman", ""]);
});

test("parseCsv: a comma-containing quoted field followed by an embedded newline stays one field", () => {
  const csv = 'Name,Note\nMason Brooks,"Line one\nLine two"';
  assert.deepEqual(parseCsv(csv)[1], ["Mason Brooks", "Line one\nLine two"]);
});

test("parseCsv: strips a leading UTF-8 BOM", () => {
  const csv = "﻿Name,Class\nMason Brooks,Freshman";
  assert.deepEqual(parseCsv(csv)[0], ["Name", "Class"]);
});

test("parseCsv: drops a trailing fully-blank line", () => {
  const csv = "Name,Class\nMason Brooks,Freshman\n\n";
  assert.equal(parseCsv(csv).length, 2);
});

test("parseCsv: never does a naive split(',') — a quoted comma would otherwise misalign columns", () => {
  const csv = 'Name,Class,Event\n"Smith, John",Senior,Discus';
  const rows = parseCsv(csv);
  assert.equal(rows[1].length, 3);
  assert.equal(rows[1][0], "Smith, John");
  assert.equal(rows[1][2], "Discus");
});
