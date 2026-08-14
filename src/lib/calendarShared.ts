// Phase 4A: single canonical source for Calendar/Event constants and date
// logic, shared by server code (teamData.ts, API routes) and client
// components (CalendarView, HomeView) — no "use client" directive needed
// since everything here is plain JS/Intl, safe in both environments.

// ── Event types ────────────────────────────────────────────────────────────

export type EventType = "practice" | "meet" | "fundraiser" | "team";

export const EVENT_TYPES: EventType[] = ["practice", "meet", "fundraiser", "team"];
export const VALID_EVENT_TYPES = new Set<string>(EVENT_TYPES);

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  practice:   "Practice",
  meet:       "Meet",
  fundraiser: "Fundraiser",
  team:       "Team",
};

export const EVENT_TYPE_STYLE: Record<EventType, { bg: string; color: string; accent: string }> = {
  practice:   { bg: "#dbeafe", color: "#1d4ed8", accent: "#3b82f6" },
  meet:       { bg: "#ede9fe", color: "#6d28d9", accent: "#8b5cf6" },
  fundraiser: { bg: "#fef3c7", color: "#b45309", accent: "#f59e0b" },
  team:       { bg: "#f3f4f6", color: "#374151", accent: "#9ca3af" },
};

export function eventTypeStyle(type: string) {
  return EVENT_TYPE_STYLE[type as EventType] ?? EVENT_TYPE_STYLE.team;
}

// ── Arizona canonical "today" ─────────────────────────────────────────────
//
// ELF currently operates exclusively with Arizona teams, so "today" for
// Calendar/Home purposes is defined as the current calendar date in
// America/Phoenix — independent of the browser's local timezone AND the
// server's runtime timezone (Vercel functions typically run in UTC).
// Arizona does not observe DST (fixed at UTC-7 year-round), so this is a
// safe, deterministic, library-free computation via Intl.DateTimeFormat's
// explicit `timeZone` option: the same instant always produces the same
// Arizona calendar date whether this runs in a browser or on the server.
//
// If ELF later supports campaigns outside Arizona, this should become a
// per-campaign timezone lookup rather than a single hardcoded zone — this
// function is the one place that would need to change.
const ARIZONA_TZ = "America/Phoenix";

export function arizonaDateISO(instant: Date): string {
  // en-CA locale formats as YYYY-MM-DD natively — no manual reassembly.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ARIZONA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

export function arizonaTodayISO(): string {
  return arizonaDateISO(new Date());
}

export function arizonaTomorrowISO(): string {
  return arizonaDateISO(new Date(Date.now() + 86_400_000));
}

// ── Safe local-date parsing for a stored YYYY-MM-DD event date ───────────
//
// This is intentionally NOT timezone-aware — a stored event_date is a
// calendar date, not an instant, so "what weekday is 2026-08-17" has one
// correct answer regardless of viewer timezone. Building a Date via the
// (year, monthIndex, day) constructor and reading it back with the
// runtime's local zone is self-consistent and safe: construction and
// formatting both use the same zone, so no shift occurs.

export function parseIsoDateParts(d: string): { year: number; month: number; day: number } {
  const [year, month, day] = d.split("-").map(Number);
  return { year, month, day };
}

export function localDateFromISO(d: string): Date {
  const { year, month, day } = parseIsoDateParts(d);
  return new Date(year, month - 1, day);
}

export function formatDateHeader(d: string): { dayNum: string; weekday: string; monthYear: string } {
  const { day } = parseIsoDateParts(d);
  const dt = localDateFromISO(d);
  return {
    dayNum:    String(day),
    weekday:   new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(dt),
    monthYear: new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(dt),
  };
}

// Compact label used by Home's Upcoming rows — "Today" / "Tomorrow" /
// "Tue, Aug 18", compared against the Arizona-canonical today/tomorrow.
export function formatDateLabel(d: string): string {
  const today    = arizonaTodayISO();
  const tomorrow = arizonaTomorrowISO();
  if (d === today)    return "Today";
  if (d === tomorrow) return "Tomorrow";
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" })
    .format(localDateFromISO(d));
}

// Full date used by the event-details view — "Monday, August 17, 2026".
export function formatFullDate(d: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    .format(localDateFromISO(d));
}

// ── Time display: structured start/end time preferred, legacy fallback ───
//
// Postgres `time` columns come back over PostgREST as "HH:MM:SS" strings.

export function formatTimeOfDay(t: string): string {
  const [hStr, mStr] = t.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

// Preserves every historical event exactly as it already displays today:
// if no structured start_time was ever set (every pre-Phase-4A row), this
// falls straight through to the legacy free-text event_time value,
// unmodified — including "" for events that never had a time at all.
export function displayEventTime(ev: { event_time: string; start_time?: string | null; end_time?: string | null }): string {
  if (ev.start_time) {
    const start = formatTimeOfDay(ev.start_time);
    return ev.end_time ? `${start} – ${formatTimeOfDay(ev.end_time)}` : start;
  }
  return ev.event_time;
}

// ── Get Directions ─────────────────────────────────────────────────────────
//
// No geocoding, no Maps API/key — a plain Google Maps search URL works as
// a universal deep link (opens the native Maps app on iOS/Android when
// installed, falls back to the web) using the existing free-text location
// string exactly as entered by the coach.
export function directionsUrl(location: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}
