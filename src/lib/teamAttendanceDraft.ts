// Team Management Phase 5 — attendance drafts: the editor's data model.
//
// Pure (no I/O). Built from what the database returns for one date
// (team_attendance_session_roster() + the session row), edited with the
// functions below, and turned into the exact payload
// team_attendance_save_draft() accepts. Core rules (dates, marks, totals,
// error codes) are in teamAttendance.ts.
//
// Nothing here touches localStorage/sessionStorage/IndexedDB: unsaved
// marks and notes live only in memory, and there is no autosave.
//
// ── Who is on the list ───────────────────────────────────────────────────
//   enrolled       On the roster by the session date (or with no recorded
//                  add date). Required in every save. A new session starts
//                  everyone Present; an athlete added since the last save
//                  also starts Present (newSinceLastSave).
//   late_pending   Added to the roster AFTER the session date and not yet
//                  in this session. Not included unless the coach decides
//                  to include them (includeLateAthlete, with an explicit
//                  Present/Absent) — never silently counted as Present.
//   late_included  Added after the date but already saved in this session:
//                  required from then on, like the database requires.
//   removed        Saved records of athletes since removed from the roster:
//                  shown as history (name/grade snapshots), never editable,
//                  never submitted, counted separately.
//
// ── Another coach saved first ────────────────────────────────────────────
// mergeServerDraft() compares, per athlete, what this coach loaded (the
// baseline), what they have now, and what the database has now:
//   only this coach changed it         -> keep theirs ("kept_mine")
//   only the other coach changed it    -> take the saved value ("took_theirs")
//   both changed it to the same thing  -> "identical"
//   both changed it differently        -> "conflict": the coach must choose
//                                         (resolveConflict) before saving
// Changes are compared per athlete, not per field: two coaches touching
// the same athlete differently is always a conflict, so a combination
// neither coach chose (e.g. one coach's reason with the other's note) is
// never produced.
import {
  ATTENDANCE_MAX_RECORDS,
  AttendanceRuleError,
  DEFAULT_ATTENDANCE_TIME_ZONE,
  PRESENT,
  computeAttendanceTotals,
  finalizeMark,
  isAbsenceReason,
  markAbsent,
  markDifferences,
  markFromStored,
  markPresent,
  sameMark,
  sessionEditability,
  withAbsenceReason,
  withNote,
  type AbsenceReason,
  type AttendanceIssue,
  type AttendanceMark,
  type AttendanceTotals,
  type SessionEditability,
} from "./teamAttendance.ts";

// ── Input: what the database returns ──────────────────────────────────────

/** One row of team_attendance_session_roster(). */
export type AttendanceRosterRow = {
  record_id: string | null;
  athlete_id: string | null;
  athlete_name: string;
  class_year: string | null;
  on_roster: boolean;
  added_after_session_date: boolean;
  has_record: boolean;
  requires_decision: boolean;
  status: string | null;
  absence_reason: string | null;
  note: string | null;
  record_updated_at: string | null;
  record_updated_by_name: string | null;
};

/** The saved session for the date, or null if none has been saved yet. */
export type AttendanceSessionInfo = { version: number; status: string; time_zone: string } | null;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);
const isBool = (v: unknown): v is boolean => typeof v === "boolean";
const optText = (v: unknown): v is string | null => v === null || typeof v === "string";

/** Strictly checks rows from the database before anything relies on them.
 *  Throws AttendanceRuleError("invalid_roster" | "duplicate_athlete"). */
export function parseRosterRows(rows: unknown): AttendanceRosterRow[] {
  if (!Array.isArray(rows)) throw new AttendanceRuleError("invalid_roster");
  const athletes = new Set<string>();
  const records = new Set<string>();
  return rows.map(raw => {
    if (!raw || typeof raw !== "object") throw new AttendanceRuleError("invalid_roster");
    const r = raw as Record<string, unknown>;
    if (!isBool(r.on_roster) || !isBool(r.added_after_session_date) || !isBool(r.has_record) || !isBool(r.requires_decision)) {
      throw new AttendanceRuleError("invalid_roster");
    }
    if (typeof r.athlete_name !== "string" || !optText(r.class_year) || !optText(r.note)
        || !optText(r.record_updated_at) || !optText(r.record_updated_by_name)) {
      throw new AttendanceRuleError("invalid_roster");
    }
    if (r.record_id !== null && !isUuid(r.record_id)) throw new AttendanceRuleError("invalid_roster");
    if (r.athlete_id !== null && !isUuid(r.athlete_id)) throw new AttendanceRuleError("invalid_roster");
    // Consistency the database guarantees; anything else is not trusted.
    if (r.has_record !== (r.record_id !== null)) throw new AttendanceRuleError("invalid_roster");
    if (r.on_roster && r.athlete_id === null) throw new AttendanceRuleError("invalid_roster");
    if (!r.on_roster && (!r.has_record || r.added_after_session_date || r.requires_decision)) throw new AttendanceRuleError("invalid_roster");
    if (r.requires_decision !== (r.on_roster && r.added_after_session_date && !r.has_record)) throw new AttendanceRuleError("invalid_roster");
    if (r.has_record) {
      try { markFromStored(r.status, r.absence_reason, r.note); } catch { throw new AttendanceRuleError("invalid_roster"); }
    } else if (r.status !== null || r.absence_reason !== null || r.note !== null) {
      throw new AttendanceRuleError("invalid_roster");
    }
    if (r.on_roster) {
      const id = (r.athlete_id as string).toLowerCase();
      if (athletes.has(id)) throw new AttendanceRuleError("duplicate_athlete", r.athlete_id as string);
      athletes.add(id);
    }
    if (r.record_id !== null) {
      const id = (r.record_id as string).toLowerCase();
      if (records.has(id)) throw new AttendanceRuleError("invalid_roster");
      records.add(id);
    }
    return r as unknown as AttendanceRosterRow;
  });
}

// ── The draft ─────────────────────────────────────────────────────────────

export type AttendanceEntryKind = "enrolled" | "late_pending" | "late_included" | "removed";

/** An athlete's attendance in the draft: whether they are counted in this
 *  session, and their mark (ignored while not included). */
export type EntryState = { included: boolean; mark: AttendanceMark };

export type AttendanceEntry = {
  /** athlete id; "record:<id>" for a removed athlete's history. */
  key: string;
  athleteId: string | null;
  recordId: string | null;
  name: string;
  classYear: string | null;
  kind: AttendanceEntryKind;
  /** Saved in this session already. */
  savedInSession: boolean;
  /** On the roster by the date, but not in the last save (starts Present). */
  newSinceLastSave: boolean;
  lastChangedBy: string | null;
  lastChangedAt: string | null;
  state: EntryState;
};

export type ConflictField = "included" | "status" | "absence_reason" | "note";

export type AttendanceConflict = {
  key: string;
  athleteId: string | null;
  /** This coach's unsaved version. */
  mine: EntryState;
  /** The version another coach saved. */
  theirs: EntryState;
  fields: ConflictField[];
};

export type AttendanceDraft = {
  sessionDate: string;
  timeZone: string;
  /** The version loaded (0: no session saved yet). Sent as expectedVersion. */
  version: number;
  status: string;
  exists: boolean;
  editability: SessionEditability;
  entries: AttendanceEntry[];
  /** Each entry's state as loaded (for a new session: the defaults). */
  baseline: Readonly<Record<string, EntryState>>;
  /** Unresolved conflicts with another coach's save, by key. */
  conflicts: Readonly<Record<string, AttendanceConflict>>;
};

function entryFromRow(row: AttendanceRosterRow, sessionExists: boolean): AttendanceEntry {
  const saved = row.has_record ? markFromStored(row.status, row.absence_reason, row.note) : null;
  const base = {
    athleteId: row.athlete_id,
    recordId: row.record_id,
    name: row.athlete_name,
    classYear: row.class_year,
    savedInSession: row.has_record,
    lastChangedBy: row.record_updated_by_name,
    lastChangedAt: row.record_updated_at,
  };
  if (!row.on_roster) {
    return { ...base, key: `record:${row.record_id}`, kind: "removed", newSinceLastSave: false, state: { included: false, mark: saved! } };
  }
  const key = row.athlete_id as string;
  if (row.added_after_session_date && !row.has_record) {
    return { ...base, key, kind: "late_pending", newSinceLastSave: false, state: { included: false, mark: PRESENT } };
  }
  if (row.added_after_session_date) {
    return { ...base, key, kind: "late_included", newSinceLastSave: false, state: { included: true, mark: saved! } };
  }
  return {
    ...base, key, kind: "enrolled",
    newSinceLastSave: sessionExists && !row.has_record,
    state: { included: true, mark: saved ?? PRESENT },
  };
}

function byName(a: AttendanceEntry, b: AttendanceEntry): number {
  return a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || a.key.localeCompare(b.key);
}

/** The draft for one date. `now` decides editability in the session's (or
 *  the team's) time zone — the database still re-checks on save. */
export function buildAttendanceDraft(input: {
  sessionDate: string;
  session: AttendanceSessionInfo;
  rows: unknown;
  now: Date;
}): AttendanceDraft {
  const rows = parseRosterRows(input.rows);
  const session = input.session;
  if (session && (!Number.isInteger(session.version) || session.version < 1 || typeof session.status !== "string" || typeof session.time_zone !== "string")) {
    throw new AttendanceRuleError("invalid_roster");
  }
  const timeZone = session?.time_zone ?? DEFAULT_ATTENDANCE_TIME_ZONE;
  const entries = rows.map(r => entryFromRow(r, session !== null)).sort(byName);
  return {
    sessionDate: input.sessionDate,
    timeZone,
    version: session?.version ?? 0,
    status: session?.status ?? "draft",
    exists: session !== null,
    editability: sessionEditability({ sessionDate: input.sessionDate, status: session?.status ?? null, timeZone }, input.now),
    entries,
    baseline: Object.fromEntries(entries.map(e => [e.key, e.state])),
    conflicts: {},
  };
}

// ── Categories for the editor ─────────────────────────────────────────────

export function entriesOfKind(draft: AttendanceDraft, kind: AttendanceEntryKind): AttendanceEntry[] {
  return draft.entries.filter(e => e.kind === kind);
}

/** Athletes that must be (or have been chosen to be) in the save. */
export function countedEntries(draft: AttendanceDraft): AttendanceEntry[] {
  return draft.entries.filter(e => e.kind !== "removed" && e.state.included);
}

/** Late-added athletes still waiting for the coach's decision. */
export function pendingDecisions(draft: AttendanceDraft): AttendanceEntry[] {
  return draft.entries.filter(e => e.kind === "late_pending" && !e.state.included);
}

// ── Edits (each returns a new draft) ──────────────────────────────────────

function editable(draft: AttendanceDraft): void {
  if (!draft.editability.editable) throw new AttendanceRuleError(draft.editability.reason);
}

function find(draft: AttendanceDraft, athleteId: string): AttendanceEntry {
  const entry = draft.entries.find(e => e.athleteId !== null && e.athleteId.toLowerCase() === String(athleteId).toLowerCase() && e.kind !== "removed");
  if (!entry) {
    const removed = draft.entries.some(e => e.kind === "removed" && e.athleteId === athleteId);
    throw new AttendanceRuleError(removed ? "athlete_not_editable" : "athlete_unknown", null);
  }
  return entry;
}

function update(draft: AttendanceDraft, key: string, state: EntryState): AttendanceDraft {
  return { ...draft, entries: draft.entries.map(e => (e.key === key ? { ...e, state } : e)) };
}

function editMark(draft: AttendanceDraft, athleteId: string, change: (m: AttendanceMark) => AttendanceMark): AttendanceDraft {
  editable(draft);
  const entry = find(draft, athleteId);
  if (!entry.state.included) throw new AttendanceRuleError("late_athlete_not_included", entry.athleteId);
  return update(draft, entry.key, { included: true, mark: change(entry.state.mark) });
}

/** Present: clears any absence reason and note. */
export function setAthletePresent(draft: AttendanceDraft, athleteId: string): AttendanceDraft {
  return editMark(draft, athleteId, () => markPresent());
}

/** Absent. Without a reason the draft can't be saved until one is chosen. */
export function setAthleteAbsent(draft: AttendanceDraft, athleteId: string, reason: AbsenceReason | null = null): AttendanceDraft {
  return editMark(draft, athleteId, m => markAbsent(m, reason));
}

export function setAthleteAbsenceReason(draft: AttendanceDraft, athleteId: string, reason: AbsenceReason): AttendanceDraft {
  return editMark(draft, athleteId, m => withAbsenceReason(m, reason));
}

/** An absent athlete's note, kept as typed (normalized when saved). */
export function setAthleteNote(draft: AttendanceDraft, athleteId: string, note: string | null): AttendanceDraft {
  return editMark(draft, athleteId, m => withNote(m, note));
}

/** Everyone counted -> Present (a reset; clears reasons and notes). */
export function setAllPresent(draft: AttendanceDraft): AttendanceDraft {
  editable(draft);
  return {
    ...draft,
    entries: draft.entries.map(e => (e.kind !== "removed" && e.state.included ? { ...e, state: { included: true, mark: markPresent() } } : e)),
  };
}

/** The coach's explicit decision to count an athlete added after the
 *  session date — with an explicit status, never an assumed one. */
export function includeLateAthlete(
  draft: AttendanceDraft,
  athleteId: string,
  status: "present" | "absent",
  reason: AbsenceReason | null = null,
): AttendanceDraft {
  editable(draft);
  const entry = find(draft, athleteId);
  if (entry.kind !== "late_pending") throw new AttendanceRuleError("athlete_required", entry.athleteId);
  if (status !== "present" && status !== "absent") throw new AttendanceRuleError("invalid_status", entry.athleteId);
  if (reason !== null && !isAbsenceReason(reason)) throw new AttendanceRuleError("invalid_reason", entry.athleteId);
  const mark = status === "present" ? markPresent() : markAbsent(PRESENT, reason);
  return update(draft, entry.key, { included: true, mark });
}

/** Undo an unsaved inclusion. Athletes already saved in the session (or on
 *  the roster by the date) can't be left out. */
export function excludeLateAthlete(draft: AttendanceDraft, athleteId: string): AttendanceDraft {
  editable(draft);
  const entry = find(draft, athleteId);
  if (entry.kind !== "late_pending") throw new AttendanceRuleError("athlete_required", entry.athleteId);
  return update(draft, entry.key, { included: false, mark: PRESENT });
}

// ── Unsaved changes ───────────────────────────────────────────────────────

export function sameEntryState(a: EntryState, b: EntryState): boolean {
  if (a.included !== b.included) return false;
  return !a.included || sameMark(a.mark, b.mark);
}

function stateDifferences(a: EntryState, b: EntryState): ConflictField[] {
  if (a.included !== b.included) return ["included"];
  return a.included ? markDifferences(a.mark, b.mark) : [];
}

export type AttendanceChange = {
  key: string;
  athleteId: string | null;
  from: EntryState;
  to: EntryState;
  fields: ConflictField[];
};

export type AttendanceChanges = {
  /** Athletes whose attendance differs from what was loaded. */
  changed: AttendanceChange[];
  /** Something would be lost by leaving now. */
  hasUnsavedChanges: boolean;
  /** No session has been saved for this date yet. */
  isNew: boolean;
  /** Saving would write something (a new session, or changes). */
  needsSave: boolean;
};

export function draftChanges(draft: AttendanceDraft): AttendanceChanges {
  const changed: AttendanceChange[] = [];
  for (const e of draft.entries) {
    if (e.kind === "removed") continue;
    const from = draft.baseline[e.key];
    if (!from || !sameEntryState(from, e.state)) {
      const before = from ?? { included: false, mark: PRESENT };
      changed.push({ key: e.key, athleteId: e.athleteId, from: before, to: e.state, fields: stateDifferences(before, e.state) });
    }
  }
  const hasUnsavedChanges = changed.length > 0 || Object.keys(draft.conflicts).length > 0;
  return { changed, hasUnsavedChanges, isNew: !draft.exists, needsSave: !draft.exists || hasUnsavedChanges };
}

// ── Save payload ──────────────────────────────────────────────────────────

/** Exactly what team_attendance_save_draft() accepts (p_records). */
export type AttendanceSaveRecord = {
  athlete_id: string;
  status: "present" | "absent";
  absence_reason: AbsenceReason | null;
  note: string | null;
  confirm_added_after_date?: true;
};

export type AttendanceSavePayload = {
  sessionDate: string;
  expectedVersion: number;
  records: AttendanceSaveRecord[];
};

export type SavePayloadResult =
  | { ok: true; payload: AttendanceSavePayload }
  | { ok: false; issues: AttendanceIssue[] };

/** The validated save, or every problem at once (codes + athlete ids only). */
export function buildSavePayload(draft: AttendanceDraft): SavePayloadResult {
  if (!draft.editability.editable) return { ok: false, issues: [{ code: draft.editability.reason, athleteId: null }] };
  const issues: AttendanceIssue[] = [];
  if (Object.keys(draft.conflicts).length > 0) issues.push({ code: "unresolved_conflicts", athleteId: null });

  const records: AttendanceSaveRecord[] = [];
  const seen = new Set<string>();
  for (const e of draft.entries) {
    if (e.kind === "removed") continue;
    if (!e.state.included) {
      if (e.kind !== "late_pending") issues.push({ code: "athlete_required", athleteId: e.athleteId });
      continue;
    }
    const id = (e.athleteId as string).toLowerCase();
    if (seen.has(id)) { issues.push({ code: "duplicate_athlete", athleteId: e.athleteId }); continue; }
    seen.add(id);
    let mark: AttendanceMark;
    try {
      mark = finalizeMark(e.state.mark);
    } catch (err) {
      issues.push({ code: err instanceof AttendanceRuleError ? err.code : "invalid_status", athleteId: e.athleteId });
      continue;
    }
    const record: AttendanceSaveRecord = {
      athlete_id: e.athleteId as string,
      status: mark.status,
      absence_reason: mark.absenceReason,
      note: mark.note,
    };
    if (e.kind === "late_pending") record.confirm_added_after_date = true;
    records.push(record);
  }
  if (records.length === 0 && issues.length === 0) issues.push({ code: "roster_empty", athleteId: null });
  if (records.length > ATTENDANCE_MAX_RECORDS) issues.push({ code: "too_many_records", athleteId: null });
  if (issues.length > 0) return { ok: false, issues };
  records.sort((a, b) => a.athlete_id.localeCompare(b.athlete_id));
  return { ok: true, payload: { sessionDate: draft.sessionDate, expectedVersion: draft.version, records } };
}

// ── Totals ────────────────────────────────────────────────────────────────

/** Totals as the coach sees them right now: counted athletes only; removed
 *  athletes' saved records are reported separately (as the database's
 *  session summaries do). */
export function draftTotals(draft: AttendanceDraft): AttendanceTotals {
  return computeAttendanceTotals(
    countedEntries(draft).map(e => e.state.mark),
    entriesOfKind(draft, "removed").length,
  );
}

// ── Merging another coach's save ──────────────────────────────────────────

export type MergeResult =
  | "unchanged"       // nobody changed it
  | "kept_mine"       // only this coach changed it: kept
  | "took_theirs"     // only the other coach changed it: their saved value
  | "identical"       // both changed it the same way
  | "conflict"        // both changed it differently: coach must choose
  | "athlete_added"   // joined the roster since this coach loaded
  | "athlete_removed"; // left the roster since this coach loaded

export type MergeOutcome = {
  key: string;
  athleteId: string | null;
  result: MergeResult;
  /** athlete_removed only: this coach had unsaved changes for them, which
   *  can't be saved (reported, never silently dropped). */
  localChangeLost?: boolean;
};

export type AttendanceMerge = {
  draft: AttendanceDraft;
  outcomes: MergeOutcome[];
  conflicts: AttendanceConflict[];
  serverVersionChanged: boolean;
  /** No conflicts: the merged draft can be saved as-is (on the new version). */
  readyToSave: boolean;
};

/** Reconciles this coach's draft with a fresh load of the same date
 *  (after a version conflict or roster change). The result is based on
 *  the latest saved version; this coach's changes are re-applied where
 *  safe; overlaps become conflicts that block saving until resolved. */
export function mergeServerDraft(local: AttendanceDraft, server: AttendanceDraft): AttendanceMerge {
  if (local.sessionDate !== server.sessionDate) throw new AttendanceRuleError("invalid_roster");
  const localByKey = new Map(local.entries.map(e => [e.key, e]));
  const outcomes: MergeOutcome[] = [];
  const conflicts: AttendanceConflict[] = [];
  const merged: AttendanceEntry[] = [];

  // This coach's current intent for an entry (an earlier unresolved
  // conflict still holds their own version).
  const mine = (e: AttendanceEntry): EntryState => local.conflicts[e.key]?.mine ?? e.state;
  const localChanged = (e: AttendanceEntry): boolean => {
    const base = local.baseline[e.key];
    return !base || !sameEntryState(base, mine(e)) || local.conflicts[e.key] !== undefined;
  };

  for (const s of server.entries) {
    const l = localByKey.get(s.key);
    if (s.kind === "removed") {
      const wasActive = s.athleteId !== null && local.entries.some(e => e.athleteId === s.athleteId && e.kind !== "removed");
      merged.push(s);
      if (wasActive) {
        const le = local.entries.find(e => e.athleteId === s.athleteId && e.kind !== "removed")!;
        outcomes.push({ key: s.key, athleteId: s.athleteId, result: "athlete_removed", localChangeLost: localChanged(le) });
      } else {
        outcomes.push({ key: s.key, athleteId: s.athleteId, result: "unchanged" });
      }
      continue;
    }
    if (!l || l.kind === "removed") {
      merged.push(s);
      outcomes.push({ key: s.key, athleteId: s.athleteId, result: "athlete_added" });
      continue;
    }
    const base = local.baseline[s.key];
    const theirs = s.state;
    const myState = mine(l);
    const iChanged = localChanged(l);
    const theyChanged = !base || !sameEntryState(base, theirs);

    if (local.conflicts[s.key]) {
      // Still undecided from an earlier merge: it stays a conflict (against
      // the latest saved value) until the coach chooses, unless the saved
      // value now equals theirs.
      if (sameEntryState(myState, theirs)) {
        merged.push(s);
        outcomes.push({ key: s.key, athleteId: s.athleteId, result: "identical" });
      } else {
        merged.push(s);
        conflicts.push({ key: s.key, athleteId: s.athleteId, mine: myState, theirs, fields: stateDifferences(myState, theirs) });
        outcomes.push({ key: s.key, athleteId: s.athleteId, result: "conflict" });
      }
    } else if (!iChanged) {
      merged.push(s);
      outcomes.push({ key: s.key, athleteId: s.athleteId, result: theyChanged ? "took_theirs" : "unchanged" });
    } else if (sameEntryState(myState, theirs)) {
      merged.push(s);
      outcomes.push({ key: s.key, athleteId: s.athleteId, result: "identical" });
    } else if (!theyChanged) {
      merged.push(stateForKind(s, myState));
      outcomes.push({ key: s.key, athleteId: s.athleteId, result: "kept_mine" });
    } else {
      // Show the saved value until the coach chooses; saving is blocked.
      merged.push(s);
      conflicts.push({ key: s.key, athleteId: s.athleteId, mine: myState, theirs, fields: stateDifferences(myState, theirs) });
      outcomes.push({ key: s.key, athleteId: s.athleteId, result: "conflict" });
    }
  }

  // Athletes this coach had that are gone from the roster entirely (deleted
  // with no saved record for this date).
  const serverKeys = new Set(server.entries.map(e => e.key));
  const serverAthletes = new Set(server.entries.map(e => e.athleteId).filter((id): id is string => id !== null));
  for (const l of local.entries) {
    if (l.kind === "removed" || serverKeys.has(l.key) || (l.athleteId && serverAthletes.has(l.athleteId))) continue;
    outcomes.push({ key: l.key, athleteId: l.athleteId, result: "athlete_removed", localChangeLost: localChanged(l) });
  }

  const draft: AttendanceDraft = {
    ...server,
    entries: merged.sort(byName),
    conflicts: Object.fromEntries(conflicts.map(c => [c.key, c])),
  };
  return {
    draft,
    outcomes,
    conflicts,
    serverVersionChanged: server.version !== local.version,
    readyToSave: conflicts.length === 0 && server.editability.editable,
  };
}

/** A kept local state on the server's entry. A late athlete this coach
 *  chose to include stays a pending inclusion (still needs the
 *  confirmation flag) unless the other coach already saved them. */
function stateForKind(entry: AttendanceEntry, state: EntryState): AttendanceEntry {
  if (entry.kind === "enrolled" || entry.kind === "late_included") return { ...entry, state: { included: true, mark: state.mark } };
  return { ...entry, state };
}

/** The coach's choice for one conflicting athlete: keep their own version
 *  or the other coach's saved one. */
export function resolveConflict(draft: AttendanceDraft, key: string, choice: "mine" | "theirs"): AttendanceDraft {
  const conflict = draft.conflicts[key];
  if (!conflict) throw new AttendanceRuleError("unknown_conflict");
  if (choice !== "mine" && choice !== "theirs") throw new AttendanceRuleError("unknown_conflict");
  const rest = Object.fromEntries(Object.entries(draft.conflicts).filter(([k]) => k !== key));
  const entry = draft.entries.find(e => e.key === key)!;
  const chosen = choice === "mine" ? stateForKind(entry, conflict.mine).state : conflict.theirs;
  return { ...update(draft, key, chosen), conflicts: rest };
}
