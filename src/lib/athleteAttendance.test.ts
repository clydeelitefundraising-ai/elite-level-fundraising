// Athlete profile — Attendance section. Pure rules (athleteAttendance.ts),
// the server read (teamAttendanceStore.ts getAthleteAbsences) against a
// fetch-mocked PostgREST that applies the query's filters, and structural
// checks on both profile pages, both views and the shared card.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

const {
  absenceCountLabel,
  canViewAthleteAttendance,
  formatAbsenceDate,
  summarizeAthleteAbsences,
} = await import("./athleteAttendance.ts");
const { getAthleteAbsences, ATTENDANCE_PAGE_SIZE } = await import("./teamAttendanceStore.ts");
const { canViewAttendance, canEditAttendance } = await import("./teamAttendance.ts");
import type { TeamActor } from "./permissions.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const coachPage   = read("../app/team/[slug]/team/[id]/page.tsx");
const memberPage  = read("../app/team/[slug]/athlete/[id]/page.tsx");
const coachView   = read("../app/team/[slug]/team/[id]/CoachAthleteView.tsx");
const memberView  = read("../app/team/[slug]/athlete/[id]/AthleteProfileView.tsx");
const cardSrc     = read("../app/team/[slug]/team/[id]/AthleteAttendanceCard.tsx");
const storeSrc    = read("./teamAttendanceStore.ts");

const SLUG = "lions-2027";
const A = "athlete-a";

const coach = (role: "head_coach" | "assistant_coach" | "booster"): TeamActor =>
  ({ kind: "coach", session: { id: "c1", name: "Coach", role, campaign_slug: SLUG } });
const member = (role: "athlete" | "parent" | "booster", athlete_id: string | null = null): TeamActor =>
  ({ kind: "member", session: { id: "m1", name: "Member", role, campaign_slug: SLUG, athlete_id } });
const admin: TeamActor = {
  kind: "platform_admin",
  session: { platformAdminId: "pa1", accountId: "acct1", name: "ELF Employee", email: "employee@elitelevelfundraising.com", campaign_slug: SLUG },
};

// ── Permissions ───────────────────────────────────────────────────────────

test("permissions: Head Coach, Assistant Coach and platform admin see any athlete's attendance", () => {
  for (const actor of [coach("head_coach"), coach("assistant_coach"), admin]) {
    assert.equal(canViewAthleteAttendance(actor, A, []), true);
  }
});

test("permissions: the athlete sees only their own attendance", () => {
  assert.equal(canViewAthleteAttendance(member("athlete", A), A, []), true);
  assert.equal(canViewAthleteAttendance(member("athlete", "athlete-b"), A, []), false);
  assert.equal(canViewAthleteAttendance(member("athlete", null), A, []), false);
  assert.equal(canViewAthleteAttendance(member("athlete", "athlete-b"), A, [A]), false, "links never apply to an athlete");
});

test("permissions: a parent sees only linked athletes (join table or legacy column)", () => {
  assert.equal(canViewAthleteAttendance(member("parent"), A, [A, "athlete-c"]), true);
  assert.equal(canViewAthleteAttendance(member("parent", A), A, []), true);
  assert.equal(canViewAthleteAttendance(member("parent"), A, ["athlete-c"]), false);
  assert.equal(canViewAthleteAttendance(member("parent"), A, []), false);
});

test("permissions: boosters (coach-table and member-table), the public and an empty id see nothing", () => {
  assert.equal(canViewAthleteAttendance(coach("booster"), A, []), false);
  assert.equal(canViewAthleteAttendance(member("booster", A), A, [A]), false);
  assert.equal(canViewAthleteAttendance({ kind: "public" }, A, [A]), false);
  assert.equal(canViewAthleteAttendance(member("athlete", ""), "", []), false);
});

test("permissions: attendance management access is unchanged (coaches and platform admins only)", () => {
  for (const actor of [coach("head_coach"), coach("assistant_coach"), admin]) {
    assert.equal(canViewAttendance(actor), true);
    assert.equal(canEditAttendance(actor), true);
  }
  for (const actor of [coach("booster"), member("athlete", A), member("parent", A), member("booster"), { kind: "public" } as TeamActor]) {
    assert.equal(canViewAttendance(actor), false);
    assert.equal(canEditAttendance(actor), false);
  }
});

// ── Counting and dates ────────────────────────────────────────────────────

test("counting: total includes excused, unexcused and other; list is newest first", () => {
  const s = summarizeAthleteAbsences([
    { session_date: "2026-09-02", absence_reason: "excused" },
    { session_date: "2026-10-14", absence_reason: "unexcused" },
    { session_date: "2026-09-30", absence_reason: "other" },
    { session_date: "2026-10-01", absence_reason: "excused" },
  ])!;
  assert.deepEqual({ total: s.total, excused: s.excused, unexcused: s.unexcused, other: s.other }, { total: 4, excused: 2, unexcused: 1, other: 1 });
  assert.deepEqual(s.absences.map(a => a.date), ["2026-10-14", "2026-10-01", "2026-09-30", "2026-09-02"]);
  assert.deepEqual(s.absences.map(a => a.reason), ["unexcused", "excused", "other", "excused"]);
});

test("counting: no absences is a real zero", () => {
  assert.deepEqual(summarizeAthleteAbsences([]), { total: 0, excused: 0, unexcused: 0, other: 0, absences: [] });
});

test("counting: malformed rows or a repeated date fail closed (null), never a partial count", () => {
  assert.equal(summarizeAthleteAbsences([{ session_date: "2026-10-01", absence_reason: "sick" }]), null);
  assert.equal(summarizeAthleteAbsences([{ session_date: "2026-10-01", absence_reason: null }]), null);
  assert.equal(summarizeAthleteAbsences([{ session_date: "10/01/2026", absence_reason: "excused" }]), null);
  assert.equal(summarizeAthleteAbsences([
    { session_date: "2026-10-01", absence_reason: "excused" },
    { session_date: "2026-10-01", absence_reason: "other" },
  ]), null);
});

test("dates: shown as the stored local calendar date, never shifted by time zone", () => {
  assert.equal(formatAbsenceDate("2026-10-21"), "Wed, Oct 21, 2026");
  assert.equal(formatAbsenceDate("2027-01-01"), "Fri, Jan 1, 2027");
  assert.equal(formatAbsenceDate("2026-12-31"), "Thu, Dec 31, 2026");
  assert.equal(formatAbsenceDate("2028-02-29"), "Tue, Feb 29, 2028");
});

test("count label: 0 absences, 1 absence, 2 absences", () => {
  assert.equal(absenceCountLabel(0), "0 absences");
  assert.equal(absenceCountLabel(1), "1 absence");
  assert.equal(absenceCountLabel(2), "2 absences");
});

// ── Server read: team/season isolation, query shape, failures ─────────────

type Rec = { id: string; campaign_slug: string; athlete_id: string | null; session_date: string; status: string; absence_reason: string | null; note: string | null };

const DB: Rec[] = [
  { id: "r1", campaign_slug: SLUG, athlete_id: A, session_date: "2026-10-14", status: "absent", absence_reason: "unexcused", note: "PRIVATE-NOTE-1" },
  { id: "r2", campaign_slug: SLUG, athlete_id: A, session_date: "2026-10-01", status: "absent", absence_reason: "excused", note: null },
  { id: "r3", campaign_slug: SLUG, athlete_id: A, session_date: "2026-09-30", status: "present", absence_reason: null, note: null },
  { id: "r4", campaign_slug: SLUG, athlete_id: A, session_date: "2026-09-02", status: "absent", absence_reason: "other", note: "PRIVATE-NOTE-2" },
  // Same athlete id, previous season / another team — must never appear.
  { id: "r5", campaign_slug: "lions-2026", athlete_id: A, session_date: "2025-10-14", status: "absent", absence_reason: "excused", note: null },
  { id: "r6", campaign_slug: "other-team", athlete_id: A, session_date: "2026-10-02", status: "absent", absence_reason: "excused", note: null },
  // Another athlete on the same team.
  { id: "r7", campaign_slug: SLUG, athlete_id: "athlete-b", session_date: "2026-10-03", status: "absent", absence_reason: "unexcused", note: null },
];

/** PostgREST stand-in: applies eq filters, select, order and paging, and
 *  returns the exact count in Content-Range. */
function makeFetch(db: Rec[], opts: { status?: number; body?: string; pageCap?: number } = {}) {
  const urls: string[] = [];
  const impl = async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(String(input));
    urls.push(url.toString());
    if (opts.status) return new Response(opts.body ?? "boom", { status: opts.status });
    let rows = db.slice();
    for (const [k, v] of url.searchParams) {
      if (v.startsWith("eq.")) rows = rows.filter(r => String((r as Record<string, unknown>)[k]) === v.slice(3));
    }
    rows.sort((a, b) => (a.session_date < b.session_date ? 1 : -1) || a.id.localeCompare(b.id));
    const select = (url.searchParams.get("select") ?? "").split(",");
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 1000), opts.pageCap ?? 1000);
    const page = rows.slice(offset, offset + limit).map(r => Object.fromEntries(select.map(c => [c, (r as Record<string, unknown>)[c]])));
    return new Response(JSON.stringify(page), {
      status: 200,
      headers: { "content-type": "application/json", "content-range": `${offset}-${offset + page.length - 1}/${rows.length}` },
    });
  };
  return { urls, impl };
}

async function withFetch<T>(impl: (input: string | URL | Request) => Promise<Response>, run: () => Promise<T>): Promise<T> {
  const real = globalThis.fetch;
  const realError = console.error;
  globalThis.fetch = impl as typeof fetch;
  console.error = () => {};
  try { return await run(); } finally { globalThis.fetch = real; console.error = realError; }
}

test("read: only this team season's and this athlete's absences — other seasons, teams and athletes excluded", async () => {
  const f = makeFetch(DB);
  const r = await withFetch(f.impl, () => getAthleteAbsences(SLUG, A));
  assert.ok(r.ok);
  assert.deepEqual({ total: r.value.total, excused: r.value.excused, unexcused: r.value.unexcused, other: r.value.other }, { total: 3, excused: 1, unexcused: 1, other: 1 });
  assert.deepEqual(r.value.absences.map(a => a.date), ["2026-10-14", "2026-10-01", "2026-09-02"]);
});

test("read: query filters by campaign_slug, athlete_id and absent, and never selects the note", async () => {
  const f = makeFetch(DB);
  const r = await withFetch(f.impl, () => getAthleteAbsences(SLUG, A));
  assert.ok(r.ok);
  const url = new URL(f.urls[0]);
  assert.equal(url.pathname, "/rest/v1/team_attendance_records");
  assert.equal(url.searchParams.get("campaign_slug"), `eq.${SLUG}`);
  assert.equal(url.searchParams.get("athlete_id"), `eq.${A}`);
  assert.equal(url.searchParams.get("status"), "eq.absent");
  assert.equal(url.searchParams.get("select"), "id,session_date,absence_reason");
  assert.ok(!f.urls.some(u => u.includes("note")));
  assert.ok(!JSON.stringify(r.value).includes("PRIVATE-NOTE"), "notes never reach the result");
});

test("read: a different team for the same athlete id returns only that team's records", async () => {
  const f = makeFetch(DB);
  const r = await withFetch(f.impl, () => getAthleteAbsences("lions-2026", A));
  assert.ok(r.ok);
  assert.deepEqual(r.value.absences.map(a => a.date), ["2025-10-14"]);
});

test("read: zero absences is ok with zeros, not unavailable", async () => {
  const f = makeFetch(DB);
  const r = await withFetch(f.impl, () => getAthleteAbsences(SLUG, "athlete-none"));
  assert.ok(r.ok);
  assert.equal(r.value.total, 0);
});

test("read: every page is read when the server caps responses", async () => {
  const many: Rec[] = Array.from({ length: 5 }, (_, i) => ({
    id: `p${i}`, campaign_slug: SLUG, athlete_id: A, session_date: `2026-10-0${i + 1}`, status: "absent", absence_reason: "excused", note: null,
  }));
  const f = makeFetch(many, { pageCap: 2 });
  const r = await withFetch(f.impl, () => getAthleteAbsences(SLUG, A));
  assert.ok(r.ok);
  assert.equal(r.value.total, 5);
  assert.equal(f.urls.length, 3);
  assert.ok(ATTENDANCE_PAGE_SIZE >= 2);
});

test("read: a server error is 'error', a missing table is 'unavailable' — never zero", async () => {
  const err = await withFetch(makeFetch(DB, { status: 500 }).impl, () => getAthleteAbsences(SLUG, A));
  assert.deepEqual(err, { ok: false, reason: "error" });
  const missing = await withFetch(
    makeFetch(DB, { status: 404, body: JSON.stringify({ code: "42P01", message: 'relation "public.team_attendance_records" does not exist' }) }).impl,
    () => getAthleteAbsences(SLUG, A),
  );
  assert.equal(missing.ok, false);
});

test("read: a malformed stored row fails closed", async () => {
  const bad: Rec[] = [{ id: "x", campaign_slug: SLUG, athlete_id: A, session_date: "2026-10-01", status: "absent", absence_reason: "mystery", note: null }];
  const r = await withFetch(makeFetch(bad).impl, () => getAthleteAbsences(SLUG, A));
  assert.deepEqual(r, { ok: false, reason: "error" });
});

test("read: the store reader reuses the strict pager and the fail-closed guard", () => {
  const fn = storeSrc.slice(storeSrc.indexOf("export async function getAthleteAbsences"));
  assert.match(fn, /return guarded\("athlete absences"/);
  assert.match(fn, /await readAll</);
});

// ── Both profile pages ────────────────────────────────────────────────────

test("staff profile page: loads attendance only for coaches/admins (boosters excluded), passes it to the view", () => {
  assert.match(coachPage, /const showAttendance = canViewAthleteAttendance\(actor, athlete\.id, \[\]\);/);
  assert.match(coachPage, /showAttendance \? getAthleteAbsences\(slug, athlete\.id\) : Promise\.resolve\(null\)/);
  assert.match(coachPage, /absences\.ok \? \{ ok: true, summary: absences\.value \} : \{ ok: false \}/);
  assert.match(coachPage, /attendance=\{attendance\}/);
  assert.match(coachPage, /if \(!isStaff\(actor\)\) redirect\(`\/team\/\$\{slug\}\/athlete\/\$\{id\}`\);/, "staff gate unchanged");
});

test("member profile page: athlete, linked parent or coach only; access check unchanged", () => {
  assert.match(memberPage, /if \(!\(await canAccessAthleteProfile\(actor, id\)\)\) notFound\(\);/);
  assert.match(memberPage, /actor\.kind === "member" && actor\.session\.role === "parent"\s*\?\s*await getLinkedAthleteIdsForMember\(actor\.session\.id, actor\.session\.athlete_id\)/);
  assert.match(memberPage, /if \(canViewAthleteAttendance\(actor, id, linkedAthleteIds\)\) \{\s*const absences = await getAthleteAbsences\(slug, id\);/);
  assert.match(memberPage, /attendance=\{attendance\}/);
  assert.match(memberPage, /if \(!athlete \|\| athlete\.campaign_slug !== slug\) notFound\(\);/, "athlete must belong to this team season");
});

test("both views: Attendance card right after To-Do Tasks, only when provided", () => {
  for (const [view, todo] of [
    [coachView, "{showTaskCompletion && <AthleteTaskCompletion"],
    [memberView, "{taskCompletion && <AthleteTaskCompletion"],
  ] as const) {
    const todoAt = view.indexOf(todo);
    const cardAt = view.indexOf("{attendance && <AthleteAttendanceCard attendance={attendance} />}");
    assert.ok(todoAt > 0 && cardAt > todoAt, "card follows the To-Do card");
    assert.ok(view.slice(todoAt, cardAt).split("\n").length <= 5, "directly after it");
    assert.match(view, /attendance = null,/);
  }
});

// ── The card ──────────────────────────────────────────────────────────────

test("card: collapsed by default; header has calendar icon, Attendance, count and chevron", () => {
  assert.match(cardSrc, /const \[expanded, setExpanded\] = useState\(false\);/);
  assert.match(cardSrc, /aria-expanded=\{expanded\}/);
  assert.match(cardSrc, /<CalendarDays /);
  assert.match(cardSrc, />Attendance</);
  assert.match(cardSrc, /\{absenceCountLabel\(summary\.total\)\}/);
  assert.match(cardSrc, /<ChevronDown/);
  assert.match(cardSrc, /\{expanded && \(/);
});

test("card: Total Absences, Excused and Unexcused always visible; Other only when above zero", () => {
  assert.match(cardSrc, /<Metric label="Total Absences" value=\{summary\.total\} \/>/);
  assert.match(cardSrc, /<Metric label="Excused" value=\{summary\.excused\} \/>/);
  assert.match(cardSrc, /<Metric label="Unexcused" value=\{summary\.unexcused\} \/>/);
  assert.match(cardSrc, /\{summary\.other > 0 && <Metric label="Other" value=\{summary\.other\} \/>\}/);
  const metricsAt = cardSrc.indexOf('<Metric label="Total Absences"');
  assert.ok(metricsAt > 0 && metricsAt < cardSrc.indexOf("{expanded && ("), "metrics are outside the expanded part");
});

test("card: expanded list shows each date with Excused / Unexcused / Other; no notes anywhere", () => {
  assert.match(cardSrc, /\{formatAbsenceDate\(a\.date\)\}/);
  assert.match(cardSrc, /\{absenceReasonLabel\(a\.reason\)\}/);
  assert.ok(!/note/i.test(cardSrc.replace(/Notes are never part of the data\./, "")), "card never references notes");
});

test("card: a failed read says 'Attendance temporarily unavailable', never zero", () => {
  assert.match(cardSrc, /export const ATTENDANCE_UNAVAILABLE_TEXT = "Attendance temporarily unavailable";/);
  const fail = cardSrc.slice(cardSrc.indexOf("if (!attendance.ok)"), cardSrc.indexOf("const { summary } = attendance;"));
  assert.match(fail, /\{ATTENDANCE_UNAVAILABLE_TEXT\}/);
  assert.ok(!/Metric|absenceCountLabel/.test(fail));
});

test("card: read-only — no inputs, links, fetches or writes", () => {
  assert.ok(!/fetch\(|<input|<form|href=|method:/.test(cardSrc));
});
