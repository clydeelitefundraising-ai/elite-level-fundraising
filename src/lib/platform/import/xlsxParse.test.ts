import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { parseXlsx } from "./xlsxParse.ts";
import { mapHeaders, buildCandidates } from "./rosterCandidates.ts";

async function workbookBuffer(build: (wb: ExcelJS.Workbook) => void): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  build(wb);
  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

test("parseXlsx: reads a representative roster worksheet", async () => {
  const buf = await workbookBuffer(wb => {
    const ws = wb.addWorksheet("Roster");
    ws.addRow(["Name", "Class", "Event"]);
    ws.addRow(["Mason Brooks", "Freshman", "Sprints"]);
    ws.addRow(["Abby Cooper", "Junior", "Relay"]);
  });
  const result = await parseXlsx(buf);
  assert.equal(result.worksheetName, "Roster");
  assert.deepEqual(result.rows, [
    ["Name", "Class", "Event"],
    ["Mason Brooks", "Freshman", "Sprints"],
    ["Abby Cooper", "Junior", "Relay"],
  ]);
});

test("parseXlsx: completely empty rows are ignored", async () => {
  const buf = await workbookBuffer(wb => {
    const ws = wb.addWorksheet("Roster");
    ws.addRow(["Name", "Class"]);
    ws.addRow(["Mason Brooks", "Freshman"]);
    ws.addRow([]); // fully blank
    ws.addRow(["", ""]); // blank cells, not truly absent
    ws.addRow(["Abby Cooper", "Junior"]);
  });
  const result = await parseXlsx(buf);
  assert.deepEqual(result.rows, [
    ["Name", "Class"],
    ["Mason Brooks", "Freshman"],
    ["Abby Cooper", "Junior"],
  ]);
});

test("parseXlsx: numeric and boolean cell values are read as strings", async () => {
  const buf = await workbookBuffer(wb => {
    const ws = wb.addWorksheet("Roster");
    ws.addRow(["Name", "Grade", "Active"]);
    ws.addRow(["Mason Brooks", 9, true]);
  });
  const result = await parseXlsx(buf);
  assert.deepEqual(result.rows[1], ["Mason Brooks", "9", "true"]);
});

test("parseXlsx: a formula cell's cached result is read — the formula itself is never evaluated", async () => {
  const buf = await workbookBuffer(wb => {
    const ws = wb.addWorksheet("Roster");
    ws.addRow(["Name", "Computed"]);
    const row = ws.addRow(["Mason Brooks", null]);
    // exceljs lets a formula cell be written with its cached result directly —
    // this simulates what a real saved workbook contains. Our parser must
    // read `result` as-is; it has no formula engine to recompute `A1+A2`.
    row.getCell(2).value = { formula: "A1+A2", result: 42 } as unknown as ExcelJS.CellValue;
  });
  const result = await parseXlsx(buf);
  assert.equal(result.rows[1][1], "42");
});

test("parseXlsx: a formula cell with no cached result yields a blank, not a guess", async () => {
  const buf = await workbookBuffer(wb => {
    const ws = wb.addWorksheet("Roster");
    ws.addRow(["Name", "Computed"]);
    const row = ws.addRow(["Mason Brooks", null]);
    row.getCell(2).value = { formula: "A1+A2" } as unknown as ExcelJS.CellValue;
  });
  const result = await parseXlsx(buf);
  assert.equal(result.rows[1][1], "");
});

test("parseXlsx: with multiple worksheets, the first one with real data rows is selected deterministically", async () => {
  const buf = await workbookBuffer(wb => {
    const notes = wb.addWorksheet("Notes");
    notes.addRow(["Just a header, no data"]);
    const roster = wb.addWorksheet("Roster");
    roster.addRow(["Name", "Class"]);
    roster.addRow(["Mason Brooks", "Freshman"]);
  });
  const result = await parseXlsx(buf);
  assert.equal(result.worksheetName, "Roster");
});

test("real-world roster shape, XLSX-derived: parseXlsx -> mapHeaders -> buildCandidates end to end", async () => {
  const buf = await workbookBuffer(wb => {
    // Mirrors the production QA roster: sheet named "2026 Roster", headers
    // Gender/Athlete/Event Group/Year/Source.
    const ws = wb.addWorksheet("2026 Roster");
    ws.addRow(["Gender", "Athlete", "Event Group", "Year", "Source"]);
    ws.addRow(["Women", "Nicole Alfred", "Distance", "FR", "https://example.com"]);
    ws.addRow(["Women", "Santia Ali", "Jumps", "FR", "https://example.com"]);
    ws.addRow(["Women", "Camryn Alo", "Throws", "JR", "https://example.com"]);
    ws.addRow(["Women", "Makayla Anderson", "Distance", "RS SO", "https://example.com"]);
  });

  const parsed = await parseXlsx(buf);
  assert.equal(parsed.worksheetName, "2026 Roster");

  const [headerRow, ...dataRows] = parsed.rows;
  const mapping = mapHeaders(headerRow);
  const candidates = buildCandidates(dataRows, mapping);

  assert.equal(candidates.length, 4);
  assert.equal(candidates[0].name, "Nicole Alfred");
  assert.equal(candidates[0].class_year, "Freshman");
  assert.equal(candidates[0].event, "Distance");
  assert.equal(candidates[2].class_year, "Junior");
  assert.equal(candidates[3].class_year, "RS Sophomore");
  assert.equal(candidates[3].status, "needs_review");
});

test("parseXlsx: an empty workbook (no non-empty rows) returns an empty row set for the first sheet", async () => {
  const buf = await workbookBuffer(wb => {
    wb.addWorksheet("Sheet1");
  });
  const result = await parseXlsx(buf);
  assert.deepEqual(result.rows, []);
});
