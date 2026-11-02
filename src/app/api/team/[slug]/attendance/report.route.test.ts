// Attendance Reports — GET /api/team/[slug]/attendance/report.
// Same fake PostgREST world as the attendance route tests
// (testSupport/attendanceWorld.mjs): attendance is saved through the real
// save route, then read back by the report from the same tables.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.TEAM_MEMBER_PEPPER        = "fake-member-pepper";
process.env.TEAM_COACH_PEPPER         = "fake-coach-pepper";
process.env.ELF_ACCOUNT_PEPPER        = "fake-account-pepper";

register(new URL("../../../../../lib/testSupport/nextStubLoader.mjs", import.meta.url).href, import.meta.url);

const { SLUG, OTHER, A, TODAY, SECRET_NOTE, ROLES, withWorld, put, body } = await import("./testSupport/attendanceWorld.mjs");
const { NextRequest } = await import("../../../../../lib/testSupport/nextServerStub.mjs");
const { parseCsv } = await import("@/lib/platform/import/csvParse");

type World = Parameters<Parameters<typeof withWorld>[0]>[0];
type Row = Record<string, unknown>;

async function report(query = "", slug = SLUG) {
  const { GET } = await import("./report/route.ts");
  return GET(new NextRequest(`http://test.local/api/team/${slug}/attendance/report${query}`, { method: "GET" }) as never, { params: Promise.resolve({ slug }) });
}

/** Expose the world's saved attendance as the two tables the report
 *  reads, give athletes a created_at, and add team settings. */
function tables(w: World) {
  const db = w.db as Record<string, unknown>;
  Object.defineProperty(db, "team_attendance_sessions", {
    get: () => [...(w.sessions as Map<string, Row>).values()].map(s => ({
      id: s.id, campaign_slug: s.campaign_slug, session_date: s.session_date, time_zone: s.time_zone, version: s.version,
    })),
  });
  Object.defineProperty(db, "team_attendance_records", {
    get: () => [...(w.records as Map<string, Row[]>).entries()].flatMap(([key, recs]) => {
      const s = (w.sessions as Map<string, Row>).get(key)!;
      return recs.map(r => ({
        id: r.id, session_id: s.id, campaign_slug: s.campaign_slug, session_date: s.session_date,
        athlete_id: r.athlete_id, status: r.status, absence_reason: r.absence_reason ?? null, note: r.note ?? null,
      }));
    }),
  });
  for (const a of w.db.athletes as Row[]) a.created_at = a.added_on ? `${a.added_on}T19:00:00Z` : null;
  db.campaign_settings = [
    { campaign_slug: SLUG, school_name: "Wolves High", sport_name: "Track", season: "2026–27" },
    { campaign_slug: OTHER, school_name: "Hawks High", sport_name: "Track", season: "2026–27" },
  ];
}

const absent = (id: string, reason: string, note: string | null = null) => ({ athlete_id: id, status: "absent", absence_reason: reason, note });
const present = (id: string) => ({ athlete_id: id, status: "present" });

/** Wolves: Oct 17 (Ava present, Ben excused w/ note, Cy present),
 *  Oct 18 (Ava unexcused, Ben present, Cy present). Hawks: one session. */
async function seed(w: World) {
  tables(w);
  ROLES.head();
  assert.equal((await put("2026-10-17", { expectedVersion: 0, records: [present(A(1)), absent(A(2), "excused", SECRET_NOTE), present(A(3))] })).status, 200);
  assert.equal((await put("2026-10-18", { expectedVersion: 0, records: [absent(A(1), "unexcused"), present(A(2)), present(A(3))] })).status, 200);
  (w.sessions as Map<string, Row>).set(`${OTHER}|2026-10-18`, { id: "sess-hawks", campaign_slug: OTHER, session_date: "2026-10-18", status: "draft", version: 1, time_zone: "America/Phoenix" });
  (w.records as Map<string, Row[]>).set(`${OTHER}|2026-10-18`, [{ id: "rec-hawk", athlete_id: A(4), status: "absent", absence_reason: "other", note: "hawk secret" }]);
}

// ── Who may read reports ──────────────────────────────────────────────────

test("Head Coach, Assistant Coach and platform admin can read the report", async () => {
  for (const role of ["head", "assistant", "admin"] as const) {
    await withWorld(async w => {
      await seed(w);
      ROLES[role]();
      const res = await report();
      assert.equal(res.status, 200, role);
      assert.equal((await body(res)).report.sessionCount, 2, role);
    });
  }
});

test("boosters, parents, athletes, signed-out and forged sessions get nothing", async () => {
  const expected = { boosterCoach: 403, boosterMember: 403, parent: 403, athlete: 403, nobody: 401, forged: 401 } as const;
  for (const [role, status] of Object.entries(expected)) {
    await withWorld(async w => {
      await seed(w);
      ROLES[role as keyof typeof expected]();
      const before = w.requests.length;
      for (const q of ["", "?format=csv", "?format=pdf"]) {
        const res = await report(q);
        assert.equal(res.status, status, `${role} ${q}`);
        const text = await res.text();
        assert.ok(!text.includes("Ava") && !text.includes(SECRET_NOTE), `${role} sees no data`);
      }
      assert.ok(!w.requests.slice(before).some((r: string) => r.includes("team_attendance")), `${role}: nothing read`);
    });
  }
});

test("multi-team isolation: another team's coach is refused, and each team sees only its own records", async () => {
  await withWorld(async w => {
    await seed(w);
    ROLES.otherTeamHead();
    assert.equal((await report("", SLUG)).status, 401, "Hawks coach on the Wolves report: not a member of this team");
    const hawks = await body(await report("?from=2026-10-01&to=2026-10-19", OTHER));
    assert.equal(hawks.report.sessionCount, 1);
    assert.deepEqual(hawks.roster.map((a: Row) => a.name), ["Hawk Kid"]);
    assert.equal(hawks.report.totals.other, 1);

    ROLES.head();
    const wolves = await body(await report("?from=2026-10-01&to=2026-10-19"));
    assert.equal(wolves.report.sessionCount, 2);
    assert.ok(!wolves.roster.some((a: Row) => a.name === "Hawk Kid"));
    assert.equal(wolves.report.totals.other, 0);
    assert.ok(w.requests.filter((r: string) => r.includes("team_attendance_records")).every((r: string) => r.includes("campaign_slug=eq.")));
  });
});

// ── The report ────────────────────────────────────────────────────────────

test("JSON report: totals from saved records; default range is first session → today", async () => {
  await withWorld(async w => {
    await seed(w);
    const r = await body(await report());
    assert.equal(r.from, "2026-10-17");
    assert.equal(r.to, TODAY);
    assert.deepEqual(r.team, { schoolName: "Wolves High", sportName: "Track", season: "2026–27" });
    assert.equal(r.report.athleteCount, 3);
    const t = r.report.totals;
    assert.deepEqual([t.present, t.absent, t.excused, t.unexcused, t.unmarked, t.percent], [4, 2, 1, 1, 0, 66.7]);
    assert.ok(!JSON.stringify(r).includes(SECRET_NOTE), "notes are never read into a report");
  });
});

test("no attendance yet: an empty report, not an error", async () => {
  await withWorld(async w => {
    tables(w);
    ROLES.head();
    const r = await body(await report());
    assert.equal(r.from, TODAY);
    assert.equal(r.report.sessionCount, 0);
    assert.equal(r.report.totals.percent, null);
    assert.equal(r.firstSessionDate, null);
  });
});

test("CSV and PDF follow the same filters and match the JSON totals", async () => {
  await withWorld(async w => {
    await seed(w);
    const q = `?from=2026-10-17&to=2026-10-17&athlete=${A(2)}&sort=absences`;
    const json = await body(await report(q));
    assert.equal(json.report.athleteCount, 1);
    assert.deepEqual([json.report.totals.present, json.report.totals.excused], [0, 1]);

    const csvRes = await report(`${q}&format=csv`);
    assert.equal(csvRes.status, 200);
    assert.match(csvRes.headers.get("content-type") ?? "", /^text\/csv/);
    assert.match(csvRes.headers.get("content-disposition") ?? "", /wolves-high-track-attendance-athletes-2026-10-17-to-2026-10-17\.csv/);
    assert.equal(csvRes.headers.get("cache-control"), "no-store");
    const csv = await csvRes.text();
    assert.ok(!csv.includes(SECRET_NOTE));
    const rows = parseCsv(csv.replace(/^﻿/, ""));
    assert.equal(rows.length, 3, "header, Ben, team total");
    assert.equal(rows[1][0], "Ben Brown");
    assert.deepEqual(rows[2].slice(2, 5), ["0", "1", "1"]);

    const sessions = parseCsv((await (await report(`${q}&format=csv&view=sessions`)).text()).replace(/^﻿/, ""));
    assert.deepEqual(sessions.slice(1), [["2026-10-17", "Ben Brown", "Junior", "Absent – Excused"]]);

    const pdf = await report(`${q}&format=pdf`);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get("content-type"), "application/pdf");
    assert.match(pdf.headers.get("content-disposition") ?? "", /attendance-report-2026-10-17-to-2026-10-17\.pdf/);
    const bytes = new Uint8Array(await pdf.arrayBuffer());
    assert.equal(Buffer.from(bytes.subarray(0, 5)).toString(), "%PDF-");
  });
});

test("invalid filters are refused before any attendance is read", async () => {
  await withWorld(async w => {
    await seed(w);
    const cases: [string, number][] = [
      ["?from=2026-13-01", 400], ["?to=yesterday", 400], ["?from=2026-10-19&to=2026-10-01", 400],
      ["?from=2025-01-01&to=2026-10-19", 400], ["?athlete=../x", 400], [`?athlete=${A(4)}`, 400],
      ["?sort=random", 400], ["?format=xlsx", 400], ["?format=csv&view=all", 400],
    ];
    for (const [q, status] of cases) assert.equal((await report(q)).status, status, q);
  });
});

test("a save landing between the report's reads is retried, never mixed", async () => {
  await withWorld(async w => {
    await seed(w);
    let reads = 0;
    const sessions = w.sessions as Map<string, Row>;
    w.control.tamper = (resource: string) => {
      if (resource === "team_attendance_sessions" && ++reads === 2) sessions.get(`${SLUG}|2026-10-18`)!.version = 7;
      return null;
    };
    const res = await report("?from=2026-10-01&to=2026-10-19");
    assert.equal(res.status, 200);
    assert.ok(reads >= 3, "sessions re-read after the change");
  });
});

test("a read failure is a 503, never a partial report", async () => {
  await withWorld(async w => {
    await seed(w);
    w.control.failPaths = ["team_attendance_records"];
    const res = await report();
    assert.equal(res.status, 503);
    assert.ok(!(await res.text()).includes(SECRET_NOTE));
  });
});

// ── Individual absence dates ──────────────────────────────────────────────

test("absence dates: JSON, CSV and PDF list the same dates and reasons for the same filters", async () => {
  await withWorld(async w => {
    await seed(w);
    const { absenceDatesCell } = await import("@/lib/attendanceReportCsv");
    const { formatReportDate } = await import("@/lib/attendanceReport");
    const q = "?from=2026-10-01&to=2026-10-19";
    const json = await body(await report(q));
    const absences = Object.fromEntries(json.report.athletes.map((a: Row) => [a.name, a.absences]));
    assert.deepEqual(absences["Ava Athlete"], [{ date: "2026-10-18", reason: "unexcused" }]);
    assert.deepEqual(absences["Ben Brown"], [{ date: "2026-10-17", reason: "excused" }]);
    assert.deepEqual(absences["Cy Clark"], []);

    const rows = parseCsv((await (await report(`${q}&format=csv`)).text()).replace(/^﻿/, ""));
    for (const a of json.report.athletes) {
      assert.equal(rows.find(r => r[0] === a.name)![11], absenceDatesCell(a.absences), a.name);
    }
    assert.equal(rows.find(r => r[0] === "Cy Clark")![11], "No recorded absences in this period.");

    const pdf = Buffer.from(await (await report(`${q}&format=pdf`)).arrayBuffer());
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    const { inflateSync } = await import("node:zlib");
    const raw = pdf.toString("latin1");
    const text = [...raw.matchAll(/stream\r?\n/g)].map(m => {
      const start = m.index! + m[0].length;
      const chunk = pdf.subarray(start, raw.indexOf("endstream", start));
      try { return inflateSync(chunk).toString("latin1"); } catch { return ""; }
    }).join("").matchAll(/<([0-9A-Fa-f]+)> Tj/g);
    const lines = [...text].map(t => Buffer.from(t[1], "hex").toString("latin1"));
    const details = lines.slice(lines.indexOf("Absence Details"));
    for (const [name, list] of Object.entries(absences) as [string, { date: string; reason: string }[]][]) {
      for (const abs of list) assert.ok(details.includes(formatReportDate(abs.date)), `${name} ${abs.date}`);
    }
    assert.ok(!details.includes("Cy Clark"));
    assert.ok(!JSON.stringify(json).includes(SECRET_NOTE) && !rows.flat().join(" ").includes(SECRET_NOTE), "notes never appear");
  });
});

test("absence dates follow filter changes (range and athlete)", async () => {
  await withWorld(async w => {
    await seed(w);
    const only17 = await body(await report("?from=2026-10-17&to=2026-10-17"));
    const ava17 = only17.report.athletes.find((a: Row) => a.name === "Ava Athlete");
    assert.deepEqual(ava17.absences, [], "Ava's Oct 18 absence is outside the range");
    const ben = await body(await report(`?from=2026-10-01&to=2026-10-19&athlete=${A(2)}`));
    assert.deepEqual(ben.report.athletes.map((a: Row) => [a.name, a.absences]), [["Ben Brown", [{ date: "2026-10-17", reason: "excused" }]]]);
    const benCsv = parseCsv((await (await report(`?from=2026-10-01&to=2026-10-19&athlete=${A(2)}&format=csv`)).text()).replace(/^﻿/, ""));
    assert.equal(benCsv.length, 3);
    assert.equal(benCsv[1][11], "Oct 17, 2026 – Excused");
  });
});
