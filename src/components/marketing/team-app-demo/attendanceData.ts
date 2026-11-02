// Attendance for the isolated Team App demo: fictional saved sessions and an
// in-memory implementation of the app's AttendanceApi (attendanceApi.ts),
// so the REAL attendance editor (attendanceEditor.ts reducer, runSave,
// buildAttendanceDraft/parseRosterRows) runs unchanged against it. Nothing
// is sent anywhere: "saving" replaces this object's data in the demo store.
//
// The rules are the app's own, from lib/teamAttendance.ts and
// lib/teamAttendanceDraft.ts (both client-safe):
//   • today or the previous 14 days are editable; older dates are read-only;
//     future dates can't be taken (attendanceDateEligibility);
//   • saves are validated exactly as the server validates them
//     (parseSaveRequest) — an absence needs a reason, notes are capped;
//   • a stale version is a conflict, like the database's version check;
//   • totals come from computeAttendanceTotals.
// Athletes and parents only ever see the read-only Attendance card on the
// athlete's profile (summarizeAthleteAbsences) — never notes, never edits.

import {
  ATTENDANCE_EDIT_WINDOW_DAYS, attendanceDateEligibility, computeAttendanceTotals, markFromStored,
  type AbsenceReason, type AttendanceStatus,
} from "../../../lib/teamAttendance.ts";
import { parseSaveRequest, type AttendanceSavePayload } from "../../../lib/teamAttendanceDraft.ts";
import { summarizeAthleteAbsences, type AthleteAttendanceState } from "../../../lib/athleteAttendance.ts";
import type {
  AttendanceApi, AttendanceDateView, AttendanceSessionList, AttendanceSessionSummary,
} from "../../../app/team/[slug]/attendance/attendanceApi.ts";
import { DEMO_ROSTER, DEMO_TIME_ZONE, PRACTICE_WEEKDAYS, addDaysISO, demoTodayISO, weekdayISO } from "./demoData.ts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export type DemoAttendanceRecord = {
  recordId: string;
  status: AttendanceStatus;
  absenceReason: AbsenceReason | null;
  note: string | null;
  updatedAt: string;
  updatedByName: string;
};

export type DemoAttendanceSession = {
  date: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdByName: string;
  updatedByName: string;
  records: Record<string, DemoAttendanceRecord>;   // athlete id → record
};

export type DemoAttendanceDb = { sessions: Record<string, DemoAttendanceSession>; seq: number };

const COACH = "Dana Whitfield";

// A believable, fixed pattern of absences, by practice: 0 = the most recent
// practice before today, 1 = the one before that, and so on.
const ABSENCES: { practice: number; athlete: string; reason: AbsenceReason; note?: string }[] = [
  { practice: 0, athlete: "Owen Patel", reason: "excused", note: "Doctor appointment" },
  { practice: 0, athlete: "Elijah Carter", reason: "unexcused" },
  { practice: 1, athlete: "Mason Reyes", reason: "excused", note: "Family event" },
  { practice: 2, athlete: "Jordan Ellis", reason: "excused", note: "Dentist" },
  { practice: 3, athlete: "Isaiah Grant", reason: "other", note: "Left early — rolled ankle" },
  { practice: 4, athlete: "Noah Ramirez", reason: "unexcused" },
  { practice: 5, athlete: "Gabriel Nguyen", reason: "excused", note: "College visit" },
  { practice: 6, athlete: "Elijah Carter", reason: "excused" },
  { practice: 6, athlete: "Jordan Ellis", reason: "unexcused" },
  { practice: 7, athlete: "Lucas Bennett", reason: "excused" },
  { practice: 8, athlete: "Maya Torres", reason: "excused", note: "Band concert" },
];

/** Today's session, already saved by the coach earlier today: eight
 *  present, one excused and one unexcused absence. */
const TODAY_ABSENCES: { athlete: string; reason: AbsenceReason; note?: string }[] = [
  { athlete: "Elijah Carter", reason: "excused", note: "Orthodontist appointment" },
  { athlete: "Noah Ramirez", reason: "unexcused" },
];

/** Saved sessions on practice days from 3 weeks ago through yesterday —
 *  some inside the 14-day window (editable), some older (read-only) —
 *  plus today's session, saved earlier today (still editable, so the
 *  visitor can change it and Save Draft again, or pick another date). */
export function buildDemoAttendanceDb(now: Date): DemoAttendanceDb {
  const today = demoTodayISO(now);
  const sessions: Record<string, DemoAttendanceSession> = {};
  let n = 0;
  const practices = Array.from({ length: 21 }, (_, i) => addDaysISO(today, -(i + 1)))
    .filter(date => PRACTICE_WEEKDAYS.includes(weekdayISO(date)));   // newest first
  for (const [practice, date] of practices.entries()) {
    const savedAt = `${addDaysISO(date, 1)}T01:15:00.000Z`;   // 6:15 PM after practice, Arizona time
    const records: Record<string, DemoAttendanceRecord> = {};
    for (const a of DEMO_ROSTER) {
      const absent = ABSENCES.find(x => x.athlete === a.name && x.practice === practice);
      records[a.id] = {
        recordId: id(7000 + n++),
        status: absent ? "absent" : "present",
        absenceReason: absent ? absent.reason : null,
        note: absent?.note ?? null,
        updatedAt: savedAt,
        updatedByName: COACH,
      };
    }
    sessions[date] = { date, version: 1, createdAt: savedAt, updatedAt: savedAt, createdByName: COACH, updatedByName: COACH, records };
  }

  // Today: saved 25 minutes ago (never before the team's midnight).
  const midnight = Date.parse(`${today}T07:00:00.000Z`); // 00:00 in Arizona (UTC-7, no DST)
  const savedToday = new Date(Math.min(now.getTime(), Math.max(midnight + 60_000, now.getTime() - 25 * 60_000))).toISOString();
  const todayRecords: Record<string, DemoAttendanceRecord> = {};
  for (const a of DEMO_ROSTER) {
    const absent = TODAY_ABSENCES.find(x => x.athlete === a.name);
    todayRecords[a.id] = {
      recordId: id(7000 + n++),
      status: absent ? "absent" : "present",
      absenceReason: absent ? absent.reason : null,
      note: absent?.note ?? null,
      updatedAt: savedToday,
      updatedByName: COACH,
    };
  }
  sessions[today] = { date: today, version: 1, createdAt: savedToday, updatedAt: savedToday, createdByName: COACH, updatedByName: COACH, records: todayRecords };

  return { sessions, seq: n };
}

// ── The AttendanceApi ───────────────────────────────────────────────────────

function marksOf(s: DemoAttendanceSession) {
  return Object.values(s.records).map(r => markFromStored(r.status, r.absenceReason, r.note));
}

function summaryOf(s: DemoAttendanceSession, today: string): AttendanceSessionSummary {
  return {
    sessionDate: s.date,
    status: "draft",
    version: s.version,
    timeZone: DEMO_TIME_ZONE,
    editable: attendanceDateEligibility(s.date, today) === "editable",
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    createdByName: s.createdByName,
    updatedByName: s.updatedByName,
    totals: computeAttendanceTotals(marksOf(s)),
  };
}

/** The app's AttendanceApi, answered in memory. Like the real server it
 *  owns the data: it starts from `initial` and reports every saved change
 *  through `onChange` (the demo store mirrors it for the athlete profile's
 *  Attendance card). `nowFn` is the demo's clock. */
export function createDemoAttendanceApi(
  initial: DemoAttendanceDb,
  onChange: (db: DemoAttendanceDb) => void = () => {},
  nowFn: () => Date = () => new Date(),
): AttendanceApi {
  let current = initial;
  const read = () => current;
  const write = (fn: (db: DemoAttendanceDb) => DemoAttendanceDb) => { current = fn(current); onChange(current); };
  const clock = () => {
    const now = nowFn();
    return { today: demoTodayISO(now), timeZone: DEMO_TIME_ZONE, serverTime: now.toISOString() };
  };

  return {
    async listSessions(range = {}) {
      const c = clock();
      const to = range.to ?? c.today;
      const from = range.from ?? addDaysISO(c.today, -ATTENDANCE_EDIT_WINDOW_DAYS);
      const sessions = Object.values(read().sessions)
        .filter(s => s.date >= from && s.date <= to)
        .sort((a, b) => b.date.localeCompare(a.date))
        .map(s => summaryOf(s, c.today));
      const value: AttendanceSessionList = {
        clock: c,
        editableFrom: addDaysISO(c.today, -ATTENDANCE_EDIT_WINDOW_DAYS),
        editableTo: c.today,
        from, to, sessions,
      };
      return { ok: true, value };
    },

    async loadDate(date) {
      const c = clock();
      const eligibility = attendanceDateEligibility(date, c.today);
      const s = read().sessions[date] ?? null;
      const value: AttendanceDateView = {
        clock: c,
        sessionDate: date,
        editability: eligibility === "future" ? "date_in_future" : eligibility === "read_only" ? "date_not_editable" : "editable",
        session: s ? summaryOf(s, c.today) : null,
        rows: DEMO_ROSTER.map(a => {
          const r = s?.records[a.id] ?? null;
          return {
            record_id: r?.recordId ?? null,
            athlete_id: a.id,
            athlete_name: a.name,
            class_year: a.classYear,
            on_roster: true,
            added_after_session_date: false,
            has_record: r !== null,
            requires_decision: false,
            status: r?.status ?? null,
            absence_reason: r?.absenceReason ?? null,
            note: r?.note ?? null,
            record_updated_at: r?.updatedAt ?? null,
            record_updated_by_name: r?.updatedByName ?? null,
          };
        }),
      };
      return { ok: true, value };
    },

    async save(payload: AttendanceSavePayload) {
      const c = clock();
      const eligibility = attendanceDateEligibility(payload.sessionDate, c.today);
      if (eligibility === "future") return { ok: false, failure: { kind: "read_only", reason: "date_in_future" } };
      if (eligibility === "read_only") return { ok: false, failure: { kind: "read_only", reason: "date_not_editable" } };
      // The server's own validation of the request body.
      const parsed = parseSaveRequest({ expectedVersion: payload.expectedVersion, records: payload.records });
      if (!parsed.ok) return { ok: false, failure: { kind: "invalid_records", issues: parsed.issues } };
      const existing = read().sessions[payload.sessionDate] ?? null;
      if ((existing?.version ?? 0) !== parsed.expectedVersion) return { ok: false, failure: { kind: "conflict" } };
      const rosterIds = new Set(DEMO_ROSTER.map(a => a.id));
      if (parsed.records.some(r => !rosterIds.has(r.athlete_id))) return { ok: false, failure: { kind: "roster_changed" } };

      const at = c.serverTime;
      const version = (existing?.version ?? 0) + 1;
      write(db => {
        let seq = db.seq;
        const records: Record<string, DemoAttendanceRecord> = { ...(existing?.records ?? {}) };
        for (const r of parsed.records) {
          const prev = records[r.athlete_id];
          const changed = !prev || prev.status !== r.status || prev.absenceReason !== r.absence_reason || prev.note !== r.note;
          records[r.athlete_id] = changed
            ? { recordId: prev?.recordId ?? id(7000 + seq++), status: r.status, absenceReason: r.absence_reason, note: r.note, updatedAt: at, updatedByName: COACH }
            : prev;
        }
        const session: DemoAttendanceSession = {
          date: payload.sessionDate, version,
          createdAt: existing?.createdAt ?? at, createdByName: existing?.createdByName ?? COACH,
          updatedAt: at, updatedByName: COACH, records,
        };
        return { sessions: { ...db.sessions, [payload.sessionDate]: session }, seq };
      });
      return { ok: true, value: { sessionDate: payload.sessionDate, version, savedAt: at, created: existing === null } };
    },
  };
}

/** The athlete profile's read-only Attendance card data — absences only,
 *  never notes — exactly what getAthleteAbsences + summarizeAthleteAbsences
 *  give the real profile page. */
export function demoAthleteAttendance(db: DemoAttendanceDb, athleteId: string): AthleteAttendanceState {
  const rows = Object.values(db.sessions).flatMap(s => {
    const r = s.records[athleteId];
    return r && r.status === "absent" ? [{ session_date: s.date, absence_reason: r.absenceReason }] : [];
  });
  const summary = summarizeAthleteAbsences(rows);
  return summary ? { ok: true, summary } : { ok: false };
}
