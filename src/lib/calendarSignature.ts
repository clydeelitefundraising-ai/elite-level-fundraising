import { createHash } from "crypto";

// TeamRealtimeSync polling replacement — calendar_events has no
// updated_at column (see phase_4a_calendar_events.sql's schema-history-gap
// note), so a naive count+latest(created_at) signal — sufficient for
// announcements — would silently miss an EDIT to an existing event (its
// created_at never changes). Instead this derives a deterministic content
// signature: canonicalize the exact fields that affect what the calendar
// actually renders for each row, in a stable id-sorted order (independent
// of whatever order Postgres happens to return), concatenate, and hash.
// Any create, delete, OR field edit changes the hash; an idle poll that
// finds the same rows with the same values does not. Only the resulting
// hash + row count ever leave this module — never row content.
//
// Kept in its own file (no "@/..." aliased imports) rather than inside
// teamData.ts so it's importable by a plain `node --test` file — teamData.ts
// itself imports "@/lib/..." modules that Node's unconfigured ESM resolver
// (this repo's `npm test` has no path-alias loader) can't resolve.
export type CalendarSignatureRow = {
  id: string;
  title: string;
  event_date: string;
  event_time: string;
  start_time: string | null;
  end_time: string | null;
  location: string;
  type: string;
  description: string | null;
};

export function computeCalendarSignature(rows: CalendarSignatureRow[]): string {
  // "|" between fields, "~" between rows — plain empty-string joins would
  // let e.g. title="AB"+event_date="C" hash identically to title="A"+
  // event_date="BC". A change-detection signal, not a security boundary,
  // but no reason to accept avoidable collisions.
  const canonical = [...rows]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(r => [
      r.id,
      r.title,
      r.event_date,
      r.event_time,
      r.start_time ?? "",
      r.end_time ?? "",
      r.location,
      r.type,
      r.description ?? "",
    ].join("|"))
    .join("~");
  return createHash("sha256").update(canonical).digest("hex");
}
