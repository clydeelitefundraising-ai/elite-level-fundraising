// Same in-memory PostgREST-fake approach as other lib tests, extended
// with a storage-call capture (this module also issues Supabase Storage
// DELETE requests).
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

type Row = Record<string, unknown>;

function makeFakeDb() {
  const db: Record<string, Row[]> = { message_threads: [], messages: [], message_attachments: [] };
  const storageDeleteCalls: { bucket: string; paths: string[] }[] = [];

  function parseFilters(qs: string) {
    const [table, query] = qs.split("?");
    return { table, params: new URLSearchParams(query ?? "") };
  }
  function matchesFilter(row: Row, field: string, expr: string): boolean {
    if (expr.startsWith("eq."))  return String(row[field]) === expr.slice(3);
    if (expr === "is.null")      return row[field] === null || row[field] === undefined;
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
  async function handle(url: string, init?: RequestInit): Promise<Response> {
    if (url.includes("/storage/v1/object/")) {
      const bucket = url.split("/storage/v1/object/")[1];
      const body = init?.body ? JSON.parse(init.body as string) : {};
      storageDeleteCalls.push({ bucket, paths: body.prefixes ?? [] });
      return new Response(JSON.stringify({}), { status: 200 });
    }
    const path = url.replace("https://fake.supabase.co/rest/v1/", "");
    const { table, params } = parseFilters(path);
    const method = init?.method ?? "GET";
    const tableRows = db[table];
    if (!tableRows) return new Response(JSON.stringify([]), { status: 200 });

    if (method === "GET") return new Response(JSON.stringify(select(tableRows, params)), { status: 200 });
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
    return new Response(JSON.stringify([]), { status: 200 });
  }
  return { db, storageDeleteCalls, handle };
}

const { db, storageDeleteCalls, handle } = makeFakeDb();
globalThis.fetch = (async (url: string | URL, init?: RequestInit) => handle(String(url), init)) as typeof fetch;

const { removeMessage, removeAttachment, resolveCampaignSlugForMessage, resolveCampaignSlugForAttachment } = await import("./messageModeration.ts");

const SLUG = "monroe-valley";
function reset() {
  for (const k of Object.keys(db)) db[k].length = 0;
  storageDeleteCalls.length = 0;
  db.message_threads.push({ id: "t1", campaign_slug: SLUG });
  db.message_threads.push({ id: "t2", campaign_slug: "other-team" });
}

test("removeMessage blanks the body, sets deleted_at, and removes+storage-cleans its attachments", async () => {
  reset();
  db.messages.push({ id: "m1", thread_id: "t1", body: "objectionable text", deleted_at: null });
  db.message_attachments.push(
    { id: "a1", message_id: "m1", storage_path: "t1/a1.jpg", removed_at: null },
    { id: "a2", message_id: "m1", storage_path: "t1/a2.jpg", removed_at: null },
  );

  const result = await removeMessage("m1", SLUG);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.attachmentsRemoved, 2);

  const msg = db.messages.find(m => m.id === "m1")!;
  assert.equal(msg.body, "");
  assert.ok(msg.deleted_at, "deleted_at must be set");

  assert.ok(db.message_attachments.every(a => a.removed_at !== null));
  const call = storageDeleteCalls.find(c => c.bucket === "message-attachments");
  assert.ok(call);
  assert.deepEqual(new Set(call!.paths), new Set(["t1/a1.jpg", "t1/a2.jpg"]));
});

test("removeMessage refuses a message belonging to a DIFFERENT campaign (cross-team boundary enforced)", async () => {
  reset();
  db.messages.push({ id: "m2", thread_id: "t2", body: "hi", deleted_at: null });
  const result = await removeMessage("m2", SLUG); // SLUG is NOT t2's campaign
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "not_found");
  assert.equal(db.messages.find(m => m.id === "m2")!.deleted_at, null, "content in another team must be untouched");
});

test("removeMessage is idempotent — removing an already-removed message succeeds with zero further changes", async () => {
  reset();
  const removedAt = new Date().toISOString();
  db.messages.push({ id: "m3", thread_id: "t1", body: "", deleted_at: removedAt });
  const result = await removeMessage("m3", SLUG);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.attachmentsRemoved, 0);
  assert.equal(db.messages.find(m => m.id === "m3")!.deleted_at, removedAt, "must not overwrite the original removal timestamp");
});

test("removeMessage on a nonexistent message returns not_found", async () => {
  reset();
  const result = await removeMessage("does-not-exist", SLUG);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "not_found");
});

test("removeAttachment removes only the attachment — the message body is untouched", async () => {
  reset();
  db.messages.push({ id: "m4", thread_id: "t1", body: "keep this text", deleted_at: null });
  db.message_attachments.push({ id: "a3", thread_id: "t1", message_id: "m4", storage_path: "t1/a3.jpg", removed_at: null });

  const result = await removeAttachment("a3", SLUG);
  assert.equal(result.ok, true);
  assert.ok(db.message_attachments.find(a => a.id === "a3")!.removed_at);
  assert.equal(db.messages.find(m => m.id === "m4")!.body, "keep this text");
  assert.ok(storageDeleteCalls.some(c => c.bucket === "message-attachments" && c.paths.includes("t1/a3.jpg")));
});

test("removeAttachment refuses an attachment belonging to a different campaign", async () => {
  reset();
  db.message_attachments.push({ id: "a4", thread_id: "t2", message_id: "m5", storage_path: "t2/a4.jpg", removed_at: null });
  const result = await removeAttachment("a4", SLUG);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "not_found");
});

test("resolveCampaignSlugForMessage / resolveCampaignSlugForAttachment resolve the real campaign for a Platform Admin route to use", async () => {
  reset();
  db.messages.push({ id: "m6", thread_id: "t2", body: "x", deleted_at: null });
  db.message_attachments.push({ id: "a5", thread_id: "t1", message_id: "m6", storage_path: "t1/a5.jpg", removed_at: null });

  assert.equal(await resolveCampaignSlugForMessage("m6"), "other-team");
  assert.equal(await resolveCampaignSlugForAttachment("a5"), SLUG);
  assert.equal(await resolveCampaignSlugForMessage("nope"), null);
});
