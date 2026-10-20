// Test-only: the fake PostgREST world, signed-session helpers and route
// callers shared by the Phase 5-3 route tests (attendance.route.test.ts) and
// the Phase 5-4 attendance screen tests. Moved here unchanged from
// attendance.route.test.ts (types stripped, so the build never compiles it).
// Import it only after registering a loader that resolves "@/" and stubs
// "next/headers" / "next/server" (lib/testSupport/nextStubLoader.mjs).
import { NextRequest } from "../../../../../../lib/testSupport/nextServerStub.mjs";
import { __setTestCookie } from "../../../../../../lib/testSupport/nextHeadersStub.mjs";
import { makeMemberCookie } from "@/lib/memberAuth";
import { makeCoachCookie } from "@/lib/teamAuth";
import { makeAccountCookie } from "@/lib/accountAuth";
import { addCalendarDays } from "@/lib/teamAttendance";
export const SLUG = "wolves";
export const OTHER = "hawks";
export const A = (n) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const R = (n) => `c0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const TODAY = "2026-10-19";
export const SECRET_NOTE = "Private medical detail 7731";
export const COACHES = {
    head: { id: "coach-head", name: "Hana Head", role: "head_coach", campaign_slug: SLUG, salt: "s1", account_id: "acct-head" },
    assistant: { id: "coach-asst", name: "Ari Asst", role: "assistant_coach", campaign_slug: SLUG, salt: "s2", account_id: "acct-asst" },
    booster: { id: "coach-boost", name: "Bo Booster", role: "booster", campaign_slug: SLUG, salt: "s3", account_id: null },
    hawkHead: { id: "coach-hawk", name: "Hal Hawk", role: "head_coach", campaign_slug: OTHER, salt: "s4", account_id: "acct-hawk" },
};
export const MEMBERS = {
    athlete: { id: "m-ath", name: "Ava Athlete", role: "athlete", campaign_slug: SLUG, athlete_id: A(1), account_id: null, salt: "t1" },
    parent: { id: "m-par", name: "Pat Parent", role: "parent", campaign_slug: SLUG, athlete_id: A(1), account_id: null, salt: "t2" },
    booster: { id: "m-boost", name: "Mo Booster", role: "booster", campaign_slug: SLUG, athlete_id: null, account_id: null, salt: "t3" },
};
export function makeWorld() {
    const db = {
        team_coaches: Object.values(COACHES).map(p => ({ ...p })),
        team_members: Object.values(MEMBERS).map(m => ({ ...m })),
        team_member_athletes: [],
        elf_accounts: [
            { id: "acct-asst", name: "Ari Asst", email: "ari@elf.test", salt: "sa2", profile_photo_url: null },
            { id: "acct-admin", name: "Ellie Admin", email: "admin@elf.test", salt: "sa", profile_photo_url: null },
        ],
        platform_admins: [{ id: "pa-1", account_id: "acct-admin", role: "platform_admin" }],
        // added_on: the athlete's local add date (stands in for created_at).
        athletes: [
            { id: A(1), campaign_slug: SLUG, name: "Ava Athlete", class_year: "Senior", added_on: "2026-01-01" },
            { id: A(2), campaign_slug: SLUG, name: "Ben Brown", class_year: "Junior", added_on: "2026-01-01" },
            { id: A(3), campaign_slug: SLUG, name: "Cy Clark", class_year: null, added_on: null },
            { id: A(4), campaign_slug: OTHER, name: "Hawk Kid", class_year: "Senior", added_on: "2026-01-01" },
        ],
    };
    // Saved sessions and records, keyed by `${slug}|${date}`.
    const sessions = new Map();
    const records = new Map();
    const audit = [];
    const saves = [];
    const control = { maxRows: 1000, failPaths: [], missingSchema: false, today: TODAY, timeZone: "America/Phoenix" };
    const requests = [];
    let summaryCalls = 0;
    const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers });
    const raise = (code) => json({ code: "P0001", details: null, hint: null, message: code }, 400);
    const editableDate = (date, today) => date <= today && date >= addCalendarDays(today, -14);
    function summaries(slug, from, to) {
        const out = [];
        for (const s of sessions.values()) {
            if (s.campaign_slug !== slug || s.session_date < from || s.session_date > to)
                continue;
            const recs = records.get(`${slug}|${s.session_date}`) ?? [];
            const onTeam = (r) => r.athlete_id !== null && db.athletes.some(a => a.id === r.athlete_id && a.campaign_slug === slug);
            const cur = recs.filter(onTeam);
            out.push({
                session_id: s.id, session_date: s.session_date, status: s.status, version: s.version, time_zone: s.time_zone,
                editable: s.status === "draft" && editableDate(s.session_date, control.today),
                created_at: "2026-10-19T15:00:00Z", updated_at: "2026-10-19T16:00:00Z",
                created_by_name: s.created_by_name ?? "Hana Head", updated_by_name: s.updated_by_name ?? "Hana Head",
                recorded_count: recs.length,
                present_count: cur.filter(r => r.status === "present").length,
                absent_count: cur.filter(r => r.status === "absent").length,
                excused_count: cur.filter(r => r.absence_reason === "excused").length,
                unexcused_count: cur.filter(r => r.absence_reason === "unexcused").length,
                other_count: cur.filter(r => r.absence_reason === "other").length,
                removed_count: recs.length - cur.length,
            });
        }
        return out;
    }
    function roster(slug, date) {
        const recs = records.get(`${slug}|${date}`) ?? [];
        const out = [];
        for (const a of db.athletes.filter(x => x.campaign_slug === slug)) {
            const r = recs.find(x => x.athlete_id === a.id);
            const after = a.added_on !== null && a.added_on > date;
            out.push({
                record_id: r?.id ?? null, athlete_id: a.id, athlete_name: a.name, class_year: a.class_year, on_roster: true,
                added_after_session_date: after, has_record: !!r, requires_decision: !r && after,
                status: r?.status ?? null, absence_reason: r?.absence_reason ?? null, note: r?.note ?? null,
                record_updated_at: r ? "2026-10-19T16:00:00Z" : null, record_updated_by_name: r ? "Hana Head" : null,
            });
        }
        for (const r of recs) {
            if (r.athlete_id !== null && db.athletes.some(a => a.id === r.athlete_id && a.campaign_slug === slug))
                continue;
            out.push({
                record_id: r.id, athlete_id: r.athlete_id, athlete_name: r.athlete_name_snapshot, class_year: r.class_year_snapshot,
                on_roster: false, added_after_session_date: false, has_record: true, requires_decision: false,
                status: r.status, absence_reason: r.absence_reason, note: r.note,
                record_updated_at: "2026-10-19T16:00:00Z", record_updated_by_name: "Hana Head",
            });
        }
        return out;
    }
    let recordSeq = 100;
    function save(body) {
        saves.push(body);
        if (control.saveError)
            return json(control.saveError.body, control.saveError.status);
        const slug = body.p_campaign_slug, date = body.p_session_date, v = body.p_expected_version;
        const key = `${slug}|${date}`;
        const existing = sessions.get(key);
        if (existing && existing.status !== "draft")
            return raise("attendance_session_not_draft");
        if (date > control.today)
            return raise("attendance_date_in_future");
        if (!editableDate(date, control.today))
            return raise("attendance_date_not_editable");
        if (v === 0 && existing)
            return raise("attendance_version_conflict");
        if (v > 0 && !existing)
            return raise("attendance_session_not_found");
        if (existing && existing.version !== v)
            return raise("attendance_version_conflict");
        const recs = body.p_records;
        const team = db.athletes.filter(a => a.campaign_slug === slug);
        for (const r of recs)
            if (!db.athletes.some(a => a.id === r.athlete_id))
                return raise("attendance_athlete_removed");
        for (const a of team) {
            const required = (a.added_on === null || a.added_on <= date) || (records.get(key) ?? []).some(x => x.athlete_id === a.id);
            if (required && !recs.some(r => r.athlete_id === a.id))
                return raise("attendance_roster_incomplete");
        }
        const session = existing ?? { id: `sess-${date}`, campaign_slug: slug, session_date: date, status: "draft", version: 0, time_zone: control.timeZone };
        session.version = session.version + 1;
        sessions.set(key, session);
        const kept = (records.get(key) ?? []).filter(x => !recs.some(r => r.athlete_id === x.athlete_id));
        records.set(key, [...kept, ...recs.map(r => ({ id: R(++recordSeq), ...r }))]);
        const c = (f) => recs.filter(f).length;
        return json({
            session_id: session.id, session_date: date, version: session.version, saved_at: "2026-10-19T17:00:00Z", created: !existing,
            counts: { total: recs.length, present: c(r => r.status === "present"), absent: c(r => r.status === "absent"),
                excused: c(r => r.absence_reason === "excused"), unexcused: c(r => r.absence_reason === "unexcused"), other: c(r => r.absence_reason === "other") },
        });
    }
    function filterRows(rows, params) {
        let out = rows;
        for (const [k, v] of params.entries()) {
            if (["select", "limit", "offset", "order"].includes(k) || k.startsWith("p_"))
                continue;
            if (v.startsWith("eq."))
                out = out.filter(r => String(r[k]) === v.slice(3));
            else if (v.startsWith("in.("))
                out = out.filter(r => v.slice(4, -1).split(",").includes(String(r[k])));
        }
        return out;
    }
    function orderRows(rows, order) {
        if (!order)
            return rows;
        const keys = order.split(",").map(o => { const [col, dir = "asc", nulls] = o.split("."); return { col, desc: dir === "desc", nullsFirst: nulls === "nullsfirst" }; });
        return [...rows].sort((a, b) => {
            for (const { col, desc, nullsFirst } of keys) {
                const x = a[col], y = b[col];
                if (x === y)
                    continue;
                if (x === null)
                    return nullsFirst ? -1 : 1;
                if (y === null)
                    return nullsFirst ? 1 : -1;
                return (x < y ? -1 : 1) * (desc ? -1 : 1);
            }
            return 0;
        });
    }
    async function fetchImpl(url, init) {
        const path = url.replace(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, "");
        const method = init?.method ?? "GET";
        requests.push(`${method} ${path}`);
        const [resource, query = ""] = path.split("?");
        const params = new URLSearchParams(query);
        if (control.failPaths.some(p => path.includes(p)))
            return json({ code: "XX000", message: `boom ${SECRET_NOTE}` }, 500);
        if (control.missingSchema && resource.startsWith("rpc/team_attendance")) {
            return json({ code: "PGRST202", message: "Could not find the function" }, 404);
        }
        if (method === "POST") {
            const body = JSON.parse(String(init?.body ?? "null"));
            if (resource === "audit_logs") {
                audit.push(body);
                return json(null, 201);
            }
            if (resource === "rpc/team_attendance_save_draft")
                return save(body);
            return json({ code: "XX000", message: "unexpected write" }, 405);
        }
        if (resource === "rpc/team_attendance_today")
            return json(control.today);
        if (resource === "rpc/team_attendance_time_zone")
            return json(control.timeZone);
        if (resource === "rpc/team_attendance_date_editable")
            return json(editableDate(params.get("p_session_date"), params.get("p_today")));
        let all;
        if (resource === "rpc/team_attendance_session_summaries") {
            control.onSummaries?.(++summaryCalls);
            all = summaries(params.get("p_campaign_slug"), params.get("p_from"), params.get("p_to"));
        }
        else if (resource === "rpc/team_attendance_session_roster") {
            all = roster(params.get("p_campaign_slug"), params.get("p_session_date"));
        }
        else {
            const table = db[resource];
            if (!table)
                return json([]);
            all = filterRows(table, params);
        }
        all = orderRows(all, params.get("order"));
        const offset = Number(params.get("offset") ?? 0);
        const limit = Math.min(Number(params.get("limit") ?? Infinity), control.maxRows);
        let page = all.slice(offset, offset + limit);
        let total = all.length;
        const t = control.tamper?.(resource, page, all.length, offset);
        if (t)
            ({ page, total } = t);
        const counted = (init?.headers ?? {}).Prefer === "count=exact";
        const headers = {};
        if (total !== null)
            headers["content-range"] = `${page.length ? `${offset}-${offset + page.length - 1}` : "*"}/${counted ? total : "*"}`;
        return json(page, 200, headers);
    }
    return { db, sessions, records, audit, saves, control, requests, fetchImpl };
}
export async function withWorld(run) {
    const w = makeWorld();
    const realFetch = globalThis.fetch;
    globalThis.fetch = w.fetchImpl;
    try {
        return await run(w);
    }
    finally {
        globalThis.fetch = realFetch;
        clearCookies();
    }
}
export function clearCookies() {
    for (const c of ["elf_session", "team_member", "team_coach"])
        __setTestCookie(c, undefined);
}
export const as = {
    coach: (p) => { clearCookies(); __setTestCookie("team_coach", makeCoachCookie(p.id, p.salt)); },
    member: (m) => { clearCookies(); __setTestCookie("team_member", makeMemberCookie(m.id, m.salt)); },
    account: (id, salt) => { clearCookies(); __setTestCookie("elf_session", makeAccountCookie(id, salt)); },
    forged: () => { clearCookies(); __setTestCookie("team_coach", makeCoachCookie(COACHES.head.id, "wrong-salt")); },
    nobody: () => clearCookies(),
};
export const ROLES = {
    head: () => as.coach(COACHES.head),
    assistant: () => as.account("acct-asst", "sa2"),
    admin: () => as.account("acct-admin", "sa"),
    boosterCoach: () => as.coach(COACHES.booster),
    boosterMember: () => as.member(MEMBERS.booster),
    parent: () => as.member(MEMBERS.parent),
    athlete: () => as.member(MEMBERS.athlete),
    otherTeamHead: () => as.coach(COACHES.hawkHead),
    forged: () => as.forged(),
    nobody: () => as.nobody(),
};
export const base = `http://test.local/api/team/${SLUG}/attendance`;
export async function list(query = "", slug = SLUG) {
    const { GET } = await import("../route.ts");
    return GET(new NextRequest(`${base}${query}`, { method: "GET" }), { params: Promise.resolve({ slug }) });
}
export async function load(date, slug = SLUG) {
    const { GET } = await import("../[date]/route.ts");
    return GET(new NextRequest(`${base}/${date}`, { method: "GET" }), { params: Promise.resolve({ slug, date }) });
}
export async function put(date, body, opts = {}) {
    const { PUT } = await import("../[date]/route.ts");
    const req = new NextRequest(`${base}/${date}${opts.query ?? ""}`, {
        method: "PUT",
        headers: { "content-type": opts.type ?? "application/json", "user-agent": "TestAgent", "x-forwarded-for": "203.0.113.7", ...opts.headers },
        body: opts.raw ?? JSON.stringify(body),
    });
    return PUT(req, { params: Promise.resolve({ slug: opts.slug ?? SLUG, date }) });
}
export const body = async (res) => JSON.parse(await res.text());
export const everyone = (status = "present") => [A(1), A(2), A(3)].map(id => ({ athlete_id: id, status }));
export const attendanceRequests = (w) => w.requests.filter(r => r.includes("team_attendance"));
