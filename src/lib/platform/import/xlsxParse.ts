// XLSX parsing for roster import — reads displayed/cached cell values only.
//
// Uses exceljs purely as a structured reader: workbook.xlsx.load(buffer)
// parses the zip/XML container and exposes each cell's stored value. It does
// not run a formula engine — a formula cell's `.value` comes back as
// `{ formula, result }`, where `result` is whatever Excel last cached when
// the file was saved. We read that cached result and nothing else; we never
// recompute a formula ourselves. Macros (VBA) are not parsed or executed —
// exceljs ignores the vbaProject part entirely.
import ExcelJS from "exceljs";

export type ParsedWorksheet = {
  worksheetName: string;
  rows: string[][];
};

function cellToString(value: ExcelJS.CellValue): string {
  if (value == null) return "";

  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);

  // Rich text: { richText: [{ text, font? }, ...] }
  if (typeof value === "object" && "richText" in value && Array.isArray(value.richText)) {
    return value.richText.map(r => r.text).join("").trim();
  }

  // Hyperlink: { text, hyperlink }
  if (typeof value === "object" && "text" in value && typeof (value as { text: unknown }).text !== "undefined") {
    const text = (value as { text: unknown }).text;
    return typeof text === "string" ? text.trim() : cellToString(text as ExcelJS.CellValue);
  }

  // Formula cell: { formula, result } — never evaluated here, only the
  // cached `result` Excel already computed and saved is used.
  if (typeof value === "object" && "formula" in value) {
    const result = (value as { result?: unknown }).result;
    if (result == null) return "";
    if (result instanceof Date) return result.toISOString().slice(0, 10);
    if (typeof result === "object") return ""; // e.g. a formula error object — leave blank, never guess
    return String(result).trim();
  }

  // Formula error cell shape: { error: "#DIV/0!" } — leave blank.
  if (typeof value === "object" && "error" in value) return "";

  return "";
}

function rowToStrings(row: ExcelJS.Row, columnCount: number): string[] {
  const out: string[] = [];
  for (let c = 1; c <= columnCount; c++) {
    out.push(cellToString(row.getCell(c).value));
  }
  return out;
}

function isEmptyRow(row: string[]): boolean {
  return row.every(v => v.trim() === "");
}

// Deterministic worksheet selection: the first worksheet (in workbook order)
// containing at least one non-empty row beyond its header row. Falls back to
// the first worksheet in the file if none qualify, so the caller still gets
// a definite (if empty) result rather than an ambiguous "no worksheet found."
export async function parseXlsx(buffer: Buffer): Promise<ParsedWorksheet> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  const worksheets = workbook.worksheets;
  if (worksheets.length === 0) return { worksheetName: "", rows: [] };

  let chosen = worksheets[0];
  for (const ws of worksheets) {
    const columnCount = ws.actualColumnCount || ws.columnCount;
    let nonEmptyRows = 0;
    ws.eachRow(row => {
      if (!isEmptyRow(rowToStrings(row, columnCount))) nonEmptyRows++;
    });
    if (nonEmptyRows > 1) { chosen = ws; break; }
  }

  const columnCount = chosen.actualColumnCount || chosen.columnCount;
  const rows: string[][] = [];
  chosen.eachRow(row => {
    const values = rowToStrings(row, columnCount);
    if (!isEmptyRow(values)) rows.push(values);
  });

  return { worksheetName: chosen.name, rows };
}
