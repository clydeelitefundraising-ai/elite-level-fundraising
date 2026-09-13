// Phase A37 (blocking extended to comments) — same in-memory
// PostgREST-fake approach as src/lib/moderation/blocks.test.ts.
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

type Row = Record<string, unknown>;

function makeFakeDb() {
  const db: Record<string, Row[]> = { announcement_comments: [] };

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
    return rows.map(r => ({ ...r }));
  }
  async function handle(url: string): Promise<Response> {
    const path = url.replace("https://fake.supabase.co/rest/v1/", "");
    const { table, params } = parseFilters(path);
    const tableRows = db[table];
    if (!tableRows) return new Response(JSON.stringify([]), { status: 200 });
    return new Response(JSON.stringify(select(tableRows, params)), { status: 200 });
  }
  return { db, handle };
}

const { db, handle } = makeFakeDb();
globalThis.fetch = (async (url: string | URL) => handle(String(url))) as typeof fetch;

const { getVisibleComments } = await import("./comments.ts");

const SLUG = "monroe-valley";
function reset() { db.announcement_comments.length = 0; }

function seedComment(overrides: Partial<Row>) {
  db.announcement_comments.push({
    id: `c-${db.announcement_comments.length + 1}`,
    campaign_slug: SLUG,
    announcement_id: "ann-1",
    author_type: "member",
    author_coach_id: null,
    author_member_id: "blocked-member-1",
    author_platform_admin_id: null,
    author_name: "Blocked Member",
    author_role: "athlete",
    body: "hello",
    status: "approved",
    decided_by_coach_id: null,
    decided_by_platform_admin_id: null,
    decided_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  });
}

test("a comment from a blocked author is hidden from the blocker's own view", async () => {
  reset();
  seedComment({});
  const viewer = { kind: "member" as const, id: "viewer-1" };
  const blocked = new Set(["member:blocked-member-1"]);
  const visible = await getVisibleComments("ann-1", SLUG, viewer, false, blocked);
  assert.equal(visible.length, 0);
});

test("the same comment remains fully visible to the Head Coach regardless of the Head Coach's own blocks", async () => {
  reset();
  seedComment({});
  const headCoach = { kind: "coach" as const, id: "hc-1" };
  // Even if the Head Coach had blocked this author, moderation must still see it —
  // callers are expected to pass an empty set for a head coach (see the API route),
  // but this proves the function itself also never applies blocking when actorIsHeadCoach.
  const blocked = new Set(["member:blocked-member-1"]);
  const visible = await getVisibleComments("ann-1", SLUG, headCoach, true, blocked);
  assert.equal(visible.length, 1);
});

test("a non-blocked author's comment is unaffected by an unrelated block", async () => {
  reset();
  seedComment({ author_member_id: "someone-else" });
  const viewer = { kind: "member" as const, id: "viewer-1" };
  const blocked = new Set(["member:blocked-member-1"]);
  const visible = await getVisibleComments("ann-1", SLUG, viewer, false, blocked);
  assert.equal(visible.length, 1);
});

test("no blockedAuthorKeys argument (default) behaves exactly as before — no regression for existing callers", async () => {
  reset();
  seedComment({});
  const viewer = { kind: "member" as const, id: "viewer-1" };
  const visible = await getVisibleComments("ann-1", SLUG, viewer, false);
  assert.equal(visible.length, 1);
});

test("unblocking (an empty blockedAuthorKeys set) restores visibility", async () => {
  reset();
  seedComment({});
  const viewer = { kind: "member" as const, id: "viewer-1" };
  const stillBlocked = await getVisibleComments("ann-1", SLUG, viewer, false, new Set(["member:blocked-member-1"]));
  assert.equal(stillBlocked.length, 0);
  const afterUnblock = await getVisibleComments("ann-1", SLUG, viewer, false, new Set());
  assert.equal(afterUnblock.length, 1);
});
