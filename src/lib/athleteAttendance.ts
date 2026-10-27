// Athlete profile — Attendance section: the pure rules (who may see it,
// how absences are counted, how dates are shown). No I/O, so both profile
// pages, the card and Node's test runner share one definition. The read
// itself is getAthleteAbsences() in teamAttendanceStore.ts.
//
//   Who        Head Coach, Assistant Coach, platform admin (the attendance
//              editors, canEditAttendance), the athlete on their own
//              profile, and a parent linked to that athlete. Boosters are
//              excluded (they keep the rest of the profile). Attendance
//              management access (teamAttendance.ts canViewAttendance /
//              canEditAttendance) is unchanged.
//   What       Absences only, for THIS team season (campaign_slug) and this
//              athlete: the date and its category (Excused / Unexcused /
//              Other). Notes are never read, sent or shown. Currently saved
//              records count, drafts included.
//   Failure    A read that can't be completed or checked is "unavailable" —
//              never shown as zero absences.
import type { TeamActor } from "./permissions.ts";
import { canEditAttendance } from "./teamAttendanceActor.ts";
import { ABSENCE_REASON_LABELS, isAbsenceReason, isIsoDate, type AbsenceReason } from "./teamAttendance.ts";

// ── Access ────────────────────────────────────────────────────────────────

/** Whether this actor sees the Attendance section on athlete `athleteId`'s
 *  profile. `linkedAthleteIds` is the parent's server-computed links
 *  (getLinkedAthleteIdsForMember); ignored for everyone else. Always pass
 *  the TeamActor the server resolved for this team. */
export function canViewAthleteAttendance(actor: TeamActor, athleteId: string, linkedAthleteIds: readonly string[]): boolean {
  if (canEditAttendance(actor)) return true;
  if (actor.kind !== "member" || !athleteId) return false;
  const { role, athlete_id } = actor.session;
  if (role === "athlete") return athlete_id === athleteId;
  if (role === "parent") return athlete_id === athleteId || linkedAthleteIds.includes(athleteId);
  return false;
}

// ── Absences ──────────────────────────────────────────────────────────────

export type AthleteAbsence = { date: string; reason: AbsenceReason };

export type AthleteAbsenceSummary = {
  total: number;
  excused: number;
  unexcused: number;
  other: number;
  /** Newest first. */
  absences: AthleteAbsence[];
};

/** What the profile page hands the card: the summary, or "unavailable". */
export type AthleteAttendanceState = { ok: true; summary: AthleteAbsenceSummary } | { ok: false };

/** Absence rows (session_date + absence_reason) → counts and the newest-
 *  first list. Null when any row is malformed or a date repeats (one
 *  session per team per date means one record per athlete per date) — the
 *  caller then shows "unavailable", never a guess. */
export function summarizeAthleteAbsences(rows: readonly { session_date: unknown; absence_reason: unknown }[]): AthleteAbsenceSummary | null {
  const absences: AthleteAbsence[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row || !isIsoDate(row.session_date) || !isAbsenceReason(row.absence_reason)) return null;
    if (seen.has(row.session_date)) return null;
    seen.add(row.session_date);
    absences.push({ date: row.session_date, reason: row.absence_reason });
  }
  absences.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const count = (reason: AbsenceReason) => absences.filter(a => a.reason === reason).length;
  return { total: absences.length, excused: count("excused"), unexcused: count("unexcused"), other: count("other"), absences };
}

export function absenceReasonLabel(reason: AbsenceReason): string {
  return ABSENCE_REASON_LABELS[reason];
}

/** "2026-10-21" → "Wed, Oct 21, 2026". The stored value is already the
 *  team's local calendar date, so it is formatted as a plain date (UTC
 *  noon) and never shifted by the viewer's time zone. */
export function formatAbsenceDate(date: string): string {
  if (!isIsoDate(date)) return date;
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

/** "0 absences", "1 absence", "3 absences". */
export function absenceCountLabel(total: number): string {
  return `${total} ${total === 1 ? "absence" : "absences"}`;
}
