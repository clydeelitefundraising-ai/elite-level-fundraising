// Attendance Reports — PDF export (pdf-lib, standard Helvetica; no fonts
// or images fetched). Built from the same AttendanceReport as the screen
// and the CSV. US Letter portrait: title block (team, sport, season, date
// range), summary statistics, the percentage definition, then the athlete
// table — its header repeated on every page — then Absence Details (every
// saved absence date and reason, per athlete) and "Page X of Y" footers.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  ABSENCE_LABELS,
  NO_ABSENCES_TEXT,
  PERCENT_DEFINITION,
  formatPercent,
  formatReportDate,
  type AttendanceReport,
  type Counts,
} from "./attendanceReport.ts";

export type ReportPdfMeta = {
  schoolName: string;
  sportName: string;
  season: string;
  /** The athlete filter's name, when the report is for one athlete. */
  athleteName: string | null;
  /** YYYY-MM-DD, the team's local date the report was made. */
  generatedOn: string;
};

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 40;
const NAVY = rgb(11 / 255, 30 / 255, 61 / 255);
const MUTED = rgb(0.42, 0.45, 0.5);
const RULE = rgb(0.88, 0.89, 0.91);
const STRIPE = rgb(0.965, 0.97, 0.975);

type Column = { label: string; width: number; align: "left" | "right"; value: (c: Counts & { name?: string; classYear?: string | null }) => string };

const COLUMNS: Column[] = [
  { label: "Athlete", width: 140, align: "left", value: c => c.name ?? "" },
  { label: "Grade", width: 62, align: "left", value: c => c.classYear ?? "" },
  { label: "Present", width: 44, align: "right", value: c => String(c.present) },
  { label: "Absent", width: 42, align: "right", value: c => String(c.absent) },
  { label: "Excused", width: 46, align: "right", value: c => String(c.excused) },
  { label: "Unexcused", width: 56, align: "right", value: c => String(c.unexcused) },
  { label: "Other", width: 36, align: "right", value: c => String(c.other) },
  { label: "Unmarked", width: 52, align: "right", value: c => String(c.unmarked) },
  { label: "Attend. %", width: 54, align: "right", value: c => formatPercent(c.percent) },
];

/** Text the standard font can draw: unsupported characters are reduced to
 *  their base letter (é stays, ł → l where possible) or "?". */
export function pdfSafeText(text: string, font: PDFFont): string {
  const supported = new Set(font.getCharacterSet());
  let out = "";
  for (const ch of text.replace(/[\r\n\t]+/g, " ")) {
    const cp = ch.codePointAt(0)!;
    if (supported.has(cp)) { out += ch; continue; }
    const base = ch.normalize("NFKD").replace(/[̀-ͯ]/g, "");
    out += [...base].every(b => supported.has(b.codePointAt(0)!)) && base ? base : "?";
  }
  return out;
}

function fit(text: string, font: PDFFont, size: number, width: number): string {
  if (font.widthOfTextAtSize(text, size) <= width) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, size) > width) t = t.slice(0, -1);
  return `${t.trimEnd()}...`;
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
}

export async function buildAttendancePdf(report: AttendanceReport, meta: ReportPdfMeta): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const safe = (t: string) => pdfSafeText(t, regular);
  const team = [meta.schoolName, meta.sportName].map(s => s.trim()).filter(Boolean).join(" ") || "Team";
  doc.setTitle(safe(`${team} – Attendance Report`));
  doc.setProducer("Elite Level Fundraising");
  doc.setCreator("ELF Team App");

  const pages: PDFPage[] = [];
  const newPage = () => { const p = doc.addPage([PAGE_W, PAGE_H]); pages.push(p); return p; };
  let page = newPage();
  let y = PAGE_H - MARGIN;
  const contentW = PAGE_W - MARGIN * 2;

  // ── Title block ──
  page.drawText(safe("ATTENDANCE REPORT"), { x: MARGIN, y: y - 9, size: 9, font: bold, color: MUTED });
  y -= 30;
  page.drawText(fit(safe(team), bold, 20, contentW), { x: MARGIN, y, size: 20, font: bold, color: NAVY });
  y -= 18;
  const sub = [meta.season ? `Season: ${meta.season}` : null, `${longDate(report.filters.from)} – ${longDate(report.filters.to)}`]
    .filter(Boolean).join("   |   ");
  page.drawText(fit(safe(sub), regular, 10.5, contentW), { x: MARGIN, y, size: 10.5, font: regular, color: NAVY });
  y -= 15;
  const scope = meta.athleteName ? `Athlete: ${meta.athleteName}` : "All athletes";
  page.drawText(fit(safe(`${scope}   |   Generated ${longDate(meta.generatedOn)}`), regular, 9, contentW), { x: MARGIN, y, size: 9, font: regular, color: MUTED });
  y -= 22;

  // ── Summary statistics ──
  const t = report.totals;
  const stats: [string, string][] = [
    ["Attendance", formatPercent(t.percent)],
    ["Athletes", String(report.athleteCount)],
    ["Sessions", String(report.sessionCount)],
    ["Present", String(t.present)],
    ["Absent", String(t.absent)],
    ["Excused", String(t.excused)],
    ["Unexcused", String(t.unexcused)],
    ["Other", String(t.other)],
    ["Unmarked", String(t.unmarked)],
  ];
  const boxW = (contentW - 8 * 6) / 9;
  stats.forEach(([label, value], i) => {
    const x = MARGIN + i * (boxW + 6);
    page.drawRectangle({ x, y: y - 42, width: boxW, height: 42, color: STRIPE, borderColor: RULE, borderWidth: 0.75 });
    page.drawText(fit(value, bold, 13, boxW - 8), { x: x + 5, y: y - 20, size: 13, font: bold, color: NAVY });
    page.drawText(fit(label, regular, 6.8, boxW - 8), { x: x + 5, y: y - 34, size: 6.8, font: regular, color: MUTED });
  });
  y -= 56;

  for (const line of wrap(safe(PERCENT_DEFINITION), regular, 8, contentW)) {
    page.drawText(line, { x: MARGIN, y, size: 8, font: regular, color: MUTED });
    y -= 10.5;
  }
  if (report.removedRecords > 0) {
    const note = `${report.removedRecords} saved record${report.removedRecords === 1 ? "" : "s"} for athletes no longer on the roster ${report.removedRecords === 1 ? "is" : "are"} not included.`;
    page.drawText(safe(note), { x: MARGIN, y, size: 8, font: regular, color: MUTED });
    y -= 10.5;
  }
  y -= 10;

  // ── Athlete table ──
  const ROW_H = 17;
  const tableW = COLUMNS.reduce((s, c) => s + c.width, 0);
  const drawHeader = () => {
    page.drawRectangle({ x: MARGIN, y: y - ROW_H, width: tableW, height: ROW_H, color: NAVY });
    let x = MARGIN;
    for (const col of COLUMNS) {
      const w = bold.widthOfTextAtSize(col.label, 8);
      page.drawText(col.label, { x: col.align === "right" ? x + col.width - 5 - w : x + 5, y: y - 11.5, size: 8, font: bold, color: rgb(1, 1, 1) });
      x += col.width;
    }
    y -= ROW_H;
  };
  const drawRow = (values: Counts & { name?: string; classYear?: string | null }, i: number, strong = false) => {
    if (y - ROW_H < MARGIN + 24) { page = newPage(); y = PAGE_H - MARGIN; drawHeader(); }
    if (i % 2 === 1) page.drawRectangle({ x: MARGIN, y: y - ROW_H, width: tableW, height: ROW_H, color: STRIPE });
    const font = strong ? bold : regular;
    let x = MARGIN;
    for (const col of COLUMNS) {
      const text = fit(safe(col.value(values)), font, 8.5, col.width - 10);
      const w = font.widthOfTextAtSize(text, 8.5);
      page.drawText(text, { x: col.align === "right" ? x + col.width - 5 - w : x + 5, y: y - 11.5, size: 8.5, font, color: NAVY });
      x += col.width;
    }
    page.drawLine({ start: { x: MARGIN, y: y - ROW_H }, end: { x: MARGIN + tableW, y: y - ROW_H }, thickness: 0.5, color: RULE });
    y -= ROW_H;
  };

  drawHeader();
  if (report.athletes.length === 0) {
    page.drawText("No athletes on the roster.", { x: MARGIN + 5, y: y - 12, size: 9, font: regular, color: MUTED });
    y -= ROW_H;
  }
  report.athletes.forEach((a, i) => drawRow({ ...a }, i));
  if (report.athletes.length > 1) drawRow({ ...t, name: "Team total", classYear: "" }, report.athletes.length, true);

  // ── Absence details: every saved absence, per athlete, newest first ──
  // Same order as the athlete table; the athlete's name on their first
  // row only. Athletes with none aren't listed (stated below the title).
  const ABS_COLS = [
    { label: "Athlete", width: 232 },
    { label: "Date", width: 150 },
    { label: "Reason", width: 150 },
  ];
  const absW = ABS_COLS.reduce((s, c) => s + c.width, 0);
  const withAbsences = report.athletes.filter(a => a.absences.length > 0);
  const drawAbsHeader = () => {
    page.drawRectangle({ x: MARGIN, y: y - ROW_H, width: absW, height: ROW_H, color: NAVY });
    let x = MARGIN;
    for (const col of ABS_COLS) {
      page.drawText(col.label, { x: x + 5, y: y - 11.5, size: 8, font: bold, color: rgb(1, 1, 1) });
      x += col.width;
    }
    y -= ROW_H;
  };
  // Title + note + header + one row must fit, or start a new page.
  if (y - (22 + 12 + ROW_H * 2) < MARGIN + 24) { page = newPage(); y = PAGE_H - MARGIN; } else y -= 22;
  page.drawText("Absence Details", { x: MARGIN, y: y - 12, size: 12, font: bold, color: NAVY });
  y -= 18;
  const absNote = withAbsences.length === 0
    ? NO_ABSENCES_TEXT
    : withAbsences.length < report.athletes.length
      ? `Newest first. Athletes not listed have no recorded absences in this period.`
      : "Newest first.";
  page.drawText(safe(absNote), { x: MARGIN, y: y - 8, size: 8, font: regular, color: MUTED });
  y -= 16;
  if (withAbsences.length > 0) {
    drawAbsHeader();
    let row = 0;
    for (const a of withAbsences) {
      a.absences.forEach((abs, j) => {
        // The name repeats at the top of a new page.
        let showName = j === 0;
        if (y - ROW_H < MARGIN + 24) { page = newPage(); y = PAGE_H - MARGIN; drawAbsHeader(); showName = true; }
        if (row % 2 === 1) page.drawRectangle({ x: MARGIN, y: y - ROW_H, width: absW, height: ROW_H, color: STRIPE });
        const cells = [showName ? a.name : "", formatReportDate(abs.date), ABSENCE_LABELS[abs.reason]];
        let x = MARGIN;
        cells.forEach((text, k) => {
          const font = k === 0 ? bold : regular;
          page.drawText(fit(safe(text), font, 8.5, ABS_COLS[k].width - 10), { x: x + 5, y: y - 11.5, size: 8.5, font, color: NAVY });
          x += ABS_COLS[k].width;
        });
        page.drawLine({ start: { x: MARGIN, y: y - ROW_H }, end: { x: MARGIN + absW, y: y - ROW_H }, thickness: 0.5, color: RULE });
        y -= ROW_H;
        row++;
      });
    }
  }

  // ── Footers ──
  pages.forEach((p, i) => {
    const label = `Page ${i + 1} of ${pages.length}`;
    p.drawText(label, { x: PAGE_W - MARGIN - regular.widthOfTextAtSize(label, 8), y: MARGIN - 18, size: 8, font: regular, color: MUTED });
    p.drawText(fit(safe(team), regular, 8, contentW - 80), { x: MARGIN, y: MARGIN - 18, size: 8, font: regular, color: MUTED });
  });

  return doc.save();
}
