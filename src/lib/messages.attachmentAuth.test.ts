// Phase A40 — proves resolveAuthorizedAttachment (the single chokepoint
// shared by the attachment download route and the viewer page) rejects a
// moderation-removed attachment exactly the way it already rejects a
// pending/unclaimed one — an old URL/path can never still open removed
// content. Same in-memory PostgREST-fake approach as other lib tests.
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

type Row = Record<string, unknown>;

function makeFakeDb() {
  const db: Record<string, Row[]> = { message_attachments: [], messages: [], message_thread_participants: [] };

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

const { resolveAuthorizedAttachment } = await import("./messages.ts");

function reset() {
  db.message_attachments.length = 0;
  db.messages.length = 0;
  db.message_thread_participants.length = 0;
  db.messages.push({ id: "m1", thread_id: "t1" });
  db.message_thread_participants.push({ id: "p1", thread_id: "t1", actor_type: "member", member_id: "mem-1" });
}

test("a moderation-removed attachment is rejected exactly like a pending one — old URL/path never still opens it", async () => {
  reset();
  db.message_attachments.push({
    id: "a1", thread_id: "t1", message_id: "m1", status: "attached",
    storage_path: "t1/a1.jpg", removed_at: new Date().toISOString(),
  });
  const result = await resolveAuthorizedAttachment("a1", { kind: "member", id: "mem-1" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 404);
    assert.equal(result.error, "File not found.");
  }
});

test("a non-removed attachment is still authorized normally for a real participant", async () => {
  reset();
  db.message_attachments.push({
    id: "a2", thread_id: "t1", message_id: "m1", status: "attached",
    storage_path: "t1/a2.jpg", removed_at: null,
  });
  const result = await resolveAuthorizedAttachment("a2", { kind: "member", id: "mem-1" });
  assert.equal(result.ok, true);
});

test("a removed attachment is rejected even for a thread participant who WOULD otherwise be authorized", async () => {
  reset();
  db.message_attachments.push({
    id: "a3", thread_id: "t1", message_id: "m1", status: "attached",
    storage_path: "t1/a3.jpg", removed_at: new Date().toISOString(),
  });
  // Same participant as the "still authorized" case above — the only
  // difference is removed_at, proving that's what's actually gating this.
  const result = await resolveAuthorizedAttachment("a3", { kind: "member", id: "mem-1" });
  assert.equal(result.ok, false);
});
