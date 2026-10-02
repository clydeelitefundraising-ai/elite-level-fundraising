// Deterministic, dependency-free CSV parser for roster import.
//
// Handles the RFC4180 cases the admin instructions called out explicitly:
// quoted fields, commas/newlines inside quotes, doubled-quote escaping,
// CRLF and bare-LF line endings, and empty/short rows. Never evaluates
// anything in the file — this is a pure character-by-character scan.

export function parseCsv(text: string): string[][] {
  // Strip a UTF-8 BOM if present (common from Excel-exported CSVs).
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  function endField() {
    row.push(field);
    field = "";
  }
  function endRow() {
    endField();
    rows.push(row);
    row = [];
  }

  while (i < n) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }

    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { endField(); i++; continue; }
    if (c === '\r') {
      // Treat CRLF as one row break; a lone CR (old Mac) also ends the row.
      if (text[i + 1] === '\n') i++;
      endRow();
      i++;
      continue;
    }
    if (c === '\n') { endRow(); i++; continue; }

    field += c;
    i++;
  }

  // Final field/row if the file doesn't end with a newline.
  if (field.length > 0 || row.length > 0) endRow();

  // Drop fully-empty trailing rows (e.g. a trailing blank line).
  while (rows.length > 0 && rows[rows.length - 1].every(v => v.trim() === "")) {
    rows.pop();
  }

  return rows;
}
