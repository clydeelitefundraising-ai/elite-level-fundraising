// Team Management Phase 5-4 — the attendance screen's state: defaults,
// edits, validation, filters, late/removed athletes, saving, conflicts,
// unsaved-changes protection and read-only history. Pure: no browser.
import test from "node:test";
import assert from "node:assert/strict";
import {
  attendanceListView,
  attendanceMode,
  attendanceSummary,
  canEdit,
  editorReducer,
  entryProblems,
  initialEditorState,
  isDirty,
  prepareSave,
  recentDates,
  runSave,
  saveAvailability,
  type EditOp,
  type EditorAction,
  type EditorState,
} from "./attendanceEditor.ts";
import { saveStatusText, mergeNoticeLines } from "./attendanceFormat.ts";
import { draftChanges } from "../../../../lib/teamAttendanceDraft.ts";
import {
  A, SECRET_NOTE, SERVER_TIME, TODAY, clock, dateView, fakeApi, newRoster, row, saved, session, sessionList,
} from "./testSupport/fixtures.mjs";

const run = (state: EditorState, ...actions: EditorAction[]) => actions.reduce(editorReducer, state);
const edit = (state: EditorState, ...edits: EditOp[]) => run(state, ...edits.map(e => ({ type: "edit", edit: e }) as EditorAction));

/** Today's date loaded with the given rows/options. */
function readyToday(rows = newRoster(), opts: Parameters<typeof dateView>[2] = {}, list = sessionList()) {
  const s = run(initialEditorState(), { type: "list_loaded", value: list });
  assert.equal(s.load.kind, "loading");
  const seq = (s.load as { seq: number }).seq;
  return run(s, { type: "date_loaded", seq, view: dateView(TODAY, rows, opts) });
}

function readyDate(date: string, rows = newRoster(), opts: Parameters<typeof dateView>[2] = {}) {
  const s = run(initialEditorState(date), { type: "list_loaded", value: sessionList() });
  const seq = (s.load as { seq: number }).seq;
  return run(s, { type: "date_loaded", seq, view: dateView(date, rows, opts) });
}

// ── Loading and dates ─────────────────────────────────────────────────────

test("opens on the team's today from the server, never the device's date", () => {
  const s = run(initialEditorState(), { type: "list_loaded", value: sessionList([], clock("2026-03-01", "2026-03-01T18:00:00Z")) });
  assert.equal(s.selectedDate, "2026-03-01");
  assert.deepEqual(s.load, { kind: "loading", date: "2026-03-01", seq: 1 });
  // Quick picks are today and the previous 14 days, from the server's today.
  const recent = recentDates(s);
  assert.equal(recent.length, 15);
  assert.equal(recent[0].date, "2026-03-01");
  assert.equal(recent[0].today, true);
  assert.equal(recent[14].date, "2026-02-15");
});

test("a ?date deep link loads that date; the list doesn't override it", () => {
  const s = run(initialEditorState("2026-10-01"), { type: "list_loaded", value: sessionList() });
  assert.equal(s.selectedDate, "2026-10-01");
  assert.equal(initialEditorState("not-a-date").selectedDate, null);
});

test("future dates can't be selected; invalid dates are refused", () => {
  const s = readyToday();
  const future = run(s, { type: "select_date", date: "2026-10-21" });
  assert.equal(future.dateError, "future");
  assert.equal(future.selectedDate, TODAY);
  assert.equal(future.draft, s.draft, "nothing reloaded");
  assert.equal(run(s, { type: "select_date", date: "2026-02-30" }).dateError, "invalid");
});

test("stale date responses are ignored (switching quickly never shows the wrong date)", () => {
  let s = readyToday();
  s = run(s, { type: "select_date", date: "2026-10-19" });
  const firstSeq = (s.load as { seq: number }).seq;
  s = run(s, { type: "select_date", date: "2026-10-18" });
  const after = run(s, { type: "date_loaded", seq: firstSeq, view: dateView("2026-10-19", newRoster()) });
  assert.equal(after.draft, null, "old response dropped");
  assert.equal(after.load.kind, "loading");
});

test("load failures and malformed rosters are errors, never a partial list", () => {
  const s = run(initialEditorState(), { type: "list_loaded", value: sessionList() });
  const failed = run(s, { type: "date_failed", seq: 1, failure: "unavailable" });
  assert.deepEqual(failed.load, { kind: "error", date: TODAY, failure: "unavailable" });
  const bad = run(s, { type: "date_loaded", seq: 1, view: dateView(TODAY, [{ ...row(1, "X"), on_roster: "yes" }]) });
  assert.deepEqual(bad.load, { kind: "error", date: TODAY, failure: "invalid_roster" });
  assert.equal(bad.draft, null);
});

test("the database's editability wins over any local computation (device clock never used)", () => {
  // The server says read-only even though the draft's own time-based check would allow it.
  const ro = readyToday(newRoster(), { editability: "date_not_editable" });
  assert.equal(ro.draft!.editability.editable, false);
  assert.equal(canEdit(ro), false);
  // And editable on the server's word, at the server's time.
  const ok = readyDate("2026-10-06", newRoster(), { editability: "editable", clock: clock(TODAY, SERVER_TIME) });
  assert.equal(ok.draft!.editability.editable, true);
});

// ── New session defaults ──────────────────────────────────────────────────

test("a new session: everyone eligible starts Present, nothing is unsaved, Save Draft creates it", () => {
  const s = readyToday();
  assert.ok(s.draft!.entries.every(e => e.state.included && e.state.mark.status === "present"));
  assert.equal(isDirty(s), false, "opening a date is not an unsaved change");
  assert.deepEqual(saveAvailability(s), { enabled: true, reason: null });
  assert.deepEqual(attendanceMode(s), { kind: "draft", saved: false, version: 0 });
  const sum = attendanceSummary(s);
  assert.equal(sum.kind, "totals");
  if (sum.kind === "totals") {
    assert.equal(sum.source, "draft");
    assert.deepEqual([sum.totals.total, sum.totals.present, sum.totals.absent, sum.totals.presentPercent], [5, 5, 0, 100]);
  }
  // No reason or note for Present athletes.
  const built = prepareSave(s)!;
  assert.ok(built.ok);
  if (built.ok) {
    assert.equal(built.payload.expectedVersion, 0);
    assert.equal(built.payload.records.length, 5);
    assert.ok(built.payload.records.every(r => r.status === "present" && r.absence_reason === null && r.note === null));
  }
});

// ── Marking ───────────────────────────────────────────────────────────────

test("Absent needs a reason; the summary updates immediately; back to Present clears reason and note", () => {
  let s = edit(readyToday(), { op: "absent", athleteId: A(2) });
  const ben = s.draft!.entries.find(e => e.athleteId === A(2))!;
  assert.deepEqual(entryProblems(s.draft!, ben), ["reason_required"]);
  assert.equal(isDirty(s), true);
  let sum = attendanceSummary(s);
  assert.ok(sum.kind === "totals" && sum.totals.absent === 1 && sum.totals.reasonMissing === 1 && sum.totals.present === 4);

  const blocked = prepareSave(s)!;
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.deepEqual(blocked.issues, [{ code: "reason_required", athleteId: A(2) }]);

  s = edit(s, { op: "reason", athleteId: A(2), reason: "excused" }, { op: "note", athleteId: A(2), note: "  Doctor visit  " });
  sum = attendanceSummary(s);
  assert.ok(sum.kind === "totals" && sum.totals.excused === 1 && sum.totals.reasonMissing === 0 && sum.totals.presentPercent === 80);
  const ok = prepareSave(s)!;
  assert.ok(ok.ok);
  if (ok.ok) assert.deepEqual(ok.payload.records.find(r => r.athlete_id === A(2)), { athlete_id: A(2), status: "absent", absence_reason: "excused", note: "Doctor visit" });

  s = edit(s, { op: "present", athleteId: A(2) });
  const back = s.draft!.entries.find(e => e.athleteId === A(2))!.state.mark;
  assert.deepEqual(back, { status: "present", absenceReason: null, note: null });
  assert.equal(isDirty(s), false, "back to how it was loaded");
});

test("notes: up to 500 characters (counted like the database), more is flagged and blocks saving", () => {
  const emoji = String.fromCodePoint(0x1f600);
  let s = edit(readyToday(), { op: "absent", athleteId: A(1) }, { op: "reason", athleteId: A(1), reason: "other" }, { op: "note", athleteId: A(1), note: emoji.repeat(500) });
  const ava = () => s.draft!.entries.find(e => e.athleteId === A(1))!;
  assert.deepEqual(entryProblems(s.draft!, ava()), []);
  assert.ok(prepareSave(s)!.ok);
  s = edit(s, { op: "note", athleteId: A(1), note: emoji.repeat(501) });
  assert.deepEqual(entryProblems(s.draft!, ava()), ["note_too_long"]);
  const r = prepareSave(s)!;
  assert.ok(!r.ok && r.issues[0].code === "note_too_long");
});

// ── Search and filters ────────────────────────────────────────────────────

test("search and filters change only what's shown — the save still has every athlete", () => {
  let s = edit(readyToday(), { op: "absent", athleteId: A(2) }, { op: "absent", athleteId: A(4) }, { op: "reason", athleteId: A(4), reason: "unexcused" });
  s = run(s, { type: "filter", value: "absent" });
  let v = attendanceListView(s)!;
  assert.deepEqual(v.visible.map(e => e.name), ["Ben Brown", "Dee Diaz"]);
  assert.deepEqual(v.counts, { all: 5, present: 3, absent: 2, attention: 1 });
  assert.equal(v.filtered, true);

  s = run(s, { type: "search", value: "dee" });
  v = attendanceListView(s)!;
  assert.deepEqual(v.visible.map(e => e.name), ["Dee Diaz"]);
  assert.equal(v.problems, 1);
  assert.equal(v.hiddenProblems, 1, "Ben's missing reason is hidden by the search");

  s = edit(s, { op: "reason", athleteId: A(2), reason: "excused" });
  const built = prepareSave(s)!;
  assert.ok(built.ok);
  if (built.ok) assert.equal(built.payload.records.length, 5, "filtered-out athletes are still saved");

  const shown = run(s, { type: "show_attention" });
  assert.equal(shown.filter, "attention");
  assert.equal(shown.search, "");
});

test("'Needs attention' finds every blocked athlete after a failed save attempt", () => {
  let s = edit(readyToday(), { op: "absent", athleteId: A(3) }, { op: "absent", athleteId: A(5) });
  s = run(s, { type: "search", value: "ava" });
  const built = prepareSave(s)!;
  assert.ok(!built.ok);
  if (!built.ok) s = run(s, { type: "save_blocked", issues: built.issues });
  assert.equal(s.attempted, true);
  assert.equal(s.save.kind, "blocked");
  assert.equal(attendanceListView(s)!.hiddenProblems, 2);
  s = run(s, { type: "show_attention" });
  assert.deepEqual(attendanceListView(s)!.visible.map(e => e.athleteId), [A(3), A(5)]);
  assert.match(saveStatusText(s.save, "America/Phoenix")!, /Not saved/);
});

// ── Late-added and removed athletes ───────────────────────────────────────

const lateRows = () => [
  row(1, "Ava Adams"),
  row(2, "Ben Brown"),
  row(6, "Fay Fox", { added_after_session_date: true, requires_decision: true }),
];

test("late-added athletes aren't counted or saved until the coach explicitly includes them", () => {
  let s = readyDate("2026-10-15", lateRows());
  let v = attendanceListView(s)!;
  assert.deepEqual(v.pendingLate.map(e => e.name), ["Fay Fox"]);
  assert.equal(v.inSession, 2);
  let sum = attendanceSummary(s);
  assert.ok(sum.kind === "totals" && sum.totals.total === 2 && sum.pendingLate === 1);
  let built = prepareSave(s)!;
  assert.ok(built.ok && built.payload.records.every(r => r.athlete_id !== A(6)), "not silently saved as Present");

  s = edit(s, { op: "include_late", athleteId: A(6), status: "present" });
  v = attendanceListView(s)!;
  assert.equal(v.pendingLate.length, 0);
  assert.equal(v.inSession, 3);
  built = prepareSave(s)!;
  assert.ok(built.ok);
  if (built.ok) assert.deepEqual(built.payload.records.find(r => r.athlete_id === A(6)), { athlete_id: A(6), status: "present", absence_reason: null, note: null, confirm_added_after_date: true });

  s = edit(s, { op: "exclude_late", athleteId: A(6) });
  sum = attendanceSummary(s);
  assert.ok(sum.kind === "totals" && sum.totals.total === 2 && sum.pendingLate === 1);
  assert.equal(isDirty(s), false);
});

test("a late athlete already saved in the session is required (can't be left out)", () => {
  const rows = [row(1, "Ava Adams"), saved(row(6, "Fay Fox", { added_after_session_date: true }), 6, "absent", "other")];
  const s = readyDate("2026-10-15", rows, { session: session("2026-10-15", 2, { present: 0, absent: 1, other: 1 }) });
  const fay = s.draft!.entries.find(e => e.athleteId === A(6))!;
  assert.equal(fay.kind, "late_included");
  const after = edit(s, { op: "exclude_late", athleteId: A(6) });
  assert.equal(after.draft, s.draft, "refused, unchanged");
});

test("removed athletes: shown with their saved snapshot, never counted, never saved", () => {
  const gone = { ...saved(row(9, "Gus Gone (2025)", { class_year: "Senior" }), 9, "absent", "excused", SECRET_NOTE), athlete_id: null, on_roster: false };
  const rows = [saved(row(1, "Ava Adams"), 1, "present"), gone];
  const s = readyToday(rows, { session: session(TODAY, 3, { present: 1, removed: 1 }) });
  const v = attendanceListView(s)!;
  assert.deepEqual(v.removed.map(e => [e.name, e.classYear]), [["Gus Gone (2025)", "Senior"]]);
  assert.equal(v.inSession, 1);
  const sum = attendanceSummary(s);
  assert.ok(sum.kind === "totals" && sum.totals.total === 1 && sum.totals.removed === 1);
  const built = prepareSave(edit(s, { op: "absent", athleteId: A(1) }, { op: "reason", athleteId: A(1), reason: "other" }))!;
  assert.ok(built.ok);
  if (built.ok) assert.deepEqual(built.payload.records.map(r => r.athlete_id), [A(1)]);
});

// ── Saving ────────────────────────────────────────────────────────────────

const savedView = (version: number, marks: Record<number, ["present"] | ["absent", string, string?]>) => dateView(
  TODAY,
  newRoster().map((r, i) => {
    const m = marks[i + 1] ?? ["present"];
    return saved(r, i + 1, m[0], m[1] ?? null, m[2] ?? null);
  }),
  { session: session(TODAY, version, { present: 5 }) },
);

test("Save Draft: the Phase 5-2 payload goes to the API; success is shown only once the server confirms", async () => {
  let s = edit(readyToday(), { op: "absent", athleteId: A(2) }, { op: "reason", athleteId: A(2), reason: "excused" });
  const draft = s.draft!;
  const api = fakeApi({
    saves: [{ ok: true, value: { sessionDate: TODAY, version: 1, savedAt: "2026-10-20T17:05:00.000Z", created: true } }],
    loads: [{ ok: true, value: savedView(1, { 2: ["absent", "excused"] }) }],
  });
  s = run(s, { type: "save_started", draft });
  assert.equal(s.save.kind, "saving");
  assert.equal(canEdit(s), false, "no edits while saving (they'd be lost on refresh)");
  assert.equal(saveAvailability(s).enabled, false, "no second submission while saving");
  assert.equal(edit(s, { op: "present", athleteId: A(1) }).draft, s.draft);

  const outcome = await runSave(api, draft);
  assert.deepEqual(api.calls.save, [{ sessionDate: TODAY, expectedVersion: 0, records: (prepareSave({ ...s, draft } as EditorState) as { ok: true; payload: { records: unknown[] } }).payload.records }]);
  assert.deepEqual(api.calls.loadDate, [TODAY]);
  s = run(s, { type: "save_finished", draft, outcome });
  assert.equal(s.save.kind, "saved");
  assert.equal(s.draft!.version, 1, "the saved version is now the expected version");
  assert.equal(s.draft!.exists, true);
  assert.equal(isDirty(s), false);
  assert.deepEqual(saveAvailability(s), { enabled: false, reason: "no_changes" });
  assert.match(saveStatusText(s.save, "America/Phoenix")!, /^Saved at Oct 20, 10:05 AM\.$/);
});

test("a second save_started for the same draft is ignored (duplicate submission)", () => {
  const s = readyToday();
  const once = run(s, { type: "save_started", draft: s.draft! });
  const twice = run(once, { type: "save_started", draft: s.draft! });
  assert.equal(twice, once);
});

test("a failed save keeps every unsaved change and never says it was saved", async () => {
  for (const failure of [{ kind: "unavailable" }, { kind: "network" }, { kind: "error" }, { kind: "unauthorized" }] as const) {
    let s = edit(readyToday(), { op: "absent", athleteId: A(1) }, { op: "reason", athleteId: A(1), reason: "other" }, { op: "note", athleteId: A(1), note: "kept" });
    const draft = s.draft!;
    const outcome = await runSave(fakeApi({ saves: [{ ok: false, failure }] }), draft);
    s = run(s, { type: "save_started", draft }, { type: "save_finished", draft, outcome });
    assert.equal(s.save.kind, "failed");
    assert.equal(s.draft, draft, "draft untouched");
    assert.equal(isDirty(s), true);
    assert.doesNotMatch(saveStatusText(s.save, "America/Phoenix")!, /^Saved/);
    assert.equal(saveAvailability(s).enabled, true, "can try again");
  }
});

test("saved but the refresh failed: confirmed save, nothing unsaved, editing waits for a reload", async () => {
  let s = edit(readyToday(), { op: "absent", athleteId: A(1) }, { op: "reason", athleteId: A(1), reason: "other" });
  const draft = s.draft!;
  const outcome = await runSave(fakeApi({ saves: [{ ok: true, value: { sessionDate: TODAY, version: 1, savedAt: SERVER_TIME, created: true } }] }), draft);
  s = run(s, { type: "save_started", draft }, { type: "save_finished", draft, outcome });
  assert.equal(s.save.kind, "saved_needs_reload");
  assert.equal(isDirty(s), false);
  assert.equal(canEdit(s), false);
  assert.equal(saveAvailability(s).enabled, false);
});

test("the server refusing a date as read-only keeps the work on screen, stops editing", async () => {
  let s = edit(readyToday(), { op: "absent", athleteId: A(1) }, { op: "reason", athleteId: A(1), reason: "other" });
  const draft = s.draft!;
  const outcome = await runSave(fakeApi({ saves: [{ ok: false, failure: { kind: "read_only", reason: "date_not_editable" } }] }), draft);
  s = run(s, { type: "save_started", draft }, { type: "save_finished", draft, outcome });
  assert.equal(canEdit(s), false);
  assert.equal(isDirty(s), true, "still warned about on leaving");
  assert.equal(s.draft!.entries.find(e => e.athleteId === A(1))!.state.mark.status, "absent");
  assert.match(saveStatusText(s.save, "UTC")!, /read-only/);
});

test("server-reported record issues mark the athlete; editing that athlete clears them", async () => {
  let s = edit(readyToday(), { op: "absent", athleteId: A(1) }, { op: "reason", athleteId: A(1), reason: "other" });
  const draft = s.draft!;
  const outcome = await runSave(fakeApi({ saves: [{ ok: false, failure: { kind: "invalid_records", issues: [{ code: "invalid_reason", athleteId: A(1) }] } }] }), draft);
  s = run(s, { type: "save_started", draft }, { type: "save_finished", draft, outcome });
  const ava = () => s.draft!.entries.find(e => e.athleteId === A(1))!;
  assert.deepEqual(entryProblems(s.draft!, ava(), s.serverIssues), ["server"]);
  s = edit(s, { op: "reason", athleteId: A(1), reason: "excused" });
  assert.deepEqual(s.serverIssues, []);
});

// ── Another coach saved first ─────────────────────────────────────────────

test("version conflict: reload, keep safe changes, show conflicts, block until resolved, save on the new version", async () => {
  // Loaded version 1 (everyone present). This coach: Ben absent/excused, Cy absent/other.
  const base = savedView(1, {});
  let s = readyToday(base.rows, { session: base.session! });
  s = edit(s,
    { op: "absent", athleteId: A(2) }, { op: "reason", athleteId: A(2), reason: "excused" },
    { op: "absent", athleteId: A(3) }, { op: "reason", athleteId: A(3), reason: "other" }, { op: "note", athleteId: A(3), note: "mine" });
  const draft = s.draft!;
  // Meanwhile another coach saved version 2: Cy absent/unexcused with their note, Dee absent/excused.
  const theirs = savedView(2, { 3: ["absent", "unexcused", "theirs"], 4: ["absent", "excused"] });
  const api = fakeApi({ saves: [{ ok: false, failure: { kind: "conflict" } }], loads: [{ ok: true, value: theirs }] });
  const outcome = await runSave(api, draft);
  assert.equal(outcome.kind, "reloaded");
  s = run(s, { type: "save_started", draft }, { type: "save_finished", draft, outcome });

  const mark = (n: number) => s.draft!.entries.find(e => e.athleteId === A(n))!.state.mark;
  assert.equal(s.draft!.version, 2, "now based on the latest version");
  assert.deepEqual(mark(2), { status: "absent", absenceReason: "excused", note: null }, "my non-conflicting change kept");
  assert.deepEqual(mark(4), { status: "absent", absenceReason: "excused", note: null }, "their change brought in");
  assert.deepEqual(Object.keys(s.draft!.conflicts), [A(3)], "both changed Cy differently");
  assert.deepEqual(mark(3), { status: "absent", absenceReason: "unexcused", note: "theirs" }, "latest saved shown until chosen — never a mix");
  assert.equal(s.merge!.keptMine, 1);
  assert.equal(s.merge!.tookTheirs, 1);
  assert.equal(s.merge!.conflicts, 1);
  assert.match(mergeNoticeLines(s.merge!).lines.join(" "), /choose which to keep/);

  assert.deepEqual(saveAvailability(s), { enabled: false, reason: "conflicts" });
  assert.equal(isDirty(s), true);
  assert.equal(edit(s, { op: "present", athleteId: A(3) }).draft, s.draft, "a conflicted athlete is decided with Mine/Latest first");

  s = edit(s, { op: "resolve", key: A(3), choice: "mine" });
  assert.deepEqual(mark(3), { status: "absent", absenceReason: "other", note: "mine" }, "my whole version, not a combination");
  assert.deepEqual(saveAvailability(s), { enabled: true, reason: null });
  const built = prepareSave(s)!;
  assert.ok(built.ok);
  if (built.ok) {
    assert.equal(built.payload.expectedVersion, 2);
    assert.deepEqual(built.payload.records.find(r => r.athlete_id === A(4)), { athlete_id: A(4), status: "absent", absence_reason: "excused", note: null }, "the other coach's change is preserved, not overwritten");
  }
});

test("conflict resolution: Latest saved, and Keep all mine / Use all latest", async () => {
  const base = savedView(1, {});
  let s = readyToday(base.rows, { session: base.session! });
  s = edit(s, { op: "absent", athleteId: A(1) }, { op: "reason", athleteId: A(1), reason: "other" }, { op: "absent", athleteId: A(2) }, { op: "reason", athleteId: A(2), reason: "other" });
  const draft = s.draft!;
  const theirs = savedView(2, { 1: ["absent", "excused"], 2: ["absent", "unexcused"] });
  const outcome = await runSave(fakeApi({ saves: [{ ok: false, failure: { kind: "conflict" } }], loads: [{ ok: true, value: theirs }] }), draft);
  s = run(s, { type: "save_started", draft }, { type: "save_finished", draft, outcome });
  assert.equal(Object.keys(s.draft!.conflicts).length, 2);
  const theirsAll = edit(s, { op: "resolve_all", choice: "theirs" });
  assert.equal(Object.keys(theirsAll.draft!.conflicts).length, 0);
  assert.equal(isDirty(theirsAll), false, "taking the latest saved for everything leaves nothing to save");
  const mineAll = edit(s, { op: "resolve_all", choice: "mine" });
  assert.equal(mineAll.draft!.entries.find(e => e.athleteId === A(1))!.state.mark.absenceReason, "other");
  const one = edit(s, { op: "resolve", key: A(2), choice: "theirs" });
  assert.equal(one.draft!.entries.find(e => e.athleteId === A(2))!.state.mark.absenceReason, "unexcused");
  assert.equal(Object.keys(one.draft!.conflicts).length, 1);
});

test("roster changed while editing: reconciled with a clear notice, lost changes named — never silently dropped", async () => {
  let s = readyToday();
  s = edit(s, { op: "absent", athleteId: A(5) }, { op: "reason", athleteId: A(5), reason: "other" }, { op: "absent", athleteId: A(1) }, { op: "reason", athleteId: A(1), reason: "excused" });
  const draft = s.draft!;
  // Eli (5) was deleted from the roster; Hal (7) joined.
  const fresh = dateView(TODAY, [...newRoster().slice(0, 4), row(7, "Hal Hill")]);
  const outcome = await runSave(fakeApi({ saves: [{ ok: false, failure: { kind: "roster_changed" } }], loads: [{ ok: true, value: fresh }] }), draft);
  s = run(s, { type: "save_started", draft }, { type: "save_finished", draft, outcome });
  assert.equal(s.merge!.cause, "roster_changed");
  assert.deepEqual(s.merge!.lostChangeNames, ["Eli Evans"]);
  assert.equal(s.merge!.added, 1);
  assert.match(mergeNoticeLines(s.merge!).lines.join(" "), /Eli Evans couldn't be kept/);
  assert.equal(s.draft!.entries.find(e => e.athleteId === A(1))!.state.mark.absenceReason, "excused", "other changes kept");
  assert.ok(s.draft!.entries.some(e => e.athleteId === A(7)));
  assert.equal(saveAvailability(s).enabled, true);
});

test("a conflict whose latest version can't be loaded keeps everything and offers Try again", async () => {
  let s = edit(readyToday(), { op: "absent", athleteId: A(1) }, { op: "reason", athleteId: A(1), reason: "excused" });
  const draft = s.draft!;
  const outcome = await runSave(fakeApi({ saves: [{ ok: false, failure: { kind: "conflict" } }], loads: [{ ok: false, failure: "network" }] }), draft);
  s = run(s, { type: "save_started", draft }, { type: "save_finished", draft, outcome });
  assert.deepEqual(s.save, { kind: "reload_failed", cause: "conflict" });
  assert.equal(s.draft, draft);
  assert.equal(isDirty(s), true);
});

// ── Unsaved changes ───────────────────────────────────────────────────────

test("changing the date with unsaved changes asks first: Stay keeps everything, Discard loads the new date", () => {
  const dirty = edit(readyToday(), { op: "absent", athleteId: A(1) });
  const asked = run(dirty, { type: "select_date", date: "2026-10-19" });
  assert.deepEqual(asked.pending, { kind: "date", date: "2026-10-19" });
  assert.equal(asked.draft, dirty.draft);
  assert.equal(asked.selectedDate, TODAY);
  const stayed = run(asked, { type: "stay" });
  assert.equal(stayed.pending, null);
  assert.equal(stayed.draft, dirty.draft);
  const discarded = run(asked, { type: "discard" });
  assert.equal(discarded.selectedDate, "2026-10-19");
  assert.equal(discarded.load.kind, "loading");
  assert.equal(discarded.draft, null);
  // Not dirty: no question.
  assert.equal(run(readyToday(), { type: "select_date", date: "2026-10-19" }).pending, null);
});

test("leaving the screen (link or Back) with unsaved changes asks; Discard stops guarding", () => {
  const dirty = edit(readyToday(), { op: "absent", athleteId: A(1) });
  for (const to of [{ kind: "href", href: "/team/x/home" }, { kind: "back" }] as const) {
    const asked = run(dirty, { type: "request_leave", to });
    assert.deepEqual(asked.pending, to);
    assert.equal(isDirty(asked), true);
    const left = run(asked, { type: "discard" });
    assert.equal(left.leaving, true);
    assert.equal(isDirty(left), false, "the guard releases so the navigation can happen");
  }
  assert.equal(run(readyToday(), { type: "request_leave", to: { kind: "back" } }).pending, null, "nothing unsaved: no question");
});

test("Reload with unsaved changes asks first", () => {
  const dirty = edit(readyToday(), { op: "absent", athleteId: A(1) });
  assert.deepEqual(run(dirty, { type: "reload" }).pending, { kind: "reload" });
  const reloaded = run(dirty, { type: "reload" }, { type: "discard" });
  assert.equal(reloaded.load.kind, "loading");
  assert.equal(reloaded.selectedDate, TODAY);
});

test("unsaved changes come from draftChanges (the Phase 5-2 utility)", () => {
  const s = edit(readyToday(), { op: "absent", athleteId: A(1) }, { op: "absent", athleteId: A(2) });
  assert.equal(draftChanges(s.draft!).changed.length, 2);
  assert.equal(isDirty(s), draftChanges(s.draft!).hasUnsavedChanges);
});

// ── Read-only history ─────────────────────────────────────────────────────

test("read-only history: saved statuses and server totals; no edits, no save", () => {
  const rows = newRoster().map((r, i) => (i === 1 ? saved(r, 2, "absent", "unexcused", SECRET_NOTE) : saved(r, i + 1, "present")));
  const s = readyDate("2026-09-01", rows, {
    editability: "date_not_editable",
    session: session("2026-09-01", 4, { present: 4, absent: 1, unexcused: 1 }, { editable: false }),
  });
  assert.deepEqual(attendanceMode(s), { kind: "read_only", reason: "date_not_editable" });
  const sum = attendanceSummary(s);
  assert.ok(sum.kind === "totals" && sum.source === "saved" && sum.totals.unexcused === 1 && sum.totals.presentPercent === 80);
  assert.equal(edit(s, { op: "present", athleteId: A(2) }).draft, s.draft, "edits ignored");
  assert.deepEqual(saveAvailability(s), { enabled: false, reason: "read_only" });
  const ben = s.draft!.entries.find(e => e.athleteId === A(2))!;
  assert.deepEqual(ben.state.mark, { status: "absent", absenceReason: "unexcused", note: SECRET_NOTE }, "coach-only note shown");
});

test("an old date with no session: No Attendance Recorded — never a default 'everyone present'", () => {
  const s = readyDate("2026-09-01", newRoster(), { editability: "date_not_editable" });
  assert.deepEqual(attendanceSummary(s), { kind: "no_data", reason: "not_recorded" });
  assert.equal(saveAvailability(s).enabled, false);
  assert.equal(isDirty(s), false);
});

test("a finalized session is read-only for that reason", () => {
  const s = readyToday(newRoster().map((r, i) => saved(r, i + 1, "present")), {
    editability: "session_not_draft",
    session: session(TODAY, 3, { present: 5 }, { status: "final", editable: false }),
  });
  assert.deepEqual(attendanceMode(s), { kind: "read_only", reason: "session_not_draft" });
});

test("a future date (deep link): no roster marks, no summary numbers", () => {
  const s = readyDate("2026-10-25", newRoster(), { editability: "date_in_future" });
  assert.deepEqual(attendanceSummary(s), { kind: "no_data", reason: "future" });
  assert.equal(canEdit(s), false);
});

test("an empty roster is a clear no-data state", () => {
  assert.deepEqual(attendanceSummary(readyToday([])), { kind: "no_data", reason: "empty_roster" });
});

// ── Larger rosters ────────────────────────────────────────────────────────

test("250 athletes: edits touch one entry; unchanged rows keep their identity (cheap re-render)", () => {
  const rows = Array.from({ length: 250 }, (_, i) => row(i + 1, `Athlete ${String(i + 1).padStart(3, "0")}`));
  const s = readyToday(rows);
  const after = edit(s, { op: "absent", athleteId: A(100) });
  const changed = after.draft!.entries.filter((e, i) => e !== s.draft!.entries[i]);
  assert.equal(changed.length, 1);
  assert.equal(attendanceListView(after)!.visible.length, 250);
});
