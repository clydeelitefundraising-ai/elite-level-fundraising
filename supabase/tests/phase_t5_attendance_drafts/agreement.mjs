// Phase 5-2 agreement check — DISPOSABLE LOCAL PostgreSQL ONLY (run.sh).
// The TypeScript rules (src/lib/teamAttendance*.ts) drive the REAL
// database functions end to end: rosters come from
// team_attendance_session_roster(), drafts and payloads are built by the
// TypeScript modules, and saves go to team_attendance_save_draft(). Every
// case checks that both sides reach the same answer.
import { execFileSync } from "node:child_process";
import {
  attendanceDateEligibility, attendanceDbErrorCode, attendanceSaveOutcome, addCalendarDays,
  localDateInZone, normalizeAttendanceNote, AttendanceRuleError,
} from "../../../src/lib/teamAttendance.ts";
import {
  buildAttendanceDraft, buildSavePayload, includeLateAthlete, mergeServerDraft, pendingDecisions,
  setAthleteAbsent, setAthleteNote, setAthletePresent, entriesOfKind,
} from "../../../src/lib/teamAttendanceDraft.ts";

const PORT = process.env.PORT;
if (!PORT) throw new Error("run via run.sh");
let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`PASS  ${name}`); } else { fail++; console.log(`FAIL  ${name} :: ${detail}`); }
};
// SQL goes in on stdin as UTF-8: Windows command-line arguments are not
// reliably UTF-8 (characters outside the BMP arrive doubled), which would
// make the note-length checks test the transport instead of the rules.
function psql(sql) {
  try {
    const out = execFileSync("psql", ["-h", "localhost", "-p", PORT, "-U", "postgres", "-d", "elf5", "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"],
      { encoding: "utf8", input: `${sql};\n`, stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, PGCLIENTENCODING: "UTF8" } });
    return { ok: true, out: out.trim() };
  } catch (err) {
    return { ok: false, err: String(err.stderr || err.message) };
  }
}
const json = sql => { const r = psql(sql); if (!r.ok) throw new Error(r.err); return JSON.parse(r.out || "null"); };
const U = c => `00000000-0000-0000-0000-0000000000${c}`;
const SLUG = "team-ts";
const COACH_A = { coach_id: U("d5") }, COACH_B = { coach_id: U("d6") };

// Fixtures: two athletes on the roster long ago (one with NO recorded add
// date), one added right now (late for any earlier date).
psql(`
  INSERT INTO public.campaign_settings VALUES ('${SLUG}');
  INSERT INTO public.team_coaches (id, campaign_slug, name, role) VALUES
    ('${U("d5")}', '${SLUG}', 'Coach A', 'head_coach'), ('${U("d6")}', '${SLUG}', 'Coach B', 'assistant_coach');
  INSERT INTO public.athletes (id, campaign_slug, name, class_year, created_at) VALUES
    ('${U("f5")}', '${SLUG}', 'Tia Old', 'Senior', '2026-01-01T12:00:00Z'),
    ('${U("f6")}', '${SLUG}', 'Ty Nodate', 'Junior', NULL),
    ('${U("f7")}', '${SLUG}', 'Tess New', 'Freshman', now());`);

const today = json(`SELECT to_json(public.team_attendance_today('${SLUG}'))`);
const zone = json(`SELECT to_json(public.team_attendance_time_zone('${SLUG}'))`);
check("A1 TypeScript and the database agree on the team's zone and today",
  zone === "America/Phoenix" && today === localDateInZone(new Date(), zone), `${zone} ${today}`);

function load(date) {
  const rows = json(`SET ROLE service_role; SELECT coalesce(json_agg(r ORDER BY r.athlete_name), '[]') FROM public.team_attendance_session_roster('${SLUG}', '${date}') r`);
  const s = json(`SET ROLE service_role; SELECT to_json(x) FROM (SELECT version, status, time_zone FROM public.team_attendance_sessions WHERE campaign_slug = '${SLUG}' AND session_date = '${date}') x`);
  return buildAttendanceDraft({ sessionDate: date, session: s, rows, now: new Date() });
}
function save(draft, actor) {
  const p = buildSavePayload(draft);
  if (!p.ok) return { ts: "rejected", issues: p.issues };
  const r = psql(`SET ROLE service_role; SELECT public.team_attendance_save_draft('${SLUG}', '${p.payload.sessionDate}', ${p.payload.expectedVersion}, $p$${JSON.stringify(p.payload.records)}$p$::jsonb, '${JSON.stringify(actor)}'::jsonb)`);
  return r.ok ? { ts: "ok", db: "ok", result: JSON.parse(r.out) } : { ts: "ok", db: attendanceDbErrorCode(r.err) };
}
function rawSave(date, version, records, actor = COACH_A) {
  const r = psql(`SET ROLE service_role; SELECT public.team_attendance_save_draft('${SLUG}', '${date}', ${version}, $p$${JSON.stringify(records)}$p$::jsonb, '${JSON.stringify(actor)}'::jsonb)`);
  return r.ok ? "ok" : attendanceDbErrorCode(r.err);
}
const stored = (date, code) => json(`SELECT to_json(r) FROM public.team_attendance_records r JOIN public.team_attendance_sessions s ON s.id = r.session_id
  WHERE s.campaign_slug = '${SLUG}' AND s.session_date = '${date}' AND r.athlete_id = '${U(code)}'`);

// ── Today: a new session, then a reopen and an edit ─────────────────────
let d = load(today);
check("A2 today: nobody needs a decision; all three are required (incl. the athlete with no add date)",
  pendingDecisions(d).length === 0 && d.entries.every(e => e.kind === "enrolled" && e.state.included), JSON.stringify(d.entries.map(e => e.kind)));
d = setAthleteNote(setAthleteAbsent(d, U("f5"), "excused"), U("f5"), "  Doctor appointment \n");
let r = save(d, COACH_A);
check("A3 the TypeScript payload for a new session is accepted (version 1, counts match)",
  r.db === "ok" && r.result.version === 1 && r.result.created === true && r.result.counts.present === 2 && r.result.counts.excused === 1, JSON.stringify(r));
check("A4 the note is stored exactly as TypeScript normalized it",
  stored(today, "f5")?.note === normalizeAttendanceNote("  Doctor appointment \n"), JSON.stringify(stored(today, "f5")));
d = setAthletePresent(load(today), U("f5"));
r = save(d, COACH_B);
check("A5 reopen + Absent->Present: accepted as version 2; reason and note cleared in the database",
  r.db === "ok" && r.result.version === 2 && stored(today, "f5").absence_reason === null && stored(today, "f5").note === null, JSON.stringify(r));

// ── Notes at the limits (code points, not UTF-16 units) ─────────────────
const RUNNER = String.fromCodePoint(0x1f3c3), NBSP = String.fromCharCode(0xa0);
d = setAthleteNote(setAthleteAbsent(load(today), U("f6"), "other"), U("f6"), RUNNER.repeat(500));
r = save(d, COACH_A);
check("A6 a 500-character note (1,000 UTF-16 units) is accepted by both", r.db === "ok" && [...stored(today, "f6").note].length === 500, JSON.stringify(r).slice(0, 200));
d = setAthleteNote(setAthleteAbsent(load(today), U("f6"), "other"), U("f6"), RUNNER.repeat(501));
r = save(d, COACH_A);
const raw501 = rawSave(today, 3, [
  { athlete_id: U("f5"), status: "present" }, { athlete_id: U("f7"), status: "present" },
  { athlete_id: U("f6"), status: "absent", absence_reason: "other", note: RUNNER.repeat(501) }]);
check("A7 a 501-character note is refused by TypeScript AND by the database", r.ts === "rejected" && r.issues[0].code === "note_too_long" && raw501 === "attendance_record_invalid", `${JSON.stringify(r)} db=${raw501}`);
d = setAthleteNote(load(today), U("f6"), `${NBSP}kept${NBSP}\t`);
r = save(d, COACH_A);
check("A8 trimming agrees: tabs trimmed, non-breaking spaces kept, by both", r.db === "ok" && stored(today, "f6").note === `${NBSP}kept${NBSP}`, JSON.stringify(stored(today, "f6")));

// ── An earlier date: the athlete added today is late ───────────────────
const past = addCalendarDays(today, -3);
d = load(past);
const late = pendingDecisions(d).map(e => e.athleteId);
check("A9 three days ago: only the athlete added today needs a decision (the no-add-date athlete is required)",
  late.length === 1 && late[0] === U("f7") && entriesOfKind(d, "enrolled").length === 2, JSON.stringify(late));
r = save(d, COACH_A);
check("A10 saving without the late athlete is accepted (nothing invented)", r.db === "ok" && stored(past, "f7") === null, JSON.stringify(r));
const missingRequired = rawSave(past, 1, [{ athlete_id: U("f5"), status: "present" }]);
check("A11 leaving out the no-add-date athlete is refused by the database, as TypeScript requires", missingRequired === "attendance_roster_incomplete", missingRequired);
d = includeLateAthlete(load(past), U("f7"), "absent", "unexcused");
r = save(d, COACH_A);
check("A12 the explicit inclusion (with confirmation) is accepted; stored as chosen", r.db === "ok" && stored(past, "f7")?.absence_reason === "unexcused", JSON.stringify(r));
const reloaded = load(past);
check("A13 once saved, the late athlete is late_included and required by both",
  reloaded.entries.find(e => e.athleteId === U("f7")).kind === "late_included"
  && rawSave(past, 2, [{ athlete_id: U("f5"), status: "present" }, { athlete_id: U("f6"), status: "present" }]) === "attendance_roster_incomplete");

// ── Two coaches ────────────────────────────────────────────────────────
const bLoaded = load(past);                                   // B opens version 2
const aDraft = setAthleteAbsent(load(past), U("f5"), "other"); // A changes athlete f5 and saves (v3)
r = save(aDraft, COACH_A);
const bDraft = setAthleteAbsent(bLoaded, U("f6"), "excused");  // B changes athlete f6
const stale = save(bDraft, COACH_B);
check("A14 B's stale save is refused as a conflict (TypeScript classifies it as 'conflict')",
  r.db === "ok" && stale.db === "attendance_version_conflict" && attendanceSaveOutcome(stale.db) === "conflict", JSON.stringify(stale));
const merged = mergeServerDraft(bDraft, load(past));
r = save(merged.draft, COACH_B);
check("A15 after merging, B saves on version 3 -> 4 and BOTH coaches' changes are stored",
  merged.readyToSave && r.db === "ok" && r.result.version === 4
  && stored(past, "f5").absence_reason === "other" && stored(past, "f6").absence_reason === "excused", JSON.stringify(r));
const cDraft = setAthleteAbsent(load(past), U("f5"), "excused"); // C and A both change f5 differently
save(setAthleteAbsent(load(past), U("f5"), "unexcused"), COACH_A);
const conflict = mergeServerDraft(cDraft, load(past));
check("A16 the same athlete changed differently: TypeScript blocks the save; the database still holds A's value",
  !conflict.readyToSave && buildSavePayload(conflict.draft).ok === false && stored(past, "f5").absence_reason === "unexcused");

// ── Date window ────────────────────────────────────────────────────────
const edge = addCalendarDays(today, -14), old = addCalendarDays(today, -15), future = addCalendarDays(today, 1);
const results = [edge, old, future].map(date => {
  const eligibility = attendanceDateEligibility(date, today);
  const db = rawSave(date, 0, [{ athlete_id: U("f5"), status: "present" }, { athlete_id: U("f6"), status: "present" }]);
  return { date, eligibility, db };
});
check("A17 the date window agrees: 14 days back editable/accepted; 15 back read-only/refused; tomorrow future/refused",
  results[0].eligibility === "editable" && results[0].db === "ok"
  && results[1].eligibility === "read_only" && results[1].db === "attendance_date_not_editable"
  && results[2].eligibility === "future" && results[2].db === "attendance_date_in_future", JSON.stringify(results));
d = load(old);
let readOnly;
try { setAthleteAbsent(d, U("f5"), "other"); } catch (err) { readOnly = err instanceof AttendanceRuleError ? err.code : String(err); }
check("A18 an out-of-window date loads read-only in TypeScript", d.editability.editable === false && readOnly === "date_not_editable", readOnly);

console.log(`AGREEMENT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
