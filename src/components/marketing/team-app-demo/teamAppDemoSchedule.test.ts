// Team App demo, Phase 3 — Calendar, Team roster and Attendance.
//
//   • Generated twins are byte-for-byte the real components apart from
//     their import lines (re-generated here and compared).
//   • The REAL attendance editor (reducer, prepareSave, runSave, draft
//     rules) runs against the demo's in-memory AttendanceApi: date window,
//     future dates, required absence reasons, versions, server validation.
//   • Roles: only coaches get Take Attendance and the attendance screen;
//     athletes and parents see the read-only Attendance card for their own
//     athlete, never notes; only staff add/edit events.
//   • The demo season: realistic, fictional, dated in the team's time zone.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TWINS, generateTwin } from "../../../../scripts/marketing/generate-team-app-demo-twins.mjs";
import {
  editorReducer, initialEditorState, prepareSave, runSave, entryProblems, type EditorState, type EditorAction,
} from "../../../app/team/[slug]/attendance/attendanceEditor.ts";
import { ATTENDANCE_EDIT_WINDOW_DAYS, canViewAttendance } from "../../../lib/teamAttendance.ts";
import { canViewAthleteAttendance } from "../../../lib/athleteAttendance.ts";
import { takeAttendanceHref, rosterPath } from "../../../app/team/[slug]/team/takeAttendance.ts";
import { isStaff } from "../../../lib/permissions.ts";
import { DEMO_ACTORS, DEMO_ROSTER, DEMO_SLUG, JORDAN_ELLIS_ID, PRACTICE_WEEKDAYS, addDaysISO, buildDemoEvents, demoTodayISO, upcomingFrom, weekdayISO } from "./demoData.ts";
import { buildDemoAttendanceDb, createDemoAttendanceApi, demoAthleteAttendance, type DemoAttendanceDb } from "./attendanceData.ts";
import { demoRouteForHref } from "./demoProtocol.ts";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const D = "src/components/marketing/team-app-demo";
const T = "src/app/team/[slug]";
const NOW = new Date("2026-10-30T20:00:00Z");   // Friday Oct 30, 1 PM in Arizona
const TODAY = demoTodayISO(NOW);

// ── Generated twins ─────────────────────────────────────────────────────────

for (const twin of TWINS) {
  test(`twin ${twin.to.split("/").pop()} is the real ${twin.from.split("/").pop()} with only its imports changed`, () => {
    const real = read(twin.from);
    const committed = read(twin.to);
    assert.equal(committed, generateTwin(twin, real), "re-run scripts/marketing/generate-team-app-demo-twins.mjs");
    const body = (s: string) => s.split("\n").filter((l) => !/^\s*(import\s|\}\s*from\s|\/\/ GENERATED|\/\/ Identical)/.test(l) && !/^\s+[\w, {}]+,?$/.test(l) || false);
    const nonImport = (s: string) => s.replace(/^import\s[\s\S]*?from\s+["'][^"']+["'];?$/gm, "").replace(/^\/\/ (GENERATED|Identical).*$/gm, "").replace(/^\/\* eslint-disable @next\/next\/no-img-element .*\*\/$/gm, "");
    assert.equal(nonImport(committed).replace(/\n+/g, "\n"), nonImport(real.replace(/\r\n/g, "\n")).replace(/\n+/g, "\n"));
    assert.ok(!/from "next\/(link|navigation)"/.test(committed), "no Next.js routing");
    assert.ok(body(committed).length > 0);
  });
}

// ── Attendance: the real editor against the demo API ────────────────────────

function setup() {
  let db: DemoAttendanceDb = buildDemoAttendanceDb(NOW);
  const api = createDemoAttendanceApi(db, (next) => { db = next; }, () => NOW);
  return { api, db: () => db };
}

async function openDate(api: ReturnType<typeof setup>["api"], date?: string): Promise<EditorState> {
  let s = initialEditorState(null);
  const step = (a: EditorAction) => { s = editorReducer(s, a); };
  const list = await api.listSessions();
  assert.ok(list.ok);
  step({ type: "list_loaded", value: list.value });
  if (date) step({ type: "select_date", date });
  assert.equal(s.load.kind, "loading");
  const load = s.load as { kind: "loading"; date: string; seq: number };
  const view = await api.loadDate(load.date);
  assert.ok(view.ok);
  step({ type: "date_loaded", seq: load.seq, view: view.value });
  return s;
}

test("attendance: opens on the team's today, with every Sunridge athlete and an editable draft", async () => {
  const { api } = setup();
  const s = await openDate(api);
  assert.equal(s.selectedDate, TODAY);
  assert.ok(s.draft?.editability.editable);
  assert.deepEqual(s.draft!.entries.map((e) => e.name).sort(), DEMO_ROSTER.map((a) => a.name).sort());
});

test("attendance: today and the previous 14 days are editable; older is read-only; the future can't be taken", async () => {
  const { api } = setup();
  const day = async (d: string) => { const v = await api.loadDate(d); assert.ok(v.ok); return v.value.editability; };
  assert.equal(await day(TODAY), "editable");
  assert.equal(await day(addDaysISO(TODAY, -ATTENDANCE_EDIT_WINDOW_DAYS)), "editable");
  assert.equal(await day(addDaysISO(TODAY, -ATTENDANCE_EDIT_WINDOW_DAYS - 1)), "date_not_editable");
  assert.equal(await day(addDaysISO(TODAY, 1)), "date_in_future");
  // The real editor refuses a future date as soon as it's picked.
  const opened = await openDate(api);
  const picked = editorReducer(opened, { type: "select_date", date: addDaysISO(TODAY, 3) });
  assert.equal(picked.dateError, "future");
  assert.equal(picked.selectedDate, TODAY);
  const saved = await api.save({ sessionDate: addDaysISO(TODAY, 1), expectedVersion: 0, records: [] });
  assert.deepEqual(saved, { ok: false, failure: { kind: "read_only", reason: "date_in_future" } });
  const old = await api.save({ sessionDate: addDaysISO(TODAY, -20), expectedVersion: 1, records: [] });
  assert.deepEqual(old, { ok: false, failure: { kind: "read_only", reason: "date_not_editable" } });
  const list = await api.listSessions();
  assert.ok(list.ok);
  assert.equal(list.value.editableFrom, addDaysISO(TODAY, -14));
  assert.equal(list.value.editableTo, TODAY);
});

test("attendance: an absence needs a reason before Save Draft; then the real runSave saves it (locally)", async () => {
  const { api, db } = setup();
  let s = await openDate(api);
  const step = (a: EditorAction) => { s = editorReducer(s, a); };
  const owen = s.draft!.entries.find((e) => e.name === "Owen Patel")!;
  step({ type: "edit", edit: { op: "absent", athleteId: owen.athleteId! } as never });
  const blocked = prepareSave(s);
  assert.ok(blocked && !blocked.ok, "absent without a reason can't be saved");
  assert.deepEqual(entryProblems(s.draft!, s.draft!.entries.find((e) => e.name === "Owen Patel")!), ["reason_required"]);
  step({ type: "edit", edit: { op: "reason", athleteId: owen.athleteId!, reason: "excused" } as never });
  const ready = prepareSave(s);
  assert.ok(ready && ready.ok);
  const outcome = await runSave(api, s.draft!);
  assert.equal(outcome.kind, "saved");
  const session = db().sessions[TODAY];
  assert.equal(session.version, 1);
  assert.equal(session.records[owen.athleteId!].status, "absent");
  assert.equal(session.records[owen.athleteId!].absenceReason, "excused");
});

test("attendance: the server's validation runs on every save (reason required), and stale versions conflict", async () => {
  const { api } = setup();
  const athleteId = DEMO_ROSTER[0].id;
  const noReason = await api.save({ sessionDate: TODAY, expectedVersion: 0, records: [{ athlete_id: athleteId, status: "absent", absence_reason: null, note: null }] });
  assert.ok(!noReason.ok && noReason.failure.kind === "invalid_records");
  const ok = await api.save({ sessionDate: TODAY, expectedVersion: 0, records: [{ athlete_id: athleteId, status: "present", absence_reason: null, note: null }] });
  assert.ok(ok.ok && ok.value.created && ok.value.version === 1);
  const stale = await api.save({ sessionDate: TODAY, expectedVersion: 0, records: [{ athlete_id: athleteId, status: "present", absence_reason: null, note: null }] });
  assert.deepEqual(stale, { ok: false, failure: { kind: "conflict" } });
});

test("attendance: a realistic season — saved practices inside and outside the 14-day window, totals from the app's own maths", async () => {
  const { api } = setup();
  const list = await api.listSessions({ from: addDaysISO(TODAY, -365), to: TODAY });
  assert.ok(list.ok);
  const sessions = list.value.sessions;
  assert.equal(sessions.length, 9, "three practices a week for three weeks");
  assert.ok(sessions.every((s) => PRACTICE_WEEKDAYS.includes(weekdayISO(s.sessionDate)) && s.sessionDate < TODAY));
  assert.ok(sessions.some((s) => s.editable) && sessions.some((s) => !s.editable));
  assert.ok(sessions.every((s) => s.totals.total === DEMO_ROSTER.length && s.totals.reasonMissing === 0));
  assert.equal(sessions[0].totals.absent, 2);
  assert.equal(sessions[0].totals.presentPercent, 80);
});

test("attendance: athletes and parents never get the coach screen — only their athlete's read-only absences, without notes", () => {
  assert.deepEqual(["coach", "athlete", "parent"].map((r) => canViewAttendance(DEMO_ACTORS[r as "coach"])), [true, false, false]);
  assert.equal(takeAttendanceHref(DEMO_SLUG, DEMO_ACTORS.coach), `/team/${DEMO_SLUG}/attendance`);
  assert.equal(takeAttendanceHref(DEMO_SLUG, DEMO_ACTORS.athlete), null);
  assert.equal(takeAttendanceHref(DEMO_SLUG, DEMO_ACTORS.parent), null);
  assert.equal(canViewAthleteAttendance(DEMO_ACTORS.athlete, JORDAN_ELLIS_ID, []), true);
  assert.equal(canViewAthleteAttendance(DEMO_ACTORS.parent, JORDAN_ELLIS_ID, [JORDAN_ELLIS_ID]), true);
  assert.equal(canViewAthleteAttendance(DEMO_ACTORS.athlete, DEMO_ROSTER[0].id, []), false);
  const card = demoAthleteAttendance(buildDemoAttendanceDb(NOW), JORDAN_ELLIS_ID);
  assert.ok(card.ok);
  assert.equal(card.summary.absences.length, 2);
  assert.ok(!JSON.stringify(card).includes("Dentist"), "notes are private to coaches");
  // The shell only mounts the attendance screen for coaches.
  assert.match(read(`${D}/TeamAppDemo.tsx`), /route\.screen === "attendance" \? \(\s*actor\.kind === "coach" && attendanceApi\s*\? <DemoAttendance/);
  // The member profile shows the card only when the app's rule allows it.
  assert.match(read(`${D}/DemoTeam.tsx`), /canViewAthleteAttendance\(actor, athleteId, demoLinkedAthleteIds\(actor\)\)/);
});

test("attendance: unsaved changes ask before leaving (the real LeaveDialog), without touching browser history", () => {
  const src = code(read(`${D}/DemoAttendance.tsx`));
  assert.match(src, /if \(!dirty\) return;/);
  assert.match(src, /dispatch\(\{ type: "request_leave", to: \{ kind: "href", href: a\.getAttribute\("href"\) \?\? "" \} \}\)/);
  assert.ok(!/history\.|beforeunload|useUnsavedChangesGuard|next\/navigation/.test(src));
  // Mirrors the real hook's load/save flow.
  const real = code(read(`${T}/attendance/useAttendanceEditor.ts`));
  for (const line of ["const year = await api.listSessions({ from: addCalendarDays(today, -HISTORY_DAYS), to: today });", "const outcome = await runSave(api, draft);", "if (!built.ok) { dispatch({ type: \"save_blocked\", issues: built.issues }); return; }"]) {
    assert.ok(real.includes(line) && src.includes(line), line);
  }
  assert.equal(rosterPath(DEMO_SLUG), `/team/${DEMO_SLUG}/team?tab=roster`);
});

// ── Routes ──────────────────────────────────────────────────────────────────

test("routes: Team → Roster → Take Attendance, profiles and the rest map to demo screens like the app's routes", () => {
  const r = (href: string) => { const x = demoRouteForHref(href); return x && `${x.tab}/${x.screen}${x.search ? "?" + x.search : ""}${x.athleteId ? "#" + x.athleteId.slice(-2) : ""}`; };
  assert.equal(r(`/team/${DEMO_SLUG}/team?tab=roster`), "team/main?tab=roster");
  assert.equal(r(`/team/${DEMO_SLUG}/attendance`), "team/attendance");
  assert.equal(r(`/team/${DEMO_SLUG}/athlete/${JORDAN_ELLIS_ID}`), "team/athlete#02");
  assert.equal(r(`/team/${DEMO_SLUG}/team/${JORDAN_ELLIS_ID}`), "team/coach-athlete#02");
  assert.equal(r(`/team/${DEMO_SLUG}/calendar`), "calendar/main");
  assert.equal(r(`/team/${DEMO_SLUG}/messages`), "communications/main");
  assert.equal(r(`/team/${DEMO_SLUG}/requests`), null);
  assert.equal(r("https://maps.google.com/?q=Comets"), null);
  // The bottom nav highlights nothing on /attendance or /athlete/<id>, like the app.
  assert.match(read(`${D}/TeamAppDemo.tsx`), /const activeNav = openThreadId \|\| route\.screen === "attendance" \|\| route\.screen === "athlete" \? "" : tab;/);
});

// ── Calendar ────────────────────────────────────────────────────────────────

test("calendar: a realistic fictional season around today — practices, film, games, a fundraiser and a team dinner", () => {
  const events = buildDemoEvents(NOW);
  assert.ok(events.length >= 25);
  const types = new Set(events.map((e) => e.type));
  for (const t of ["practice", "team", "fundraiser"]) assert.ok(types.has(t as never), t);
  assert.ok(events.some((e) => e.event_date < TODAY) && events.some((e) => e.event_date > TODAY));
  assert.deepEqual(events.map((e) => e.event_date + e.start_time), [...events.map((e) => e.event_date + e.start_time)].sort());
  const games = events.filter((e) => e.title.startsWith("Game vs."));
  assert.equal(games.length, 5);
  assert.ok(games.every((g) => weekdayISO(g.event_date) === 5), "Friday night games");
  for (const name of ["Cinder Peak Panthers", "Copper Hollow Miners", "Saguaro Flats Falcons", "Mesa Ridge Rattlers", "Granite Pass Grizzlies"]) {
    assert.ok(games.some((g) => g.title.includes(name)), name);
  }
  assert.ok(!events.some((e) => /Canyon View/.test(e.title)), "no real school names");
  assert.ok(upcomingFrom(events, TODAY).length >= 3);
});

test("calendar: dates follow the team's time zone (America/Phoenix), like the app's Today", () => {
  assert.equal(demoTodayISO(new Date("2026-10-31T05:30:00Z")), "2026-10-30", "10:30 PM Friday in Arizona is still Friday");
  assert.equal(demoTodayISO(new Date("2026-10-31T07:30:00Z")), "2026-10-31");
});

test("calendar: only staff add, edit and delete events; changes stay in the demo with a Preview only notice", () => {
  assert.deepEqual(["coach", "athlete", "parent"].map((r) => isStaff(DEMO_ACTORS[r as "coach"])), [true, false, false]);
  const cal = code(read(`${D}/DemoCalendar.tsx`));
  assert.match(cal, /const canManage = isStaff\(actor\);/);
  assert.match(cal, /notify\("Preview only — the event was added to this demo\. No one was notified\."\)/);
  assert.match(cal, /<EventFormModal cal=\{cal\} \/>/);
  assert.match(cal, /canManage=\{cal\.canManage\}/);
  assert.ok(!/sessionStorage|localStorage|confirm\(/.test(cal), "no storage, no blocking dialogs");
  // The real Add Event button is CoachBar show={canManage} inside the generated CalendarView.
  assert.match(read(`${D}/DemoCalendarView.tsx`), /<CoachBar show=\{canManage\} label="Add Event" onAdd=\{openAdd\} \/>/);
});

test("calendar: export & sync are represented but never print, download, copy or open anything", () => {
  const menu = code(read(`${D}/DemoExportMenu.tsx`));
  for (const label of ["Print Calendar", "Download Calendar (.ics)", "Copy Subscription Link", "Add to Apple Calendar", "Add to Google Calendar", "Regenerate Sync Link", "Disable Calendar Sync", "Enable Calendar Sync"]) {
    assert.ok(menu.includes(label), label);
    assert.ok(read(`${T}/calendar/ExportMenu.tsx`).includes(label), `real: ${label}`);
  }
  assert.ok(!/href=|window\.(print|open|location)|navigator\.clipboard|webcal|google\.com|Capacitor|fetch\(/.test(menu));
  // Staff-only sync management, as in the app.
  assert.match(menu, /\{canManage && \(/);
});

// ── Member profile twin ─────────────────────────────────────────────────────

function styleDecls(src: string): Set<string> {
  const out = new Set<string>();
  let i = 0;
  while ((i = src.indexOf("style={{", i)) >= 0) {
    let depth = 0, j = i + 7;
    for (; j < src.length; j++) {
      if (src[j] === "{") depth++;
      else if (src[j] === "}" && --depth === 0) break;
    }
    for (const m of src.slice(i + 8, j).matchAll(/([A-Za-z]+):\s*((?:[^,{}()]|\([^()]*\)|\{[^{}]*\})+?)\s*(?=,|$|\n)/g)) out.add(`${m[1]}: ${m[2].replace(/\s+/g, " ").trim()}`);
    i = j;
  }
  return out;
}

test("member profile: the hero card uses only the real AthleteProfileView's styles, with the real Attendance card", () => {
  const demoSrc = read(`${D}/DemoTeam.tsx`);
  const hero = demoSrc.slice(demoSrc.indexOf("export function DemoMemberAthleteProfile"));
  const real = styleDecls(read(`${T}/athlete/[id]/AthleteProfileView.tsx`));
  const extra = [...styleDecls(hero)].filter((d) => !real.has(d));
  assert.deepEqual(extra, []);
  assert.match(hero, /\{attendance && <AthleteAttendanceCard attendance=\{attendance\} \/>\}/);
  assert.match(read(`${T}/athlete/[id]/AthleteProfileView.tsx`), /\{attendance && <AthleteAttendanceCard attendance=\{attendance\} \/>\}/);
});
