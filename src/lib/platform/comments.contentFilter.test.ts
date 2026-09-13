// Phase A39 — proves the content filter runs on comment creation WITHOUT
// disturbing the existing pending/Head-Coach-approval flow. Same
// in-memory PostgREST-fake approach as comments.blocking.test.ts.
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

type Row = Record<string, unknown>;

function makeFakeDb() {
  const db: Record<string, Row[]> = { announcements: [], announcement_comments: [] };
  let nextId = 1;

  function parseFilters(qs: string) {
    const [table, query] = qs.split("?");
    return { table, params: new URLSearchParams(query ?? "") };
  }
  function matchesFilter(row: Row, field: string, expr: string): boolean {
    if (expr.startsWith("eq.")) return String(row[field]) === expr.slice(3);
    return true;
  }
  function select(table: Row[], params: URLSearchParams): Row[] {
    let rows = table;
    for (const [key, val] of params.entries()) {
      if (["select", "limit", "order"].includes(key)) continue;
      rows = rows.filter(r => matchesFilter(r, key, val));
    }
    const limit = params.get("limit");
    if (limit) rows = rows.slice(0, parseInt(limit, 10));
    return rows.map(r => ({ ...r }));
  }
  async function handle(url: string, init?: RequestInit): Promise<Response> {
    const path = url.replace("https://fake.supabase.co/rest/v1/", "");
    const { table, params } = parseFilters(path);
    const method = init?.method ?? "GET";
    const tableRows = db[table];
    if (!tableRows) return new Response(JSON.stringify([]), { status: 200 });
    if (method === "GET") return new Response(JSON.stringify(select(tableRows, params)), { status: 200 });
    if (method === "POST") {
      const body = JSON.parse(init!.body as string);
      const row: Row = { id: `c-${nextId++}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...body };
      tableRows.push(row);
      return new Response(JSON.stringify([row]), { status: 201 });
    }
    return new Response(JSON.stringify([]), { status: 200 });
  }
  return { db, handle };
}

const { db, handle } = makeFakeDb();
globalThis.fetch = (async (url: string | URL, init?: RequestInit) => handle(String(url), init)) as typeof fetch;

const { createComment } = await import("./comments.ts");

const SLUG = "monroe-valley";
function reset() {
  db.announcements.length = 0;
  db.announcement_comments.length = 0;
  db.announcements.push({ id: "ann-1", campaign_slug: SLUG, title: "Practice moved" });
}

test("a comment containing prohibited content is rejected before it ever reaches the pending queue", async () => {
  reset();
  const result = await createComment({
    campaignSlug: SLUG, announcementId: "ann-1", actor: { kind: "member", id: "mem-1" },
    isHeadCoachAuthor: false, authorName: "Casey Athlete", authorRole: "athlete",
    body: "you are a faggot",
  });
  assert.equal(result.ok, false);
  assert.equal(db.announcement_comments.length, 0, "rejected content must never be inserted at all");
});

test("an ordinary comment from a non-head-coach still lands as pending — the filter does not weaken existing approval", async () => {
  reset();
  const result = await createComment({
    campaignSlug: SLUG, announcementId: "ann-1", actor: { kind: "member", id: "mem-1" },
    isHeadCoachAuthor: false, authorName: "Casey Athlete", authorRole: "athlete",
    body: "Looking forward to the meet!",
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.comment.status, "pending");
});

test("a Head-Coach-authored comment still auto-approves when it passes the filter", async () => {
  reset();
  const result = await createComment({
    campaignSlug: SLUG, announcementId: "ann-1", actor: { kind: "coach", id: "hc-1" },
    isHeadCoachAuthor: true, authorName: "Coach Lee", authorRole: "head_coach",
    body: "Great job everyone today.",
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.comment.status, "approved");
});

test("a Head-Coach-authored comment is STILL rejected by the filter — no author is exempt", async () => {
  reset();
  const result = await createComment({
    campaignSlug: SLUG, announcementId: "ann-1", actor: { kind: "coach", id: "hc-1" },
    isHeadCoachAuthor: true, authorName: "Coach Lee", authorRole: "head_coach",
    body: "n1gg3r",
  });
  assert.equal(result.ok, false);
  assert.equal(db.announcement_comments.length, 0);
});
