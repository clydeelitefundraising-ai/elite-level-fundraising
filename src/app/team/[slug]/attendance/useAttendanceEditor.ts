"use client";

// Team Management Phase 5-4 — wires the attendance screen's pure state
// (attendanceEditor.ts) to the Phase 5-3 API and the unsaved-changes
// guard. State lives only in memory; nothing autosaves.
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { useRouter } from "next/navigation";
import { addCalendarDays } from "@/lib/teamAttendance";
import { createAttendanceApi, type AttendanceApi } from "./attendanceApi";
import {
  editorReducer,
  initialEditorState,
  isDirty,
  prepareSave,
  runSave,
  type AttendanceFilter,
  type EditOp,
} from "./attendanceEditor";
import { useUnsavedChangesGuard, type GuardRequest } from "./unsavedChangesGuard";
import type { GradeTabKey } from "../team/rosterHelpers";

/** History shown under the editor: the last year of saved sessions. */
const HISTORY_DAYS = 365;

export function useAttendanceEditor(slug: string, initialDate: string | null, apiOverride?: AttendanceApi) {
  const api = useMemo(() => apiOverride ?? createAttendanceApi(slug), [apiOverride, slug]);
  const router = useRouter();
  const [state, dispatch] = useReducer(editorReducer, initialDate, initialEditorState);
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);
  const saving = useRef(false);

  // ── Session list (history + the clock) ──────────────────────────────────
  const loadList = useCallback(async () => {
    dispatch({ type: "list_loading" });
    // Today comes from the server; the first call takes the default range
    // (the editable window) to learn it, then the year is requested.
    const first = await api.listSessions();
    if (!first.ok) { dispatch({ type: "list_failed", failure: first.failure }); return; }
    const today = first.value.clock.today;
    const year = await api.listSessions({ from: addCalendarDays(today, -HISTORY_DAYS), to: today });
    dispatch(year.ok ? { type: "list_loaded", value: year.value } : { type: "list_loaded", value: first.value });
  }, [api]);

  useEffect(() => { void loadList(); }, [loadList]);

  // ── One date ────────────────────────────────────────────────────────────
  const load = state.load;
  useEffect(() => {
    if (load.kind !== "loading") return;
    let cancelled = false;
    void api.loadDate(load.date).then(res => {
      if (cancelled) return;
      dispatch(res.ok
        ? { type: "date_loaded", seq: load.seq, view: res.value }
        : { type: "date_failed", seq: load.seq, failure: res.failure });
    });
    return () => { cancelled = true; };
  }, [api, load]);

  // ── Save Draft ──────────────────────────────────────────────────────────
  const save = useCallback(async () => {
    const s = stateRef.current;
    if (saving.current || !s.draft) return;              // no duplicate submissions
    const built = prepareSave(s);
    if (!built) return;
    if (!built.ok) { dispatch({ type: "save_blocked", issues: built.issues }); return; }
    saving.current = true;
    const draft = s.draft;
    dispatch({ type: "save_started", draft });
    try {
      const outcome = await runSave(api, draft);
      dispatch({ type: "save_finished", draft, outcome });
      if (outcome.kind === "saved") void loadList();
    } finally {
      saving.current = false;
    }
  }, [api, loadList]);

  // ── Unsaved changes ─────────────────────────────────────────────────────
  const dirty = isDirty(state);
  const onGuardRequest = useCallback((req: GuardRequest) => {
    dispatch({ type: "request_leave", to: req.kind === "back" ? { kind: "back" } : { kind: "href", href: req.href } });
  }, []);
  const leave = useUnsavedChangesGuard(dirty, onGuardRequest);

  const discard = useCallback(() => {
    const pending = stateRef.current.pending;
    dispatch({ type: "discard" });
    if (pending?.kind === "back") leave({ kind: "back" }, () => {});
    else if (pending?.kind === "href") {
      leave({ kind: "href", href: pending.href }, (href, mode) => (mode === "replace" ? router.replace(href) : router.push(href)));
    }
  }, [leave, router]);

  // Stable callbacks: rows are memoized, so 250 athletes don't re-render
  // when one changes.
  const actions = useMemo(() => ({
    selectDate: (date: string) => dispatch({ type: "select_date", date }),
    reload: () => dispatch({ type: "reload" }),
    retryList: () => void loadList(),
    edit: (edit: EditOp) => dispatch({ type: "edit", edit }),
    save: () => void save(),
    search: (value: string) => dispatch({ type: "search", value }),
    filter: (value: AttendanceFilter) => dispatch({ type: "filter", value }),
    grade: (value: GradeTabKey) => dispatch({ type: "grade", value }),
    showAttention: () => dispatch({ type: "show_attention" }),
    stay: () => dispatch({ type: "stay" }),
    discard,
    dismissMerge: () => dispatch({ type: "dismiss_merge" }),
  }), [loadList, save, discard]);

  return { state, dirty, actions };
}

export type AttendanceEditorActions = ReturnType<typeof useAttendanceEditor>["actions"];
