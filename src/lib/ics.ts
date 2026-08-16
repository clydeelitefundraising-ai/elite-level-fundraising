// Phase 4C: RFC 5545 (iCalendar) serialization. Pure, framework-free —
// consumed by both the public subscription feed route and the
// authenticated download route, so the exact same VEVENT logic backs
// "one-time download" and "ongoing subscription."
//
// Locked product decisions (do not change without explicit approval):
//  - start_time set, end_time missing -> default to a 1-hour duration in
//    the *exported* VEVENT only. The stored calendar_events row is never
//    modified to manufacture this duration.
//  - No start_time at all (every pre-Phase-4A row, i.e. "legacy") -> export
//    as an ALL-DAY VEVENT. The legacy free-text event_time is never
//    parsed; it is preserved verbatim in DESCRIPTION. SUMMARY stays the
//    plain event title.
//  - VEVENT URL is intentionally omitted (no login-gated ELF link, no
//    substituted public campaign link).
import type { CalendarEventRow } from "./teamData.ts";
import { parseIsoDateParts } from "./calendarShared.ts";

const CRLF = "\r\n";
const PRODID = "-//Elite Level Fundraising//Team Calendar//EN";

// ── RFC 5545 TEXT escaping ───────────────────────────────────────────────
//
// Backslash, comma, and semicolon are structurally significant in TEXT
// values and must be backslash-escaped; newlines become the literal
// two-character sequence \n. Order matters: backslashes must be escaped
// first, or the escaping backslashes we insert for comma/semicolon/newline
// would themselves get double-escaped.
export function icsEscapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

// ── Line folding (RFC 5545 §3.1) ─────────────────────────────────────────
//
// A content line SHOULD be folded at 75 octets (not characters — UTF-8
// multibyte sequences count by byte), by inserting CRLF followed by a
// single leading space before the 76th octet, repeated as needed. Folding
// must never split a multibyte UTF-8 sequence in half, so this walks the
// UTF-8 byte encoding of each character (1-4 bytes) and only breaks
// between characters, never inside one.
export function foldIcsLine(line: string): string {
  const bytes = Array.from(line).map(ch => Buffer.byteLength(ch, "utf8"));
  let totalBytes = 0;
  for (const b of bytes) totalBytes += b;
  if (totalBytes <= 75) return line;

  const chars = Array.from(line);
  const segments: string[] = [];
  let current = "";
  let currentBytes = 0;
  // Continuation lines carry a leading space that itself counts toward
  // that line's 75-octet budget, so subsequent segments get a 74-octet
  // limit before folding again.
  let limit = 75;

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const chBytes = bytes[i];
    if (currentBytes + chBytes > limit) {
      segments.push(current);
      current = ch;
      currentBytes = chBytes;
      limit = 74;
    } else {
      current += ch;
      currentBytes += chBytes;
    }
  }
  if (current) segments.push(current);

  return segments.join(CRLF + " ");
}

// ── Arizona wall-clock -> UTC instant ────────────────────────────────────
//
// America/Phoenix is fixed at UTC-7 year-round (no DST), so converting an
// Arizona local wall-clock time to UTC is just "+7 hours" — no timezone
// database, no VTIMEZONE block needed. Mirrors the fixed-offset assumption
// already documented in calendarShared.ts's arizonaTodayISO(); revisit
// both together if ELF ever supports non-Arizona campaigns.
const ARIZONA_UTC_OFFSET_HOURS = 7;

function utcFromArizonaWallClock(dateISO: string, time: string): Date {
  const { year, month, day } = parseIsoDateParts(dateISO);
  const [hStr, mStr, sStr] = time.split(":");
  const h = Number(hStr);
  const m = Number(mStr ?? "0");
  const s = Number(sStr ?? "0");
  return new Date(Date.UTC(year, month - 1, day, h + ARIZONA_UTC_OFFSET_HOURS, m, s));
}

function formatUtcStamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function formatAllDayDate(year: number, month: number, day: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}${pad(month)}${pad(day)}`;
}

// Exclusive end date for an all-day VEVENT, per RFC 5545 (DTEND is the
// first day NOT included) — the day after event_date, computed via the
// same self-consistent Date-roundtrip pattern used elsewhere in this repo
// (e.g. daysInMonth in calendarShared.ts), never a UTC-instant shift.
function nextDayISOParts(year: number, month: number, day: number): { year: number; month: number; day: number } {
  const d = new Date(year, month - 1, day + 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

function foldedProp(name: string, value: string, params = ""): string {
  return foldIcsLine(`${name}${params}:${value}`);
}

// ── VEVENT ────────────────────────────────────────────────────────────────

export function buildVEvent(ev: CalendarEventRow): string[] {
  const lines: string[] = ["BEGIN:VEVENT"];
  const uid = `${ev.id}@elitelevelfundraising.com`;
  lines.push(foldedProp("UID", uid));

  if (ev.start_time) {
    const start = utcFromArizonaWallClock(ev.event_date, ev.start_time);
    // Locked decision: start without end defaults to a 1-hour duration in
    // the exported VEVENT only — the underlying row is never touched.
    const end = ev.end_time
      ? utcFromArizonaWallClock(ev.event_date, ev.end_time)
      : new Date(start.getTime() + 60 * 60 * 1000);
    lines.push(foldedProp("DTSTART", formatUtcStamp(start)));
    lines.push(foldedProp("DTEND", formatUtcStamp(end)));
  } else {
    // Legacy event (no structured start_time): all-day, and the legacy
    // free-text event_time is deliberately NOT parsed — it is preserved
    // verbatim in DESCRIPTION instead.
    const { year, month, day } = parseIsoDateParts(ev.event_date);
    const next = nextDayISOParts(year, month, day);
    lines.push(foldedProp("DTSTART", formatAllDayDate(year, month, day), ";VALUE=DATE"));
    lines.push(foldedProp("DTEND", formatAllDayDate(next.year, next.month, next.day), ";VALUE=DATE"));
  }

  lines.push(foldedProp("SUMMARY", icsEscapeText(ev.title)));

  const descriptionParts: string[] = [];
  if (ev.description) descriptionParts.push(ev.description);
  if (!ev.start_time && ev.event_time) descriptionParts.push(`Time: ${ev.event_time}`);
  if (descriptionParts.length > 0) {
    lines.push(foldedProp("DESCRIPTION", icsEscapeText(descriptionParts.join("\n\n"))));
  }

  if (ev.location) lines.push(foldedProp("LOCATION", icsEscapeText(ev.location)));

  lines.push(foldedProp("CATEGORIES", icsEscapeText(ev.type)));
  // DTSTAMP is required by RFC 5545 and is regenerated on every fetch —
  // calendar_events has no updated_at column (deferred to a future
  // phase), so LAST-MODIFIED is intentionally omitted; DTSTAMP alone is
  // spec-compliant.
  lines.push(foldedProp("DTSTAMP", formatUtcStamp(new Date())));
  lines.push("END:VEVENT");
  return lines;
}

// ── VCALENDAR ─────────────────────────────────────────────────────────────
//
// METHOD:PUBLISH + a full republish of every current event on each fetch
// is the standard "read-only subscription" shape: subscribers reconcile
// by UID themselves, so a deleted ELF event simply stops appearing in the
// next feed fetch — no explicit STATUS:CANCELLED VEVENT is required.
export function buildIcsCalendar(events: CalendarEventRow[], calName: string): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    foldedProp("PRODID", PRODID),
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    foldedProp("X-WR-CALNAME", icsEscapeText(calName)),
    "X-WR-TIMEZONE:America/Phoenix",
  ];
  for (const ev of events) lines.push(...buildVEvent(ev));
  lines.push("END:VCALENDAR");
  return lines.join(CRLF) + CRLF;
}
