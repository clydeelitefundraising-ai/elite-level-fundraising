"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { addCalendarDays } from "@/lib/teamAttendance";
import type { AttendanceApi } from "@/app/team/[slug]/attendance/attendanceApi";
import {
  editorReducer,
  initialEditorState,
  isDirty,
  prepareSave,
  runSave,
  type AttendanceFilter,
  type EditOp,
} from "@/app/team/[slug]/attendance/attendanceEditor";
import { rosterPath } from "@/app/team/[slug]/team/takeAttendance";
import type { GradeTabKey } from "@/app/team/[slug]/team/rosterHelpers";
import { useSeasonReadOnly } from "@/app/team/[slug]/_components/SeasonStatus";
import AttendanceScreen from "./DemoAttendanceScreen";
import { DEMO_SLUG, DEMO_TEAM } from "./demoData";

// The coach attendance screen (attendance/AttendanceView.tsx) in the demo:
// the REAL editor — attendanceEditor.ts's reducer, prepareSave/runSave,
// the real draft rules and validation — driven against the demo's
// in-memory AttendanceApi (attendanceData.ts) instead of the network, and
// rendered by AttendanceScreen (generated twin; only next/link differs).
//
// This hook mirrors useAttendanceEditor.ts line for line, minus the two
// pieces that touch the browser outside the demo: next/navigation's router
// and useUnsavedChangesGuard (history entries + beforeunload). The guard's
// in-app part is kept: with unsaved changes, tapping any link asks first
// (the real LeaveDialog), and "Discard" then goes where the tap was headed.

const HISTORY_DAYS = 365;

function useDemoAttendanceEditor(api: AttendanceApi, onLeave: (href: string) => void, onSaved: () => void) {
  const [state, dispatch] = useReducer(editorReducer, null, initialEditorState);
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);
  const saving = useRef(false);

  const loadList = useCallback(async () => {
    dispatch({ type: "list_loading" });
    const first = await api.listSessions();
    if (!first.ok) { dispatch({ type: "list_failed", failure: first.failure }); return; }
    const today = first.value.clock.today;
    const year = await api.listSessions({ from: addCalendarDays(today, -HISTORY_DAYS), to: today });
    dispatch(year.ok ? { type: "list_loaded", value: year.value } : { type: "list_loaded", value: first.value });
  }, [api]);

  useEffect(() => { void loadList(); }, [loadList]);

  const seasonReadOnly = useSeasonReadOnly();
  const load = state.load;
  useEffect(() => {
    if (load.kind !== "loading") return;
    let cancelled = false;
    void api.loadDate(load.date).then(res => {
      if (cancelled) return;
      dispatch(res.ok
        ? { type: "date_loaded", seq: load.seq, view: seasonReadOnly && res.value.editability === "editable" ? { ...res.value, editability: "session_not_draft" as const } : res.value }
        : { type: "date_failed", seq: load.seq, failure: res.failure });
    });
    return () => { cancelled = true; };
  }, [api, load, seasonReadOnly]);

  const save = useCallback(async () => {
    const s = stateRef.current;
    if (saving.current || !s.draft) return;
    const built = prepareSave(s);
    if (!built) return;
    if (!built.ok) { dispatch({ type: "save_blocked", issues: built.issues }); return; }
    saving.current = true;
    const draft = s.draft;
    dispatch({ type: "save_started", draft });
    try {
      const outcome = await runSave(api, draft);
      dispatch({ type: "save_finished", draft, outcome });
      if (outcome.kind === "saved") { void loadList(); onSaved(); }
    } finally {
      saving.current = false;
    }
  }, [api, loadList, onSaved]);

  const dirty = isDirty(state);

  // In-app leave guard: links (the bottom nav, Roster, Home…) ask first.
  useEffect(() => {
    if (!dirty) return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!a) return;
      e.preventDefault();
      e.stopPropagation();
      dispatch({ type: "request_leave", to: { kind: "href", href: a.getAttribute("href") ?? "" } });
    };
    window.addEventListener("click", onClick, true);
    return () => window.removeEventListener("click", onClick, true);
  }, [dirty]);

  const discard = useCallback(() => {
    const pending = stateRef.current.pending;
    dispatch({ type: "discard" });
    if (pending?.kind === "href") onLeave(pending.href);
    else if (pending?.kind === "back") onLeave(rosterPath(DEMO_SLUG));
  }, [onLeave]);

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

export default function DemoAttendance({ api, onLeave, onSaved }: { api: AttendanceApi; onLeave: (href: string) => void; onSaved: () => void }) {
  const { state, dirty, actions } = useDemoAttendanceEditor(api, onLeave, onSaved);
  const teamName = [DEMO_TEAM.schoolName, DEMO_TEAM.sportName].filter(Boolean).join(" ");
  return <AttendanceScreen slug={DEMO_SLUG} teamName={teamName} state={state} dirty={dirty} actions={actions} />;
}
