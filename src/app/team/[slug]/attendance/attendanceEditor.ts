// Team Management Phase 5-4 — the coach attendance screen's state.
//
// Pure: a reducer plus selectors and one async save flow with the API
// passed in, so every behavior is testable without a browser. The rules
// and the draft model are Phase 5-2's (teamAttendance.ts,
// teamAttendanceDraft.ts) — nothing here re-implements them:
//   - the draft:          buildAttendanceDraft + the set*/include* edits
//   - unsaved changes:    draftChanges
//   - what is saved:      buildSavePayload (the only payload builder)
//   - another coach:      mergeServerDraft + resolveConflict
//
// The server decides "today" and whether a date can be edited: the draft
// is built at the server's time, and the API's editability (from the
// database) replaces the locally computed one. The browser clock and time
// zone are never used for either.
//
// Nothing is stored outside memory and nothing autosaves.
import {
  AttendanceRuleError,
  addCalendarDays,
  isIsoDate,
  noteCharactersRemaining,
  type AbsenceReason,
  type AttendanceIssue,
  type AttendanceRuleCode,
  type AttendanceTotals,
} from "../../../../lib/teamAttendance.ts";
import {
  buildAttendanceDraft,
  buildSavePayload,
  draftChanges,
  draftTotals,
  excludeLateAthlete,
  includeLateAthlete,
  mergeServerDraft,
  resolveConflict,
  setAthleteAbsenceReason,
  setAthleteAbsent,
  setAthleteNote,
  setAthletePresent,
  type AttendanceDraft,
  type AttendanceEntry,
  type MergeOutcome,
} from "../../../../lib/teamAttendanceDraft.ts";
import {
  ALL_ATHLETES_TAB,
  buildGradeTabs,
  groupAthletesByClass,
  matchesGradeTab,
  matchesRosterSearch,
  resolveGradeTab,
  type GradeTab,
  type GradeTabKey,
} from "../team/rosterHelpers.ts";
import type {
  AttendanceApi,
  AttendanceClockView,
  AttendanceDateView,
  AttendanceEditability,
  AttendanceReadFailure,
  AttendanceSaveFailure,
  AttendanceSaveSuccess,
  AttendanceSessionList,
  AttendanceSessionSummary,
} from "./attendanceApi.ts";

// ── State ─────────────────────────────────────────────────────────────────

export type AttendanceFilter = "all" | "present" | "absent" | "attention";

export const ATTENDANCE_FILTERS: readonly { key: AttendanceFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "present", label: "Present" },
  { key: "absent", label: "Absent" },
  { key: "attention", label: "Needs attention" },
];

/** Where the coach asked to go while there were unsaved changes. */
export type PendingLeave =
  | { kind: "date"; date: string }
  | { kind: "reload" }
  | { kind: "href"; href: string }
  | { kind: "back" };

export type LoadState =
  | { kind: "idle" }
  | { kind: "loading"; date: string; seq: number }
  | { kind: "error"; date: string; failure: AttendanceReadFailure | "invalid_roster" }
  | { kind: "ready"; date: string };

export type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; savedAt: string; created: boolean; version: number }
  // The server confirmed the save but the refreshed attendance couldn't be
  // loaded: nothing is unsaved, editing waits for a reload.
  | { kind: "saved_needs_reload"; savedAt: string; version: number }
  | { kind: "blocked" }                                   // the draft has problems (shown per athlete)
  | { kind: "failed"; failure: AttendanceSaveFailure }
  // A conflict/roster change whose latest version couldn't be loaded.
  | { kind: "reload_failed"; cause: "conflict" | "roster_changed" };

export type MergeNotice = {
  cause: "conflict" | "roster_changed";
  keptMine: number;
  tookTheirs: number;
  identical: number;
  conflicts: number;
  added: number;
  removed: number;
  /** Athletes who left the roster while this coach had unsaved changes for them. */
  lostChangeNames: string[];
  newVersion: boolean;
};

export type ListState =
  | { kind: "loading" }
  | { kind: "error"; failure: AttendanceReadFailure }
  | { kind: "ready"; value: AttendanceSessionList };

export type DateMeta = { editability: AttendanceEditability; session: AttendanceSessionSummary | null };

export type EditorState = {
  clock: AttendanceClockView | null;
  list: ListState;
  selectedDate: string | null;
  load: LoadState;
  draft: AttendanceDraft | null;
  meta: DateMeta | null;
  save: SaveState;
  /** Problems the server reported for the last save (codes + athlete ids). */
  serverIssues: AttendanceIssue[];
  /** A save was attempted with problems: show them prominently. */
  attempted: boolean;
  merge: MergeNotice | null;
  search: string;
  filter: AttendanceFilter;
  /** Class tab — the roster's grade tabs (rosterHelpers). Display only. */
  grade: GradeTabKey;
  pending: PendingLeave | null;
  /** Navigation away was confirmed: stop guarding. */
  leaving: boolean;
  dateError: "future" | "invalid" | null;
  seq: number;
};

export function initialEditorState(initialDate: string | null = null): EditorState {
  const base: EditorState = {
    clock: null, list: { kind: "loading" }, selectedDate: null, load: { kind: "idle" }, draft: null, meta: null,
    save: { kind: "idle" }, serverIssues: [], attempted: false, merge: null, search: "", filter: "all", grade: ALL_ATHLETES_TAB,
    pending: null, leaving: false, dateError: null, seq: 0,
  };
  return initialDate && isIsoDate(initialDate) ? startLoad(base, initialDate) : base;
}

// ── Draft construction ────────────────────────────────────────────────────

/** The Phase 5-2 draft for a loaded date, at the SERVER's time, with the
 *  database's editability decision. Throws AttendanceRuleError for rows
 *  that don't pass parseRosterRows. */
export function draftFromDateView(view: AttendanceDateView): AttendanceDraft {
  const draft = buildAttendanceDraft({
    sessionDate: view.sessionDate,
    session: view.session ? { version: view.session.version, status: view.session.status, time_zone: view.session.timeZone } : null,
    rows: view.rows,
    now: new Date(view.clock.serverTime),
  });
  return {
    ...draft,
    editability: view.editability === "editable" ? { editable: true } : { editable: false, reason: view.editability },
  };
}

// ── Actions ───────────────────────────────────────────────────────────────

export type EditOp =
  | { op: "present"; athleteId: string }
  | { op: "absent"; athleteId: string }
  | { op: "reason"; athleteId: string; reason: AbsenceReason }
  | { op: "note"; athleteId: string; note: string }
  | { op: "include_late"; athleteId: string; status: "present" | "absent" }
  | { op: "exclude_late"; athleteId: string }
  | { op: "resolve"; key: string; choice: "mine" | "theirs" }
  | { op: "resolve_all"; choice: "mine" | "theirs" };

export type SaveOutcome =
  | { kind: "saved"; result: AttendanceSaveSuccess; view: AttendanceDateView | null }
  | { kind: "reloaded"; cause: "conflict" | "roster_changed"; view: AttendanceDateView }
  | { kind: "reload_failed"; cause: "conflict" | "roster_changed" }
  | { kind: "failed"; failure: AttendanceSaveFailure };

export type EditorAction =
  | { type: "list_loading" }
  | { type: "list_loaded"; value: AttendanceSessionList }
  | { type: "list_failed"; failure: AttendanceReadFailure }
  | { type: "select_date"; date: string }
  | { type: "reload" }
  | { type: "date_loaded"; seq: number; view: AttendanceDateView }
  | { type: "date_failed"; seq: number; failure: AttendanceReadFailure }
  | { type: "edit"; edit: EditOp }
  | { type: "save_blocked"; issues: AttendanceIssue[] }
  | { type: "save_started"; draft: AttendanceDraft }
  | { type: "save_finished"; draft: AttendanceDraft; outcome: SaveOutcome }
  | { type: "search"; value: string }
  | { type: "filter"; value: AttendanceFilter }
  | { type: "grade"; value: GradeTabKey }
  | { type: "show_attention" }
  | { type: "request_leave"; to: PendingLeave }
  | { type: "stay" }
  | { type: "discard" }
  | { type: "dismiss_merge" };

function startLoad(state: EditorState, date: string): EditorState {
  const seq = state.seq + 1;
  return {
    ...state,
    seq,
    selectedDate: date,
    load: { kind: "loading", date, seq },
    draft: null,
    meta: null,
    save: { kind: "idle" },
    serverIssues: [],
    attempted: false,
    merge: null,
    pending: null,
    dateError: null,
    filter: "all",
    grade: ALL_ATHLETES_TAB,
  };
}

/** Unsaved work that would be lost by leaving (or changing the date). */
export function isDirty(state: EditorState): boolean {
  if (!state.draft || state.leaving) return false;
  if (state.save.kind === "saved_needs_reload") return false;
  return draftChanges(state.draft).hasUnsavedChanges;
}

/** Editing is possible right now. */
export function canEdit(state: EditorState): boolean {
  return !!state.draft
    && state.draft.editability.editable
    && state.load.kind === "ready"
    && state.save.kind !== "saving"
    && state.save.kind !== "saved_needs_reload";
}

function applyEdit(draft: AttendanceDraft, edit: EditOp): AttendanceDraft {
  switch (edit.op) {
    case "present": return setAthletePresent(draft, edit.athleteId);
    case "absent": return setAthleteAbsent(draft, edit.athleteId);
    case "reason": return setAthleteAbsenceReason(draft, edit.athleteId, edit.reason);
    case "note": return setAthleteNote(draft, edit.athleteId, edit.note);
    case "include_late": return includeLateAthlete(draft, edit.athleteId, edit.status);
    case "exclude_late": return excludeLateAthlete(draft, edit.athleteId);
    case "resolve": return resolveConflict(draft, edit.key, edit.choice);
    case "resolve_all": return Object.keys(draft.conflicts).reduce((d, key) => resolveConflict(d, key, edit.choice), draft);
  }
}

function conflictKeyFor(draft: AttendanceDraft, athleteId: string): string | null {
  const id = athleteId.toLowerCase();
  const entry = draft.entries.find(e => e.athleteId?.toLowerCase() === id && e.kind !== "removed");
  return entry && draft.conflicts[entry.key] ? entry.key : null;
}

function mergeNotice(cause: "conflict" | "roster_changed", outcomes: MergeOutcome[], local: AttendanceDraft, newVersion: boolean): MergeNotice {
  const count = (r: MergeOutcome["result"]) => outcomes.filter(o => o.result === r).length;
  const names = new Map(local.entries.map(e => [e.athleteId, e.name]));
  return {
    cause,
    keptMine: count("kept_mine"),
    tookTheirs: count("took_theirs"),
    identical: count("identical"),
    conflicts: count("conflict"),
    added: count("athlete_added"),
    removed: count("athlete_removed"),
    lostChangeNames: outcomes
      .filter(o => o.result === "athlete_removed" && o.localChangeLost)
      .map(o => names.get(o.athleteId) ?? "An athlete"),
    newVersion,
  };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "list_loading":
      return state.list.kind === "ready" ? state : { ...state, list: { kind: "loading" } };

    case "list_loaded": {
      const fresher = !state.clock || Date.parse(action.value.clock.serverTime) >= Date.parse(state.clock.serverTime);
      const next = { ...state, list: { kind: "ready" as const, value: action.value }, clock: fresher ? action.value.clock : state.clock };
      // No date chosen yet: the team's today, from the server.
      return next.selectedDate === null ? startLoad(next, action.value.clock.today) : next;
    }

    case "list_failed":
      return { ...state, list: { kind: "error", failure: action.failure } };

    case "select_date": {
      if (!isIsoDate(action.date)) return { ...state, dateError: "invalid" };
      if (state.clock && action.date > state.clock.today) return { ...state, dateError: "future" };
      if (state.save.kind === "saving") return state;
      if (action.date === state.selectedDate && state.load.kind !== "error") return { ...state, dateError: null };
      if (isDirty(state)) return { ...state, pending: { kind: "date", date: action.date }, dateError: null };
      return startLoad(state, action.date);
    }

    case "reload": {
      if (!state.selectedDate || state.save.kind === "saving") return state;
      if (isDirty(state)) return { ...state, pending: { kind: "reload" } };
      return startLoad(state, state.selectedDate);
    }

    case "date_loaded": {
      if (state.load.kind !== "loading" || state.load.seq !== action.seq) return state; // stale
      let draft: AttendanceDraft;
      try {
        draft = draftFromDateView(action.view);
      } catch {
        return { ...state, load: { kind: "error", date: state.load.date, failure: "invalid_roster" } };
      }
      return {
        ...state,
        clock: action.view.clock,
        load: { kind: "ready", date: state.load.date },
        draft,
        meta: { editability: action.view.editability, session: action.view.session },
      };
    }

    case "date_failed":
      if (state.load.kind !== "loading" || state.load.seq !== action.seq) return state;
      return { ...state, load: { kind: "error", date: state.load.date, failure: action.failure } };

    case "edit": {
      if (!state.draft || !canEdit(state)) return state;
      const edit = action.edit;
      // An athlete in conflict is decided with Mine / Latest saved first.
      if (edit.op !== "resolve" && edit.op !== "resolve_all" && conflictKeyFor(state.draft, edit.athleteId)) return state;
      let draft: AttendanceDraft;
      try {
        draft = applyEdit(state.draft, edit);
      } catch (err) {
        if (err instanceof AttendanceRuleError) return state; // not an allowed change; the UI doesn't offer it
        throw err;
      }
      const touched = "athleteId" in edit ? edit.athleteId.toLowerCase() : null;
      return {
        ...state,
        draft,
        save: state.save.kind === "saved" || state.save.kind === "failed" || state.save.kind === "blocked" ? { kind: "idle" } : state.save,
        // A server-reported problem for this athlete is superseded by the edit.
        serverIssues: touched ? state.serverIssues.filter(i => i.athleteId?.toLowerCase() !== touched) : state.serverIssues,
      };
    }

    case "save_blocked":
      return { ...state, save: { kind: "blocked" }, attempted: true, serverIssues: action.issues.filter(i => i.athleteId === null) };

    case "save_started":
      if (state.save.kind === "saving" || state.draft !== action.draft) return state;
      return { ...state, save: { kind: "saving" }, serverIssues: [] };

    case "save_finished": {
      if (state.save.kind !== "saving" || state.draft !== action.draft) return state;
      const o = action.outcome;
      if (o.kind === "saved") {
        if (o.view && o.view.session && o.view.session.version >= o.result.version) {
          let draft: AttendanceDraft | null = null;
          try { draft = draftFromDateView(o.view); } catch { draft = null; }
          if (draft) {
            return {
              ...state,
              clock: o.view.clock,
              draft,
              meta: { editability: o.view.editability, session: o.view.session },
              save: { kind: "saved", savedAt: o.result.savedAt, created: o.result.created, version: o.result.version },
              attempted: false,
              merge: null,
            };
          }
        }
        return { ...state, save: { kind: "saved_needs_reload", savedAt: o.result.savedAt, version: o.result.version }, attempted: false, merge: null };
      }
      if (o.kind === "reloaded") {
        let server: AttendanceDraft;
        try {
          server = draftFromDateView(o.view);
        } catch {
          return { ...state, save: { kind: "reload_failed", cause: o.cause } };
        }
        const merged = mergeServerDraft(state.draft!, server);
        return {
          ...state,
          clock: o.view.clock,
          draft: merged.draft,
          meta: { editability: o.view.editability, session: o.view.session },
          save: { kind: "idle" },
          merge: mergeNotice(o.cause, merged.outcomes, state.draft!, merged.serverVersionChanged),
          attempted: false,
        };
      }
      if (o.kind === "reload_failed") return { ...state, save: { kind: "reload_failed", cause: o.cause } };

      const f = o.failure;
      if (f.kind === "read_only") {
        // The database refused the date: keep the coach's work on screen
        // (still marked unsaved) but stop offering edits.
        return {
          ...state,
          draft: { ...state.draft!, editability: { editable: false, reason: f.reason } },
          meta: state.meta ? { ...state.meta, editability: f.reason } : state.meta,
          save: { kind: "failed", failure: f },
        };
      }
      if (f.kind === "invalid_records") return { ...state, save: { kind: "failed", failure: f }, serverIssues: f.issues, attempted: true };
      return { ...state, save: { kind: "failed", failure: f } };
    }

    case "search":
      return { ...state, search: action.value };

    case "filter":
      return { ...state, filter: action.value };

    case "grade":
      return { ...state, grade: action.value };

    case "show_attention":
      return { ...state, filter: "attention", search: "", grade: ALL_ATHLETES_TAB };

    case "request_leave":
      if (!isDirty(state)) return state;
      return { ...state, pending: action.to };

    case "stay":
      return { ...state, pending: null };

    case "discard": {
      const p = state.pending;
      if (!p) return state;
      if (p.kind === "date") return startLoad({ ...state, pending: null }, p.date);
      if (p.kind === "reload") return state.selectedDate ? startLoad({ ...state, pending: null }, state.selectedDate) : { ...state, pending: null };
      // Leaving the screen: the caller navigates once guarding stops.
      return { ...state, pending: null, leaving: true };
    }

    case "dismiss_merge":
      return { ...state, merge: null };
  }
}

// ── Saving ────────────────────────────────────────────────────────────────

/** What Save Draft sends, or the problems to show instead (Phase 5-2's
 *  buildSavePayload — the only payload builder). */
export function prepareSave(state: EditorState) {
  if (!state.draft) return null;
  return buildSavePayload(state.draft);
}

/** One Save Draft: the PUT, then the date's latest version — to refresh
 *  after success, or to merge with after a conflict/roster change. Never
 *  reports success the server didn't confirm. */
export async function runSave(api: AttendanceApi, draft: AttendanceDraft): Promise<SaveOutcome> {
  const built = buildSavePayload(draft);
  if (!built.ok) return { kind: "failed", failure: { kind: "invalid_records", issues: built.issues } };
  const saved = await api.save(built.payload);
  if (saved.ok) {
    const view = await api.loadDate(draft.sessionDate);
    return { kind: "saved", result: saved.value, view: view.ok ? view.value : null };
  }
  const f = saved.failure;
  if (f.kind === "conflict" || f.kind === "roster_changed") {
    const view = await api.loadDate(draft.sessionDate);
    return view.ok ? { kind: "reloaded", cause: f.kind, view: view.value } : { kind: "reload_failed", cause: f.kind };
  }
  return { kind: "failed", failure: f };
}

// ── Selectors ─────────────────────────────────────────────────────────────

export type EntryProblem = "reason_required" | "note_too_long" | "conflict" | "server";

export function entryProblems(draft: AttendanceDraft, entry: AttendanceEntry, serverIssues: readonly AttendanceIssue[] = []): EntryProblem[] {
  const out: EntryProblem[] = [];
  if (entry.kind === "removed") return out;
  if (draft.conflicts[entry.key]) out.push("conflict");
  if (entry.state.included && entry.state.mark.status === "absent") {
    if (entry.state.mark.absenceReason === null) out.push("reason_required");
    if (entry.state.mark.note !== null && noteCharactersRemaining(entry.state.mark.note) < 0) out.push("note_too_long");
  }
  const id = entry.athleteId?.toLowerCase();
  if (id && serverIssues.some(i => i.athleteId?.toLowerCase() === id)) out.push("server");
  return out;
}

export function serverIssueCodesFor(entry: AttendanceEntry, serverIssues: readonly AttendanceIssue[]): AttendanceRuleCode[] {
  const id = entry.athleteId?.toLowerCase();
  return id ? serverIssues.filter(i => i.athleteId?.toLowerCase() === id).map(i => i.code) : [];
}

function matchesFilter(draft: AttendanceDraft, e: AttendanceEntry, filter: AttendanceFilter, serverIssues: readonly AttendanceIssue[]): boolean {
  switch (filter) {
    case "all": return true;
    case "present": return e.state.mark.status === "present";
    case "absent": return e.state.mark.status === "absent";
    case "attention": return entryProblems(draft, e, serverIssues).length > 0;
  }
}

export type AttendanceListView = {
  /** Athletes in this session (enrolled, late included) that match the
   *  class tab, search and filter — under All Athletes in class order
   *  (the roster's), by name within each class. */
  visible: AttendanceEntry[];
  /** Under All Athletes: `visible` grouped under class headings (the
   *  roster's groupAthletesByClass). One class selected: null. */
  groups: { label: string; entries: AttendanceEntry[] }[] | null;
  /** The roster's grade tabs, with counts of athletes in this session. */
  tabs: GradeTab[];
  /** The selected tab (All Athletes if the chosen one no longer exists). */
  grade: GradeTabKey;
  /** Athletes in this session, before search/filter. */
  inSession: number;
  /** Added after the date and not (yet) included: the coach decides. */
  pendingLate: AttendanceEntry[];
  /** Saved records of athletes no longer on the roster (read-only history). */
  removed: AttendanceEntry[];
  counts: Record<AttendanceFilter, number>;
  /** Athletes with a problem, and how many of them the search/filter hides. */
  problems: number;
  hiddenProblems: number;
  filtered: boolean;
};

export function attendanceListView(state: EditorState): AttendanceListView | null {
  const draft = state.draft;
  if (!draft) return null;
  const inSession = draft.entries.filter(e => e.kind !== "removed" && e.state.included);
  // Class tabs exactly like the Team/Roster screen: derived from the data
  // (no fixed list), unrecognized values as their own tabs after the
  // standard classes, "No grade set" last — nobody is ever hidden.
  const tabs = buildGradeTabs(inSession.map(e => ({ class_year: e.classYear })));
  const grade = resolveGradeTab(state.grade, tabs);
  const inGrade = (e: AttendanceEntry) => matchesGradeTab(e.classYear, grade);
  const searched = inSession.filter(e => inGrade(e) && matchesRosterSearch(e.name, state.search));
  const counts = {
    all: searched.length,
    present: searched.filter(e => matchesFilter(draft, e, "present", state.serverIssues)).length,
    absent: searched.filter(e => matchesFilter(draft, e, "absent", state.serverIssues)).length,
    attention: searched.filter(e => matchesFilter(draft, e, "attention", state.serverIssues)).length,
  };
  const filtered = searched.filter(e => matchesFilter(draft, e, state.filter, state.serverIssues));
  // Entries are already by name; grouping keeps that order within a class.
  const groups = grade === ALL_ATHLETES_TAB
    ? groupAthletesByClass(filtered.map(e => ({ class_year: e.classYear, entry: e })))
      .map(g => ({ label: g.label, entries: g.athletes.map(a => a.entry) }))
    : null;
  const visible = groups ? groups.flatMap(g => g.entries) : filtered;
  const visibleKeys = new Set(visible.map(e => e.key));
  const problemEntries = inSession.filter(e => entryProblems(draft, e, state.serverIssues).length > 0);
  const shown = (e: AttendanceEntry) => inGrade(e) && matchesRosterSearch(e.name, state.search);
  return {
    visible,
    groups,
    tabs,
    grade,
    inSession: inSession.length,
    // Kept in their own sections (never counted as enrolled); the class
    // tab and search narrow them too.
    pendingLate: draft.entries.filter(e => e.kind === "late_pending" && !e.state.included && shown(e)),
    removed: draft.entries.filter(e => e.kind === "removed" && shown(e)),
    counts,
    problems: problemEntries.length,
    hiddenProblems: problemEntries.filter(e => !visibleKeys.has(e.key)).length,
    filtered: state.search.trim() !== "" || state.filter !== "all" || grade !== ALL_ATHLETES_TAB,
  };
}

export type AttendanceSummaryView =
  | { kind: "none" }
  | { kind: "no_data"; reason: "not_recorded" | "future" | "empty_roster" }
  | { kind: "totals"; totals: AttendanceTotals; source: "draft" | "saved"; pendingLate: number };

/** The numbers above the list. While editing: the coach's draft, live.
 *  Read-only: the saved session's totals from the server (never draft
 *  defaults — an unsaved date never shows anyone as Present). */
export function attendanceSummary(state: EditorState): AttendanceSummaryView {
  const { draft, meta } = state;
  if (!draft || !meta) return { kind: "none" };
  if (meta.editability === "date_in_future") return { kind: "no_data", reason: "future" };
  if (!draft.editability.editable && draft.exists === false) return { kind: "no_data", reason: "not_recorded" };
  if (!draft.editability.editable && meta.session && !isDirty(state)) {
    return { kind: "totals", totals: meta.session.totals, source: "saved", pendingLate: 0 };
  }
  const totals = draftTotals(draft);
  if (totals.state === "no_data" && draft.entries.every(e => e.kind === "removed")) return { kind: "no_data", reason: "empty_roster" };
  const pendingLate = draft.entries.filter(e => e.kind === "late_pending" && !e.state.included).length;
  return { kind: "totals", totals, source: "draft", pendingLate };
}

/** What the header's status reads. */
export type AttendanceMode =
  | { kind: "loading" }
  | { kind: "draft"; saved: boolean; version: number }
  | { kind: "read_only"; reason: "date_not_editable" | "session_not_draft" | "date_in_future" };

export function attendanceMode(state: EditorState): AttendanceMode {
  const d = state.draft;
  if (!d || state.load.kind !== "ready") return { kind: "loading" };
  if (!d.editability.editable) return { kind: "read_only", reason: d.editability.reason as "date_not_editable" | "session_not_draft" | "date_in_future" };
  return { kind: "draft", saved: d.exists, version: d.version };
}

/** Whether Save Draft does anything right now. */
export function saveAvailability(state: EditorState): { enabled: boolean; reason: "saving" | "read_only" | "no_changes" | "conflicts" | "loading" | null } {
  const d = state.draft;
  if (!d || state.load.kind !== "ready" || state.save.kind === "saved_needs_reload") return { enabled: false, reason: "loading" };
  if (state.save.kind === "saving") return { enabled: false, reason: "saving" };
  if (!d.editability.editable) return { enabled: false, reason: "read_only" };
  if (Object.keys(d.conflicts).length > 0) return { enabled: false, reason: "conflicts" };
  if (!draftChanges(d).needsSave) return { enabled: false, reason: "no_changes" };
  return { enabled: true, reason: null };
}

/** Quick picks: today and the previous 14 days (the editable window),
 *  newest first, each marked if a session is saved. Server dates only. */
export function recentDates(state: EditorState): { date: string; saved: boolean; today: boolean }[] {
  if (!state.clock) return [];
  const saved = new Set(state.list.kind === "ready" ? state.list.value.sessions.map(s => s.sessionDate) : []);
  const today = state.clock.today;
  return Array.from({ length: 15 }, (_, i) => addCalendarDays(today, -i)).map(date => ({ date, saved: saved.has(date), today: date === today }));
}

/** The first editable date (today - 14), from the server's today. */
export function editableFrom(state: EditorState): string | null {
  return state.clock ? addCalendarDays(state.clock.today, -14) : null;
}
