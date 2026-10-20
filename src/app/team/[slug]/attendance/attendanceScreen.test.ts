// Team Management Phase 5-4 — the attendance screen as rendered (server
// markup via react-dom/server), who can open the page, and the whole
// editor flow end to end through the REAL Phase 5-3 route handlers
// (against the same fake PostgREST world as the route tests — no real
// database). Interaction logic itself is covered in attendanceEditor.test.ts.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.TEAM_MEMBER_PEPPER        = "fake-member-pepper";
process.env.TEAM_COACH_PEPPER         = "fake-coach-pepper";
process.env.ELF_ACCOUNT_PEPPER        = "fake-account-pepper";

register(new URL("./testSupport/uiLoader.mjs", import.meta.url).href, import.meta.url);

const { createElement } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { default: AttendanceScreen, ROW_RENDER_LIMIT } = await import("./AttendanceScreen.tsx");
const { default: AttendancePage } = await import("./page.tsx");
const { default: AttendanceView } = await import("./AttendanceView.tsx");
const { RedirectSignal } = await import("./testSupport/nextNavigationStub.mjs");
const E = await import("./attendanceEditor.ts");
const { createAttendanceApi } = await import("./attendanceApi.ts");
const F = await import("./testSupport/fixtures.mjs");
const W = await import("../../../api/team/[slug]/attendance/testSupport/attendanceWorld.mjs");

type State = ReturnType<typeof E.initialEditorState>;
type Action = Parameters<typeof E.editorReducer>[1];
type Op = Extract<Action, { type: "edit" }>["edit"];

const run = (s: State, ...a: Action[]) => a.reduce(E.editorReducer, s);
const edit = (s: State, ...ops: Op[]) => run(s, ...ops.map(o => ({ type: "edit", edit: o }) as Action));

function ready(date: string, rows: unknown[], opts: Record<string, unknown> = {}) {
  const s = run(E.initialEditorState(date), { type: "list_loaded", value: F.sessionList() });
  return run(s, { type: "date_loaded", seq: (s.load as { seq: number }).seq, view: F.dateView(date, rows, opts) });
}

const noop = () => {};
const actions = {
  selectDate: noop, reload: noop, retryList: noop, edit: noop, save: noop, search: noop, filter: noop,
  showAttention: noop, stay: noop, discard: noop, dismissMerge: noop,
};
function html(state: State) {
  return renderToStaticMarkup(createElement(AttendanceScreen, { slug: "wolves", teamName: "Wolves High Track", state, dirty: E.isDirty(state), actions }));
}
const count = (s: string, needle: string | RegExp) => (typeof needle === "string" ? s.split(needle).length - 1 : (s.match(new RegExp(needle, "g")) ?? []).length);
const text = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");

// ── Rendering ─────────────────────────────────────────────────────────────

test("new session: header, Draft status, every athlete defaulting to Present, Save Draft available", () => {
  const out = html(ready(F.TODAY, F.newRoster()));
  const t = text(out);
  assert.match(out, /<h1[^>]*>Attendance<\/h1>/);
  assert.match(t, /Wolves High Track/);
  assert.match(t, /Draft · not saved yet/);
  assert.match(t, /Tuesday, October 20, 2026 \(today\)/);
  assert.match(out, /href="\/team\/wolves\/team\?tab=roster"[^>]*>.*?Roster<\/a>/, "back to this team's roster tab");
  assert.equal(count(out, /<input(?=[^>]*value="present")(?=[^>]*checked="")[^>]*>/), 5);
  assert.equal(count(out, /value="absent"/), 5);
  assert.match(t, /Attendance for Ava Adams/, "each athlete's choice has an accessible name");
  assert.match(t, /No grade set/, "an athlete with no class year");
  assert.match(out, /<button type="button"[^>]*>Save Draft<\/button>/);
  assert.doesNotMatch(out, /disabled=""[^>]*>Save Draft/);
  assert.match(t, /Not saved yet/);
  assert.match(t, /Attendance 100%/);
});

test("absent without a reason: reason choices, a helpful message, stronger after a save attempt", () => {
  let s = edit(ready(F.TODAY, F.newRoster()), { op: "absent", athleteId: F.A(2) });
  let out = html(s);
  assert.match(text(out), /Reason \(required\)/);
  assert.equal(count(out, /name="[^"]*-reason"/), 3);
  assert.match(text(out), /Choose Excused, Unexcused, or Other\./);
  assert.match(out, /warnText/);
  assert.match(text(out), /Unsaved changes \(1 athlete\)/);
  assert.match(text(out), /1 absent athlete needs a reason/);
  const built = E.prepareSave(s)!;
  assert.ok(!built.ok);
  if (!built.ok) s = run(s, { type: "save_blocked", issues: built.issues });
  out = html(s);
  assert.match(out, /role="alert"[^>]*>Choose Excused/);
  // The reason group points at the message (screen readers read it with the choices).
  const errId = /<p id="([^"]+)"[^>]*role="alert"[^>]*>Choose Excused/.exec(out)![1];
  assert.match(out, new RegExp(`<fieldset[^>]*aria-describedby="${errId}"[^>]*><legend[^>]*>Reason \\(required\\)`));
  assert.match(text(out), /1 athlete needs attention before saving/);
  assert.match(text(out), /Not saved\. Fix the highlighted entries first\./);
});

test("notes: shown with a character count; Add note offered when empty", () => {
  let s = edit(ready(F.TODAY, F.newRoster()), { op: "absent", athleteId: F.A(1) }, { op: "reason", athleteId: F.A(1), reason: "excused" });
  assert.match(text(html(s)), /Add note/);
  s = edit(s, { op: "note", athleteId: F.A(1), note: "Dentist" });
  const out = html(s);
  assert.match(out, /<textarea[^>]*>Dentist<\/textarea>/);
  assert.match(text(out), /Note \(optional\) 7 \/ 500/);
  assert.match(out, /<label for="[^"]+">Note \(optional\)<\/label>/);
});

test("read-only history: saved marks and notes, no controls, no Save Draft, reason shown", () => {
  const rows = F.newRoster().map((r: object, i: number) => (i === 1 ? F.saved(r, 2, "absent", "unexcused", F.SECRET_NOTE) : F.saved(r, i + 1, "present")));
  const out = html(ready("2026-09-01", rows, { editability: "date_not_editable", session: F.session("2026-09-01", 4, { present: 4, absent: 1, unexcused: 1 }, { editable: false }) }));
  const t = text(out);
  assert.match(t, /Read-only/);
  assert.match(t, /more than 14 days ago, so its attendance is read-only/);
  assert.match(t, /Absent · Unexcused/);
  assert.match(t, new RegExp(F.SECRET_NOTE), "coach-only notes are shown to coaches");
  assert.doesNotMatch(out, /type="radio"/);
  assert.doesNotMatch(out, /<textarea/);
  assert.doesNotMatch(t, /Save Draft/);
  assert.match(t, /Attendance 80%/);
});

test("read-only: an athlete without a saved record shows Not recorded — never a default Present", () => {
  const rows = F.newRoster().map((r: object, i: number) => (i === 4 ? r : F.saved(r, i + 1, "present")));
  const out = html(ready("2026-09-01", rows, { editability: "date_not_editable", session: F.session("2026-09-01", 1, { present: 4 }, { editable: false }) }));
  assert.match(text(out), /Eli Evans Junior Not recorded/);
  assert.equal(count(text(out), /Not recorded/), 1);
});

test("an old date with nothing saved: No Attendance Recorded, no roster and no totals", () => {
  const out = html(ready("2026-09-01", F.newRoster(), { editability: "date_not_editable" }));
  const t = text(out);
  assert.match(t, /No Attendance Recorded/);
  assert.doesNotMatch(out, /data-athlete-row/);
  assert.doesNotMatch(t, /Present/);
  assert.doesNotMatch(t, /Save Draft/);
});

test("loading, and a failed first load, are clear states (never a blank screen)", () => {
  assert.match(html(E.initialEditorState()), /aria-busy="true"/);
  const failed = run(E.initialEditorState(), { type: "list_failed", failure: "unauthorized" });
  const t = text(html(failed));
  assert.match(t, /Attendance couldn't be loaded/);
  assert.match(t, /Your session has ended\. Sign in again to take attendance\./);
  assert.match(t, /Try again/);
});

test("a future date shows that attendance can't be taken yet", () => {
  const out = html(ready("2026-10-25", F.newRoster(), { editability: "date_in_future" }));
  assert.match(text(out), /This date hasn't happened yet/);
  assert.doesNotMatch(out, /data-athlete-row/);
});

test("late-added athletes: clearly separated with explicit Include actions; removed athletes read-only with snapshots", () => {
  const gone = { ...F.saved(F.row(9, "Gus Gone", { class_year: "Senior" }), 9, "absent", "excused"), athlete_id: null, on_roster: false };
  const rows = [F.saved(F.row(1, "Ava Adams"), 1, "present"), F.row(6, "Fay Fox", { added_after_session_date: true, requires_decision: true }), gone];
  const out = html(ready("2026-10-15", rows, { session: F.session("2026-10-15", 1, { present: 1, removed: 1 }) }));
  const t = text(out);
  assert.match(t, /Added after this date \(1\)/);
  assert.match(t, /Include as Present/);
  assert.match(t, /Include as Absent/);
  assert.match(t, /No longer on the roster \(1\)/);
  assert.match(t, /Gus Gone Senior No longer on roster Absent · Excused/);
  // Only Ava has controls.
  assert.equal(count(out, /value="present"/), 1);
  assert.match(t, /1 saved record for athletes no longer on the roster \(not counted\)/);
});

test("conflicts: both versions shown in full, Keep mine / Use latest saved, row locked until chosen", () => {
  const base = F.newRoster().map((r: object, i: number) => F.saved(r, i + 1, "present"));
  let s = ready(F.TODAY, base, { session: F.session(F.TODAY, 1, { present: 5 }) });
  s = edit(s, { op: "absent", athleteId: F.A(3) }, { op: "reason", athleteId: F.A(3), reason: "other" }, { op: "note", athleteId: F.A(3), note: "my note" });
  const draft = s.draft!;
  const theirs = F.dateView(F.TODAY, F.newRoster().map((r: object, i: number) => (i === 2 ? F.saved(r, 3, "absent", "unexcused", "their note", "Ari Asst") : F.saved(r, i + 1, "present"))), { session: F.session(F.TODAY, 2, { present: 4, absent: 1 }) });
  s = run(s, { type: "save_started", draft }, { type: "save_finished", draft, outcome: { kind: "reloaded", cause: "conflict", view: theirs } });
  const out = html(s);
  const t = text(out);
  assert.match(t, /Another coach saved this attendance while you were editing/);
  assert.match(t, /Choose which version to keep \(1\)/);
  assert.match(t, /Your version Absent · Other Note: my note/);
  assert.match(t, /Latest saved \(Ari Asst\) Absent · Unexcused Note: their note/);
  assert.match(t, /Keep mine/);
  assert.match(t, /Use latest saved/);
  assert.match(t, /Choose a version for each conflict to save/);
  assert.match(out, /disabled=""[^>]*>Save Draft/);
  assert.match(out, /<fieldset[^>]*disabled=""[^>]*><legend[^>]*>Attendance for Cy Clark/, "the conflicted row is locked");
});

test("filters: the list says what's hidden and that saving still includes everyone", () => {
  let s = edit(ready(F.TODAY, F.newRoster()), { op: "absent", athleteId: F.A(2) }, { op: "reason", athleteId: F.A(2), reason: "excused" });
  s = run(s, { type: "filter", value: "absent" });
  const out = html(s);
  assert.match(text(out), /Showing 1 of 5 athletes\. Filters only change what's shown — Save Draft always saves every athlete\./);
  assert.match(out, /aria-pressed="true"[^>]*>Absent/);
  assert.equal(count(out, /data-athlete-row=/), 1);
  assert.match(out, /<label for="att-search"[^>]*>Search athletes<\/label>/);
});

test("saving: controls disabled and the button says Saving…; never 'Saved' before the server confirms", () => {
  const s0 = edit(ready(F.TODAY, F.newRoster()), { op: "absent", athleteId: F.A(1) }, { op: "reason", athleteId: F.A(1), reason: "other" });
  const s = run(s0, { type: "save_started", draft: s0.draft! });
  const out = html(s);
  assert.match(out, /disabled=""[^>]*>Saving…<\/button>/);
  assert.equal(count(out, /<fieldset[^>]*disabled=""/), count(out, /<fieldset/));
  // ("Saved attendance" is the history panel's heading.)
  assert.doesNotMatch(text(out), /Saved(?! attendance)/);
});

test("class tabs: the roster's tab row with real counts, All Athletes selected, grouped headings in class order", () => {
  const rows = [
    F.row(1, "Zed Senior", { class_year: "Senior" }), F.row(2, "Al Fresh", { class_year: "Freshman" }),
    F.row(3, "Jo Junior", { class_year: "Junior" }), F.row(4, "Bo Fresh", { class_year: "Freshman" }),
    F.row(5, "Ned None", { class_year: null }),
  ];
  const out = html(ready(F.TODAY, rows));
  assert.match(out, /role="tablist" aria-label="Show athletes by class" class="gradeTabs"/, "the shared, horizontally scrolling tab row");
  const tabs = [...out.matchAll(/role="tab"[^>]*aria-selected="(true|false)"[^>]*>.*?<span>([^<]+)<\/span><span class="gradeTabCount">(\d+)<\/span>/g)].map(m => [m[2], m[3], m[1]]);
  assert.deepEqual(tabs, [["All Athletes", "5", "true"], ["Freshman", "2", "false"], ["Junior", "1", "false"], ["Senior", "1", "false"], ["No grade set", "1", "false"]]);
  assert.match(out, /id="att-class-panel" role="tabpanel" aria-labelledby="att-class-tab-all"/);
  const headings = [...out.matchAll(/<h3[^>]*class="classHeading"[^>]*>([^<]+) <span[^>]*>\((\d+)\)<\/span><\/h3>/g)].map(m => `${m[1]} ${m[2]}`);
  assert.deepEqual(headings, ["Freshman 2", "Junior 1", "Senior 1", "No grade set 1"]);
  const names = [...out.matchAll(/class="athleteName">([^<]+)</g)].map(m => m[1]);
  assert.deepEqual(names, ["Al Fresh", "Bo Fresh", "Jo Junior", "Zed Senior", "Ned None"]);
});

test("one class selected: only that class, no headings, and the reminder that saving includes everyone", () => {
  const rows = [F.row(1, "Zed Senior", { class_year: "Senior" }), F.row(2, "Al Fresh", { class_year: "Freshman" }), F.row(3, "Amy Senior", { class_year: "Senior" })];
  const s = run(ready(F.TODAY, rows), { type: "grade", value: "grade:Senior" });
  const out = html(s);
  assert.match(out, /aria-selected="true"[^>]*><span[^>]*><span>Senior<\/span>/);
  assert.doesNotMatch(out, /class="classHeading"/);
  assert.deepEqual([...out.matchAll(/class="athleteName">([^<]+)</g)].map(m => m[1]), ["Amy Senior", "Zed Senior"]);
  assert.match(text(out), /Showing 2 of 3 athletes\. Filters only change what's shown — Save Draft always saves every athlete\./);
});

test("the reused roster tab row scrolls horizontally with 44px touch targets", () => {
  const css = readFileSync(new URL("../team/Team.module.css", import.meta.url), "utf8");
  assert.match(css, /\.gradeTabs \{[^}]*overflow-x: auto/);
  assert.match(css, /\.gradeTab \{[^}]*min-height: 44px/);
});

test("Stay / Discard dialog: an accessible alert dialog that says nothing was saved", () => {
  const s = run(edit(ready(F.TODAY, F.newRoster()), { op: "absent", athleteId: F.A(1) }), { type: "select_date", date: "2026-10-19" });
  const out = html(s);
  assert.match(out, /role="alertdialog" aria-modal="true"/);
  assert.match(text(out), /Discard unsaved attendance\?/);
  assert.match(text(out), /haven't been saved\. If you switch to Monday, October 19, 2026, they'll be lost\./);
  assert.match(text(out), /Stay/);
  assert.match(text(out), /Discard changes/);
});

test("large rosters render in a bounded first batch with an explicit Show all (never silently cut)", () => {
  const rows = Array.from({ length: ROW_RENDER_LIMIT + 50 }, (_, i) => F.row(i + 1, `Athlete ${String(i + 1).padStart(4, "0")}`));
  const out = html(ready(F.TODAY, rows));
  assert.equal(count(out, /data-athlete-row=/), ROW_RENDER_LIMIT);
  assert.match(text(out), new RegExp(`Showing the first ${ROW_RENDER_LIMIT} of ${ROW_RENDER_LIMIT + 50} athletes\\. Show all ${ROW_RENDER_LIMIT + 50}`));
});

test("accessibility basics: labelled radios, legends, typed buttons, no positive tabindex, polite status", () => {
  const out = html(edit(ready(F.TODAY, F.newRoster()), { op: "absent", athleteId: F.A(1) }));
  // Every radio sits inside its label.
  const radios = count(out, /<input type="radio"/);
  assert.equal(count(out, /<label class="[^"]*choice[^"]*"><input type="radio"/), radios);
  assert.equal(count(out, /<legend/), count(out, /<fieldset/));
  assert.equal(count(out, /<button(?![^>]*type="button")/), 0, "every button is type=button (no accidental submits)");
  assert.doesNotMatch(out, /tabindex="[1-9]/);
  assert.match(out, /id="att-save-status"[^>]*role="status"[^>]*aria-live="polite"/);
});

test("mobile and desktop layout rules (CSS)", () => {
  const css = readFileSync(new URL("./Attendance.module.css", import.meta.url), "utf8");
  assert.match(css, /@media screen and \(min-width: 1024px\)/, "the shell's single desktop breakpoint");
  assert.match(css, /\.saveBar \{\s*position: sticky;\s*bottom: calc\(4rem \+ env\(safe-area-inset-bottom, 0px\)\)/, "Save above the bottom nav and home indicator");
  assert.match(css, /\.sideTop,\s*\.sideBottom \{\s*display: contents;/, "phone order keeps Save last and sticky");
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\) 340px/, "desktop: list plus a side column");
  assert.match(css, /\.choice \{[^}]*min-height: 48px/, "large touch targets");
  assert.match(css, /font-size: 16px/, "no iOS zoom on focus");
  assert.match(css, /overflow-wrap: anywhere/, "long names wrap instead of overflowing");
  assert.match(css, /safe-area-inset-top/, "dialog respects safe areas");
});

// ── Privacy ───────────────────────────────────────────────────────────────

test("no browser storage, no logging, no analytics in the attendance screen code", () => {
  const dir = new URL("./", import.meta.url);
  const files = ["AttendanceScreen.tsx", "AttendanceRow.tsx", "AttendancePanels.tsx", "AttendanceView.tsx", "page.tsx",
    "attendanceApi.ts", "attendanceEditor.ts", "attendanceFormat.ts", "unsavedChangesGuard.ts", "useAttendanceEditor.ts"];
  for (const f of files) {
    const code = readFileSync(new URL(f, dir), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(code, /localStorage|sessionStorage|indexedDB|IndexedDB/, `${f}: browser storage`);
    assert.doesNotMatch(code, /console\.(log|error|warn|info|debug)/, `${f}: logging`);
    assert.doesNotMatch(code, /analytics|gtag|posthog|track\(/i, `${f}: analytics`);
    assert.doesNotMatch(code, /setInterval|autosave/i, `${f}: no autosave`);
  }
});

test("the only entry point is the roster's Take Attendance (Phase 5-5): no nav or Home links", () => {
  const root = new URL("../", import.meta.url);
  for (const f of ["team/RosterTabs.tsx", "team/TeamTabs.tsx", "_components/TeamNav.tsx", "_components/desktopNavItems.ts", "_components/DesktopSidebar.tsx", "home/QuickActions.tsx"]) {
    assert.doesNotMatch(readFileSync(new URL(f, root), "utf8"), /attendance/i, f);
  }
});

test("with unsaved changes, the back link to the roster is guarded (Stay / Discard)", async () => {
  const { guardedNavigationTarget } = await import("./unsavedChangesGuard.ts");
  const out = html(edit(ready(F.TODAY, F.newRoster()), { op: "absent", athleteId: F.A(1) }));
  const href = /<a href="([^"]+)"[^>]*>.*?Roster<\/a>/.exec(out)![1];
  const click = { href, target: null, download: false, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false };
  assert.equal(guardedNavigationTarget(click, "https://app.test/team/wolves/attendance"), "/team/wolves/team?tab=roster");
});

// ── Who can open the page ─────────────────────────────────────────────────

async function openPage(w: { db: Record<string, unknown[]> }, date?: string) {
  w.db.campaign_settings = [{ campaign_slug: W.SLUG, school_name: "Wolves High", sport_name: "Track" }];
  return AttendancePage({ params: Promise.resolve({ slug: W.SLUG }), searchParams: Promise.resolve(date ? { date } : {}) });
}

test("Head Coach, Assistant Coach and platform admin get the attendance screen", async () => {
  for (const role of ["head", "assistant", "admin"]) {
    await W.withWorld(async (w: { db: Record<string, unknown[]>; requests: string[] }) => {
      W.ROLES[role]();
      const el = await openPage(w, "2026-10-18");
      assert.equal(el.type, AttendanceView, role);
      assert.deepEqual(el.props, { slug: W.SLUG, teamName: "Wolves High Track", initialDate: "2026-10-18" });
      assert.equal(w.requests.filter(r => r.includes("team_attendance")).length, 0, "the page itself reads no attendance");
    });
  }
});

test("boosters, parents, athletes and other teams' coaches get the coach-only notice; signed-out visitors go Home", async () => {
  for (const role of ["boosterCoach", "boosterMember", "parent", "athlete"]) {
    await W.withWorld(async (w: { db: Record<string, unknown[]> }) => {
      W.ROLES[role]();
      const el = await openPage(w);
      assert.notEqual(el.type, AttendanceView, role);
      const out = renderToStaticMarkup(el);
      assert.match(out, /Coach Access Only/, role);
      assert.doesNotMatch(out, /Ava Athlete|Ben Brown/, role);
    });
  }
  for (const role of ["nobody", "forged", "otherTeamHead"]) {
    await W.withWorld(async (w: { db: Record<string, unknown[]> }) => {
      W.ROLES[role]();
      await assert.rejects(openPage(w), (e: unknown) => e instanceof RedirectSignal && e.url === `/team/${W.SLUG}/home`, role);
    });
  }
});

test("a bad ?date is ignored (the server's today is used)", async () => {
  await W.withWorld(async (w: { db: Record<string, unknown[]> }) => {
    W.ROLES.head();
    const el = await openPage(w, "2026-02-30");
    assert.equal(el.props.initialDate, null);
  });
});

// ── End to end through the real Phase 5-3 routes ──────────────────────────

/** fetch for the screen's API client, served by the real route handlers. */
function appFetch() {
  return async (url: string, init: RequestInit = {}) => {
    const u = new URL(url, "http://test.local");
    const m = /^\/api\/team\/([^/]+)\/attendance(?:\/([^/]+))?$/.exec(u.pathname);
    assert.ok(m, url);
    const slug = decodeURIComponent(m[1]);
    if (!m[2]) return W.list(u.search, slug);
    if (init.method === "PUT") return W.put(m[2], undefined, { raw: String(init.body), slug });
    assert.equal(init.method, "GET");
    return W.load(m[2], slug);
  };
}

async function openEditor(api: ReturnType<typeof createAttendanceApi>, date?: string) {
  let s = E.initialEditorState(date ?? null);
  const listed = await api.listSessions();
  assert.ok(listed.ok);
  if (listed.ok) s = run(s, { type: "list_loaded", value: listed.value });
  const load = s.load as { kind: string; date: string; seq: number };
  const view = await api.loadDate(load.date);
  assert.ok(view.ok, "date loads");
  if (view.ok) s = run(s, { type: "date_loaded", seq: load.seq, view: view.value });
  return s;
}

async function save(api: ReturnType<typeof createAttendanceApi>, s: State) {
  const draft = s.draft!;
  const outcome = await E.runSave(api, draft);
  return run(s, { type: "save_started", draft }, { type: "save_finished", draft, outcome });
}

test("end to end: open today (nothing written), mark, Save Draft creates the session, the version advances", async () => {
  await W.withWorld(async (w: { saves: Record<string, unknown>[]; sessions: Map<string, Record<string, unknown>>; records: Map<string, Record<string, unknown>[]>; audit: unknown[] }) => {
    W.ROLES.head();
    const api = createAttendanceApi(W.SLUG, appFetch());
    let s = await openEditor(api);
    assert.equal(s.selectedDate, W.TODAY, "today from the database");
    assert.equal(w.saves.length, 0, "opening a date writes nothing");
    assert.deepEqual(E.attendanceMode(s), { kind: "draft", saved: false, version: 0 });

    s = edit(s, { op: "absent", athleteId: W.A(2) }, { op: "reason", athleteId: W.A(2), reason: "excused" }, { op: "note", athleteId: W.A(2), note: W.SECRET_NOTE });
    s = await save(api, s);
    assert.equal(s.save.kind, "saved");
    assert.equal(s.draft!.version, 1);
    assert.equal(E.isDirty(s), false);
    assert.equal(w.saves.length, 1);
    const recs = w.records.get(`${W.SLUG}|${W.TODAY}`)!;
    assert.equal(recs.length, 3, "every athlete saved");
    assert.deepEqual(recs.find(r => r.athlete_id === W.A(2)), { id: recs.find(r => r.athlete_id === W.A(2))!.id, athlete_id: W.A(2), status: "absent", absence_reason: "excused", note: W.SECRET_NOTE });
    assert.doesNotMatch(JSON.stringify(w.audit), new RegExp(W.SECRET_NOTE), "audit has counts only");

    // A second save uses the new version.
    s = edit(s, { op: "present", athleteId: W.A(2) });
    s = await save(api, s);
    assert.equal(s.draft!.version, 2);
    assert.equal(w.saves[1].p_expected_version, 1);
  });
});

test("end to end: two coaches — the second save merges instead of overwriting, then saves on the new version", async () => {
  await W.withWorld(async (w: { saves: Record<string, unknown>[]; records: Map<string, Record<string, unknown>[]> }) => {
    W.ROLES.head();
    const api = createAttendanceApi(W.SLUG, appFetch());
    let first = await openEditor(api);
    let second = await openEditor(api);

    first = edit(first, { op: "absent", athleteId: W.A(1) }, { op: "reason", athleteId: W.A(1), reason: "unexcused" });
    first = await save(api, first);
    assert.equal(first.draft!.version, 1);

    second = edit(second,
      { op: "absent", athleteId: W.A(1) }, { op: "reason", athleteId: W.A(1), reason: "excused" },
      { op: "absent", athleteId: W.A(3) }, { op: "reason", athleteId: W.A(3), reason: "other" });
    second = await save(api, second);
    assert.equal(w.saves.length, 2, "the stale save reached the database and was refused");
    assert.equal(second.draft!.version, 1, "merged onto the latest version");
    assert.deepEqual(Object.keys(second.draft!.conflicts), [W.A(1)]);
    assert.equal(E.saveAvailability(second).enabled, false);
    // Nothing of the first coach's was overwritten.
    assert.equal(w.records.get(`${W.SLUG}|${W.TODAY}`)!.find(r => r.athlete_id === W.A(1))!.absence_reason, "unexcused");

    second = edit(second, { op: "resolve", key: W.A(1), choice: "theirs" });
    second = await save(api, second);
    assert.equal(second.save.kind, "saved");
    assert.equal(second.draft!.version, 2);
    assert.equal(w.saves[2].p_expected_version, 1);
    const recs = w.records.get(`${W.SLUG}|${W.TODAY}`)!;
    assert.equal(recs.find(r => r.athlete_id === W.A(1))!.absence_reason, "unexcused", "the other coach's choice kept");
    assert.equal(recs.find(r => r.athlete_id === W.A(3))!.absence_reason, "other", "this coach's safe change saved");
  });
});

test("end to end: read-only and future dates write nothing; a booster's API calls are refused", async () => {
  await W.withWorld(async (w: { saves: unknown[] }) => {
    W.ROLES.head();
    const api = createAttendanceApi(W.SLUG, appFetch());
    const old = await openEditor(api, "2026-09-01");
    assert.deepEqual(E.attendanceMode(old), { kind: "read_only", reason: "date_not_editable" });
    assert.deepEqual(E.attendanceSummary(old), { kind: "no_data", reason: "not_recorded" });
    const future = await openEditor(api, "2026-10-25");
    assert.deepEqual(E.attendanceSummary(future), { kind: "no_data", reason: "future" });
    assert.equal(w.saves.length, 0);

    W.ROLES.boosterCoach();
    assert.deepEqual(await api.listSessions(), { ok: false, failure: "forbidden" });
    assert.deepEqual(await api.loadDate(W.TODAY), { ok: false, failure: "forbidden" });
    W.ROLES.nobody();
    assert.deepEqual(await api.loadDate(W.TODAY), { ok: false, failure: "unauthorized" });
  });
});

test("end to end: a late-added athlete must be explicitly included; the confirmation reaches the database", async () => {
  await W.withWorld(async (w: { db: Record<string, Record<string, unknown>[]>; saves: Record<string, unknown>[] }) => {
    W.ROLES.head();
    w.db.athletes.push({ id: W.A(5), campaign_slug: W.SLUG, name: "Lee Late", class_year: "Freshman", added_on: "2026-10-19" });
    const api = createAttendanceApi(W.SLUG, appFetch());
    let s = await openEditor(api, "2026-10-17");
    assert.deepEqual(E.attendanceListView(s)!.pendingLate.map(e => e.name), ["Lee Late"]);
    s = await save(api, s);
    assert.equal(s.save.kind, "saved");
    assert.ok(!(w.saves[0].p_records as { athlete_id: string }[]).some(r => r.athlete_id === W.A(5)), "not saved without a decision");

    s = edit(s, { op: "include_late", athleteId: W.A(5), status: "absent" }, { op: "reason", athleteId: W.A(5), reason: "excused" });
    s = await save(api, s);
    assert.equal(s.save.kind, "saved");
    const lee = (w.saves[1].p_records as Record<string, unknown>[]).find(r => r.athlete_id === W.A(5));
    assert.equal(lee!.confirm_added_after_date, true);
    assert.equal(s.draft!.entries.find(e => e.athleteId === W.A(5))!.kind, "late_included");
  });
});

test("end to end: with a class tab, filter and search active, Save Draft sends the whole eligible roster", async () => {
  await W.withWorld(async (w: { saves: Record<string, unknown>[] }) => {
    W.ROLES.head();
    const api = createAttendanceApi(W.SLUG, appFetch());
    let s = await openEditor(api);
    s = edit(s, { op: "absent", athleteId: W.A(2) }, { op: "reason", athleteId: W.A(2), reason: "other" });
    s = run(s, { type: "grade", value: "grade:Senior" }, { type: "filter", value: "present" }, { type: "search", value: "ava" });
    assert.equal(E.attendanceListView(s)!.visible.length, 1);
    s = await save(api, s);
    assert.equal(s.save.kind, "saved");
    const sent = w.saves[0].p_records as { athlete_id: string; status: string }[];
    assert.deepEqual(sent.map(r => r.athlete_id).sort(), [W.A(1), W.A(2), W.A(3)]);
    assert.equal(sent.find(r => r.athlete_id === W.A(2))!.status, "absent");
    assert.equal(s.grade, "grade:Senior", "the view stays where the coach was");
  });
});
