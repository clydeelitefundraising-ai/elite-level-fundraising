// Phase A40 — proves getMessagesForThread()/getResolvedMessageById()
// (via the shared toResolvedMessage()) always substitute the neutral
// placeholder and empty attachments for a moderation-removed message,
// regardless of what's actually stored in `body`/`message_attachments` —
// the defense-in-depth chokepoint described in messages.ts. Same
// in-memory PostgREST-fake approach as other lib tests in this repo.
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

type Row = Record<string, unknown>;

function makeFakeDb() {
  const db: Record<string, Row[]> = { messages: [], message_reads: [] };

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
      if (["select", "limit", "order"].includes(key) || key.startsWith("message_attachments.")) continue;
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

const { getMessagesForThread } = await import("./messages.ts");

function reset() {
  db.messages.length = 0;
  db.message_reads.length = 0;
}

function seedMessage(overrides: Partial<Row>) {
  db.messages.push({
    id: "m1", thread_id: "t1", sender_type: "member", sender_coach_id: null, sender_member_id: "mem-1",
    sender_platform_admin_id: null, sender_name: "Casey Athlete", sender_role: "athlete",
    body: "original text", created_at: new Date().toISOString(), deleted_at: null,
    team_coaches: null, team_members: null, message_attachments: [],
    ...overrides,
  });
}

test("a moderation-removed message never returns its original body or attachments to the client", async () => {
  reset();
  seedMessage({
    deleted_at: new Date().toISOString(),
    // Even if the row STILL somehow held the original content (it
    // shouldn't, since removeMessage() blanks it — this simulates a bug
    // in that write path), toResolvedMessage must still never leak it.
    body: "original text that should never be seen",
    message_attachments: [{ id: "a1", original_filename: "x.jpg", mime_type: "image/jpeg", byte_size: 10, attachment_kind: "image", created_at: new Date().toISOString() }],
  });
  const [msg] = await getMessagesForThread("t1", { kind: "member", id: "mem-1" });
  assert.equal(msg.removed, true);
  assert.equal(msg.body, "Message removed by moderator");
  assert.deepEqual(msg.attachments, []);
});

test("an ordinary, non-removed message is completely unaffected", async () => {
  reset();
  seedMessage({});
  const [msg] = await getMessagesForThread("t1", { kind: "member", id: "mem-1" });
  assert.equal(msg.removed, false);
  assert.equal(msg.body, "original text");
});
