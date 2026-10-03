// Contacts GET/POST/PATCH/DELETE — Family Relationships Phase B follow-up
// (multi-child read/create support). Exercises the real route handlers
// under `node --test` via the shared next/server + next/headers module
// resolution hook (src/lib/testSupport/nextStubLoader.mjs) — same
// technique already used for the roster-import route tests and
// accountSession.test.ts. Session resolution goes through the REAL
// getTeamActor() -> legacy team_member/team_coach cookie path (real
// makeMemberCookie/makeCoachCookie, real verify functions) against a
// fetch-mocked in-memory Supabase layer — nothing about authentication
// itself is stubbed, only the network.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.TEAM_MEMBER_PEPPER        = "fake-member-pepper";
process.env.TEAM_COACH_PEPPER         = "fake-coach-pepper";

register(new URL("../../../../../lib/testSupport/nextStubLoader.mjs", import.meta.url).href, import.meta.url);

const { __setTestCookie } = await import("../../../../../lib/testSupport/nextHeadersStub.mjs");
const { makeMemberCookie } = await import("@/lib/memberAuth");
const { makeCoachCookie }  = await import("@/lib/teamAuth");

type Row = Record<string, unknown>;

function makeFakeDb() {
  const db: Record<string, Row[]> = {
    campaign_settings:          [],
    campaign_coach_fundraisers: [],
    team_coaches:               [],
    team_members:               [],
    team_member_athletes:       [],
    fundraising_contacts:       [],
    fundraising_contact_goals:  [],
  };
  let nextId = 1;
  const genId = () => `contact-${nextId++}`;

  function matches(row: Row, field: string, expr: string): boolean {
    if (expr.startsWith("eq.")) return String(row[field]) === expr.slice(3);
    if (expr === "is.null") return row[field] === null || row[field] === undefined;
    if (expr === "not.is.null") return row[field] !== null && row[field] !== undefined;
    if (expr.startsWith("in.(") && expr.endsWith(")")) {
      const ids = expr.slice(4, -1).split(",").map(decodeURIComponent);
      return ids.includes(String(row[field]));
    }
    return true;
  }

  function select(table: Row[], params: URLSearchParams): Row[] {
    let rows = table;
    for (const [key, val] of params.entries()) {
      if (key === "select" || key === "limit" || key === "order") continue;
      rows = rows.filter(r => matches(r, key, val));
    }
    const limit = params.get("limit");
    if (limit) rows = rows.slice(0, parseInt(limit, 10));
    return rows.map(r => ({ ...r }));
  }

  async function fetchImpl(url: string, init?: RequestInit): Promise<Response> {
    const path = url.replace(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, "");
    const [table, query] = path.split("?");
    const params = new URLSearchParams(query ?? "");
    const method = init?.method ?? "GET";
    const tableRows = db[table];
    if (!tableRows) return new Response(JSON.stringify([]), { status: 200 });

    if (method === "GET") {
      const rows = select(tableRows, params);
      const res = new Response(JSON.stringify(rows), {
        status: 200,
        headers: { "content-range": `0-${rows.length}/${rows.length}` },
      });
      return res;
    }
    if (method === "POST") {
      const body = JSON.parse(init!.body as string);
      const row: Row = { id: genId(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...body };
      tableRows.push(row);
      return new Response(JSON.stringify([row]), { status: 201 });
    }
    if (method === "PATCH") {
      const patch = JSON.parse(init!.body as string);
      const matched = select(tableRows, params);
      const matchedIds = new Set(matched.map(r => r.id));
      const updated: Row[] = [];
      for (const row of tableRows) {
        if (matchedIds.has(row.id)) { Object.assign(row, patch); updated.push({ ...row }); }
      }
      return new Response(JSON.stringify(updated), { status: 200 });
    }
    if (method === "DELETE") {
      const matched = select(tableRows, params);
      const matchedIds = new Set(matched.map(r => r.id));
      db[table] = tableRows.filter(r => !matchedIds.has(r.id));
      return new Response(JSON.stringify(matched), { status: 200 });
    }
    return new Response(JSON.stringify([]), { status: 200 });
  }

  return { db, fetchImpl };
}

async function withFakeDb<T>(run: (ctx: ReturnType<typeof makeFakeDb>) => Promise<T>): Promise<T> {
  const ctx = makeFakeDb();
  const realFetch = globalThis.fetch;
  globalThis.fetch = ctx.fetchImpl as typeof fetch;
  try {
    return await run(ctx);
  } finally {
    globalThis.fetch = realFetch;
  }
}

function clearCookies() {
  __setTestCookie("elf_session", undefined);
  __setTestCookie("team_member", undefined);
  __setTestCookie("team_coach", undefined);
}

function signInAsMember(member: { id: string; salt: string }) {
  clearCookies();
  __setTestCookie("team_member", makeMemberCookie(member.id, member.salt));
}

function signInAsCoach(coach: { id: string; salt: string }) {
  clearCookies();
  __setTestCookie("team_coach", makeCoachCookie(coach.id, coach.salt));
}

async function loadGetPost() {
  return import("./route.ts");
}
async function loadIdRoute() {
  return import("./[id]/route.ts");
}

const SLUG = "wolves";

function seedParentAndChildren(db: ReturnType<typeof makeFakeDb>["db"]) {
  db.team_members.push(
    { id: "emma-member", role: "athlete", name: "Emma", athlete_id: "athlete-emma", campaign_slug: SLUG, account_id: null, salt: "s-emma" },
    { id: "jake-member", role: "athlete", name: "Jake", athlete_id: "athlete-jake", campaign_slug: SLUG, account_id: null, salt: "s-jake" },
    { id: "parent-member", role: "parent", name: "Sarah", athlete_id: "athlete-emma", campaign_slug: SLUG, account_id: null, salt: "s-parent" },
  );
  // Jake is linked only through the join table (second child, no legacy column).
  db.team_member_athletes.push({ team_member_id: "parent-member", athlete_id: "athlete-jake" });
}

function postRequest(body: unknown): Request {
  return new Request(`http://test.local/api/team/${SLUG}/contacts`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
}
function getRequest(query = ""): Request {
  const req = new Request(`http://test.local/api/team/${SLUG}/contacts${query}`);
  // The route reads req.nextUrl.searchParams (a NextRequest-only property) —
  // our stubbed NextRequest class isn't used here since plain Request
  // already satisfies every other method the routes call, so this adds
  // just that one property rather than switching construction entirely.
  Object.defineProperty(req, "nextUrl", { get: () => new URL(req.url) });
  return req;
}

// ── 1. Single-child parent GET unchanged ──────────────────────────────────

test("1. single-child parent GET returns their one child's contacts, unaffected by this follow-up", async () => {
  await withFakeDb(async ({ db }) => {
    db.team_members.push({ id: "m1", role: "parent", name: "Lone Parent", athlete_id: "athlete-solo", campaign_slug: SLUG, account_id: null, salt: "s1" });
    db.fundraising_contacts.push({ id: "c1", campaign_slug: SLUG, athlete_id: "athlete-solo", coach_id: null, phone: "555-0001" });
    signInAsMember({ id: "m1", salt: "s1" });

    const { GET } = await loadGetPost();
    const res = await GET(getRequest() as never, { params: Promise.resolve({ slug: SLUG }) });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.contacts.length, 1);
    assert.equal(data.contacts[0].id, "c1");
  });
});

// ── 2 & 3. Multi-child parent selects Athlete A / Athlete B ──────────────

test("2. multi-child parent, Athlete A (legacy) selected — only Athlete A's contacts returned", async () => {
  await withFakeDb(async ({ db }) => {
    seedParentAndChildren(db);
    db.fundraising_contacts.push(
      { id: "c-emma", campaign_slug: SLUG, athlete_id: "athlete-emma", coach_id: null },
      { id: "c-jake", campaign_slug: SLUG, athlete_id: "athlete-jake", coach_id: null },
    );
    signInAsMember({ id: "parent-member", salt: "s-parent" });

    const { GET } = await loadGetPost();
    const res = await GET(getRequest("?athleteId=athlete-emma") as never, { params: Promise.resolve({ slug: SLUG }) });
    const data = await res.json();
    assert.deepEqual(data.contacts.map((c: Row) => c.id), ["c-emma"]);
  });
});

test("3. multi-child parent, Athlete B (join-table-only) selected — only Athlete B's contacts returned", async () => {
  await withFakeDb(async ({ db }) => {
    seedParentAndChildren(db);
    db.fundraising_contacts.push(
      { id: "c-emma", campaign_slug: SLUG, athlete_id: "athlete-emma", coach_id: null },
      { id: "c-jake", campaign_slug: SLUG, athlete_id: "athlete-jake", coach_id: null },
    );
    signInAsMember({ id: "parent-member", salt: "s-parent" });

    const { GET } = await loadGetPost();
    const res = await GET(getRequest("?athleteId=athlete-jake") as never, { params: Promise.resolve({ slug: SLUG }) });
    const data = await res.json();
    assert.deepEqual(data.contacts.map((c: Row) => c.id), ["c-jake"]);
  });
});

// ── 4. Join-table-only second child works (same as test 3, stated explicitly) ──

test("4. join-table-only second child (Jake) is a valid, selectable linked athlete", async () => {
  await withFakeDb(async ({ db }) => {
    seedParentAndChildren(db);
    signInAsMember({ id: "parent-member", salt: "s-parent" });
    const { GET } = await loadGetPost();
    const res = await GET(getRequest("?athleteId=athlete-jake") as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(res.status, 200);
  });
});

// ── 5. Tampered/unrelated athlete GET cannot expose contacts ─────────────

test("5. a tampered ?athleteId= for an UNRELATED athlete never exposes that athlete's contacts", async () => {
  await withFakeDb(async ({ db }) => {
    seedParentAndChildren(db);
    db.fundraising_contacts.push(
      { id: "c-emma", campaign_slug: SLUG, athlete_id: "athlete-emma", coach_id: null },
      { id: "c-stranger", campaign_slug: SLUG, athlete_id: "athlete-stranger", coach_id: null },
    );
    signInAsMember({ id: "parent-member", salt: "s-parent" });

    const { GET } = await loadGetPost();
    const res = await GET(getRequest("?athleteId=athlete-stranger") as never, { params: Promise.resolve({ slug: SLUG }) });
    const data = await res.json();
    const returnedIds = data.contacts.map((c: Row) => c.id);
    // Falls back to one of the parent's OWN linked athletes (never requires
    // a specific one) — the only hard guarantee is it's never the
    // stranger's contact.
    assert.ok(!returnedIds.includes("c-stranger"), "must never expose the unrelated athlete's contacts");
    assert.ok(
      returnedIds.length === 0 || returnedIds.every((id: string) => id === "c-emma"),
      "any returned contact must belong to a linked athlete, not the stranger",
    );
  });
});

// ── 6 & 7. POST for selected linked athlete / unrelated athlete ──────────

test("6. POST for the explicitly selected linked Athlete B (join-table-only) succeeds and is owned by Athlete B", async () => {
  await withFakeDb(async ({ db }) => {
    seedParentAndChildren(db);
    signInAsMember({ id: "parent-member", salt: "s-parent" });

    const { POST } = await loadGetPost();
    const res = await POST(postRequest({ phone: "555-1234", athleteId: "athlete-jake" }) as never, { params: Promise.resolve({ slug: SLUG }) });
    const created = await res.json();
    assert.equal(res.status, 201);
    assert.equal(created.athlete_id, "athlete-jake");
  });
});

test("7. POST with an UNRELATED athleteId cannot create a contact for that athlete — falls back to a linked one", async () => {
  await withFakeDb(async ({ db }) => {
    seedParentAndChildren(db);
    signInAsMember({ id: "parent-member", salt: "s-parent" });

    const { POST } = await loadGetPost();
    const res = await POST(postRequest({ phone: "555-5678", athleteId: "athlete-stranger" }) as never, { params: Promise.resolve({ slug: SLUG }) });
    const created = await res.json();
    assert.equal(res.status, 201);
    assert.notEqual(created.athlete_id, "athlete-stranger");
    assert.ok(created.athlete_id === "athlete-emma" || created.athlete_id === "athlete-jake");
  });
});

test("single-child parent POST is unaffected (no athleteId sent, resolves to their one child)", async () => {
  await withFakeDb(async ({ db }) => {
    db.team_members.push({ id: "m1", role: "parent", name: "Lone Parent", athlete_id: "athlete-solo", campaign_slug: SLUG, account_id: null, salt: "s1" });
    signInAsMember({ id: "m1", salt: "s1" });
    const { POST } = await loadGetPost();
    const res = await POST(postRequest({ phone: "555-0000" }) as never, { params: Promise.resolve({ slug: SLUG }) });
    const created = await res.json();
    assert.equal(res.status, 201);
    assert.equal(created.athlete_id, "athlete-solo");
  });
});

// ── 8 & 9. PATCH/DELETE for join-table-only child remain authorized ──────

test("8. PATCH for a contact belonging to a join-table-only child (Jake) remains authorized for that parent", async () => {
  await withFakeDb(async ({ db }) => {
    seedParentAndChildren(db);
    db.fundraising_contacts.push({ id: "c-jake", campaign_slug: SLUG, athlete_id: "athlete-jake", coach_id: null, phone: "555-0001" });
    signInAsMember({ id: "parent-member", salt: "s-parent" });

    const { PATCH } = await loadIdRoute();
    const req = new Request(`http://test.local/api/team/${SLUG}/contacts/c-jake`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: "555-9999" }),
    });
    const res = await PATCH(req as never, { params: Promise.resolve({ slug: SLUG, id: "c-jake" }) });
    assert.equal(res.status, 200);
  });
});

test("9. DELETE for a contact belonging to a join-table-only child (Jake) remains authorized for that parent", async () => {
  await withFakeDb(async ({ db }) => {
    seedParentAndChildren(db);
    db.fundraising_contacts.push({ id: "c-jake", campaign_slug: SLUG, athlete_id: "athlete-jake", coach_id: null });
    signInAsMember({ id: "parent-member", salt: "s-parent" });

    const { DELETE } = await loadIdRoute();
    const req = new Request(`http://test.local/api/team/${SLUG}/contacts/c-jake`, { method: "DELETE" });
    const res = await DELETE(req as never, { params: Promise.resolve({ slug: SLUG, id: "c-jake" }) });
    assert.equal(res.status, 204);
    assert.equal(db.fundraising_contacts.length, 0);
  });
});

// ── 10. Parent cannot manage an unrelated athlete's contact ──────────────

test("10. a parent cannot PATCH or DELETE an unrelated athlete's contact", async () => {
  await withFakeDb(async ({ db }) => {
    seedParentAndChildren(db);
    db.fundraising_contacts.push({ id: "c-stranger", campaign_slug: SLUG, athlete_id: "athlete-stranger", coach_id: null, phone: "555-0001" });
    signInAsMember({ id: "parent-member", salt: "s-parent" });

    const { PATCH, DELETE } = await loadIdRoute();
    const patchReq = new Request(`http://test.local/api/team/${SLUG}/contacts/c-stranger`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: "555-1111" }),
    });
    const patchRes = await PATCH(patchReq as never, { params: Promise.resolve({ slug: SLUG, id: "c-stranger" }) });
    assert.equal(patchRes.status, 403);

    const deleteReq = new Request(`http://test.local/api/team/${SLUG}/contacts/c-stranger`, { method: "DELETE" });
    const deleteRes = await DELETE(deleteReq as never, { params: Promise.resolve({ slug: SLUG, id: "c-stranger" }) });
    assert.equal(deleteRes.status, 403);
    assert.equal(db.fundraising_contacts.length, 1, "the unrelated contact must not be deleted");
  });
});

// ── 11. Coach/staff existing access remains unchanged ────────────────────

test("11. an eligible participating coach's GET/POST behavior is unaffected by family-relationship logic", async () => {
  await withFakeDb(async ({ db }) => {
    db.campaign_settings.push({ campaign_slug: SLUG, allow_coach_fundraising: true });
    db.team_coaches.push({ id: "coach-1", name: "Coach Mike", role: "head_coach", campaign_slug: SLUG, salt: "s-coach" });
    db.campaign_coach_fundraisers.push({ id: "p1", campaign_slug: SLUG, coach_id: "coach-1", active: true, goal_cents: null });
    db.fundraising_contacts.push({ id: "c-coach", campaign_slug: SLUG, athlete_id: null, coach_id: "coach-1" });
    signInAsCoach({ id: "coach-1", salt: "s-coach" });

    const { GET, POST } = await loadGetPost();
    const getRes = await GET(getRequest() as never, { params: Promise.resolve({ slug: SLUG }) });
    const getData = await getRes.json();
    assert.equal(getRes.status, 200);
    assert.deepEqual(getData.contacts.map((c: Row) => c.id), ["c-coach"]);

    const postRes = await POST(postRequest({ phone: "555-2222" }) as never, { params: Promise.resolve({ slug: SLUG }) });
    const created = await postRes.json();
    assert.equal(postRes.status, 201);
    assert.equal(created.coach_id, "coach-1");
    assert.equal(created.athlete_id, null);
  });
});

// ── 12. Campaign isolation ────────────────────────────────────────────────

test("12. campaign isolation — a same-athlete-id row's contacts on a DIFFERENT campaign are never returned", async () => {
  await withFakeDb(async ({ db }) => {
    db.team_members.push({ id: "m1", role: "parent", name: "Parent", athlete_id: "athlete-x", campaign_slug: SLUG, account_id: null, salt: "s1" });
    db.fundraising_contacts.push(
      { id: "c-here", campaign_slug: SLUG, athlete_id: "athlete-x", coach_id: null },
      { id: "c-other-campaign", campaign_slug: "falcons", athlete_id: "athlete-x", coach_id: null },
    );
    signInAsMember({ id: "m1", salt: "s1" });

    const { GET } = await loadGetPost();
    const res = await GET(getRequest() as never, { params: Promise.resolve({ slug: SLUG }) });
    const data = await res.json();
    assert.deepEqual(data.contacts.map((c: Row) => c.id), ["c-here"]);
  });
});
