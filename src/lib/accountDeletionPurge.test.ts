// Same in-memory PostgREST-fake approach as src/lib/platform/coachFundraising.test.ts,
// extended with a storage-call capture since this module also issues
// Supabase Storage DELETE requests (not just /rest/v1 ones).
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

type Row = Record<string, unknown>;

function makeFakeDb() {
  const db: Record<string, Row[]> = {
    announcement_comments: [], messages: [], message_attachments: [],
    post_likes: [], user_blocks: [], content_reports: [],
    elf_accounts: [], team_members: [], athletes: [],
  };
  const storageDeleteCalls: { bucket: string; paths: string[] }[] = [];

  function parseFilters(qs: string) {
    const [table, query] = qs.split("?");
    return { table, params: new URLSearchParams(query ?? "") };
  }
  function matchesFilter(row: Row, field: string, expr: string): boolean {
    if (expr.startsWith("eq."))       return String(row[field]) === expr.slice(3);
    if (expr === "not.is.null")       return row[field] !== null && row[field] !== undefined;
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
    if (method === "DELETE") {
      const matched = select(tableRows, params);
      const matchedIds = new Set(matched.map(r => r.id));
      const remaining = tableRows.filter(r => !matchedIds.has(r.id));
      tableRows.length = 0;
      tableRows.push(...remaining);
      return new Response(JSON.stringify(matched), { status: 200 });
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
    return new Response(JSON.stringify([]), { status: 200 });
  }
  return { db, storageDeleteCalls, handle };
}

const { db, storageDeleteCalls, handle } = makeFakeDb();
globalThis.fetch = (async (url: string | URL, init?: RequestInit) => handle(String(url), init)) as typeof fetch;

const { purgePersonalUgc } = await import("./accountDeletionPurge.ts");

const SLUG = "monroe-valley";
function reset() {
  for (const k of Object.keys(db)) db[k].length = 0;
  storageDeleteCalls.length = 0;
}

test("authored comments are deleted, not just hidden", async () => {
  reset();
  db.announcement_comments.push(
    { id: "c1", campaign_slug: SLUG, author_type: "member", author_member_id: "mem-1", body: "mine" },
    { id: "c2", campaign_slug: SLUG, author_type: "member", author_member_id: "someone-else", body: "not mine" },
  );
  const summary = await purgePersonalUgc("acct-1", [{ kind: "member", id: "mem-1" }]);
  assert.equal(summary.commentsDeleted, 1);
  assert.equal(db.announcement_comments.length, 1);
  assert.equal(db.announcement_comments[0].id, "c2");
});

test("authored messages AND their attachment rows/storage objects are deleted", async () => {
  reset();
  db.messages.push(
    { id: "m1", sender_type: "member", sender_member_id: "mem-1", body: "hi" },
    { id: "m2", sender_type: "member", sender_member_id: "someone-else", body: "unrelated" },
  );
  db.message_attachments.push(
    { id: "a1", uploader_actor_type: "member", uploader_member_id: "mem-1", storage_path: "thread-1/a1.jpg" },
    { id: "a2", uploader_actor_type: "member", uploader_member_id: "someone-else", storage_path: "thread-1/a2.jpg" },
  );
  const summary = await purgePersonalUgc("acct-1", [{ kind: "member", id: "mem-1" }]);

  assert.equal(summary.messagesDeleted, 1);
  assert.equal(summary.attachmentsDeleted, 1);
  assert.equal(db.messages.length, 1);
  assert.equal(db.messages[0].id, "m2");
  assert.equal(db.message_attachments.length, 1);
  assert.equal(db.message_attachments[0].id, "a2");

  const attachmentCall = storageDeleteCalls.find(c => c.bucket === "message-attachments");
  assert.ok(attachmentCall, "expected a storage delete call for the message-attachments bucket");
  assert.deepEqual(attachmentCall!.paths, ["thread-1/a1.jpg"]);
});

test("post likes (purely personal) are deleted", async () => {
  reset();
  db.post_likes.push(
    { id: "l1", author_type: "member", author_member_id: "mem-1" },
    { id: "l2", author_type: "member", author_member_id: "someone-else" },
  );
  const summary = await purgePersonalUgc("acct-1", [{ kind: "member", id: "mem-1" }]);
  assert.equal(summary.likesDeleted, 1);
  assert.equal(db.post_likes.length, 1);
});

test("blocks are deleted in BOTH directions (as blocker and as the blocked party)", async () => {
  reset();
  db.user_blocks.push(
    { id: "b1", blocker_kind: "member", blocker_id: "mem-1", blocked_kind: "coach", blocked_id: "coach-9" },
    { id: "b2", blocker_kind: "coach", blocker_id: "coach-9", blocked_kind: "member", blocked_id: "mem-1" },
    { id: "b3", blocker_kind: "member", blocker_id: "someone-else", blocked_kind: "coach", blocked_id: "coach-9" },
  );
  const summary = await purgePersonalUgc("acct-1", [{ kind: "member", id: "mem-1" }]);
  assert.equal(summary.blocksDeleted, 2);
  assert.equal(db.user_blocks.length, 1);
  assert.equal(db.user_blocks[0].id, "b3");
});

test("reports FILED by the deleting user are anonymized, not deleted — reason/status/target are preserved for moderation", async () => {
  reset();
  db.content_reports.push({
    id: "r1", campaign_slug: SLUG, target_type: "message", target_id: "m-9",
    reporter_kind: "member", reporter_id: "mem-1", reporter_name: "Real Name",
    reason: "harassment", status: "open",
  });
  const summary = await purgePersonalUgc("acct-1", [{ kind: "member", id: "mem-1" }]);
  assert.equal(summary.reportsAnonymized, 1);
  assert.equal(db.content_reports.length, 1, "the report row itself must survive");
  assert.equal(db.content_reports[0].reporter_name, "Deleted user");
  assert.equal(db.content_reports[0].reason, "harassment", "moderation-relevant fields must be untouched");
  assert.equal(db.content_reports[0].status, "open", "status must be untouched");
});

test("reports ABOUT the deleting user (filed by someone else) are completely untouched", async () => {
  reset();
  db.content_reports.push({
    id: "r1", campaign_slug: SLUG, target_type: "user", target_kind: "member", target_id: "mem-1",
    reporter_kind: "coach", reporter_id: "coach-1", reporter_name: "Coach Reporter",
    reason: "safety_concern", status: "open",
  });
  await purgePersonalUgc("acct-1", [{ kind: "member", id: "mem-1" }]);
  assert.equal(db.content_reports[0].reporter_name, "Coach Reporter", "a report ABOUT this user, filed by someone else, must not be touched by their own deletion");
});

test("profile photo storage object is deleted and mirrored athlete photo is cleared", async () => {
  reset();
  db.elf_accounts.push({ id: "acct-1", profile_photo_url: "https://fake.supabase.co/storage/v1/object/public/profile-photos/acct-1/123-abc.jpg" });
  db.team_members.push({ id: "mem-1", account_id: "acct-1", athlete_id: "ath-1" });
  db.athletes.push({ id: "ath-1", profile_photo: "https://fake.supabase.co/storage/v1/object/public/profile-photos/acct-1/123-abc.jpg" });

  await purgePersonalUgc("acct-1", [{ kind: "member", id: "mem-1" }]);

  const photoCall = storageDeleteCalls.find(c => c.bucket === "profile-photos");
  assert.ok(photoCall);
  assert.deepEqual(photoCall!.paths, ["acct-1/123-abc.jpg"]);
  assert.equal(db.athletes[0].profile_photo, null);
});

test("a multi-role account (coach on one team, member on another) purges content under BOTH identities", async () => {
  reset();
  db.announcement_comments.push(
    { id: "c1", campaign_slug: "team-a", author_type: "coach", author_coach_id: "coach-1", body: "as coach" },
    { id: "c2", campaign_slug: "team-b", author_type: "member", author_member_id: "mem-1", body: "as member" },
  );
  const summary = await purgePersonalUgc("acct-1", [
    { kind: "coach", id: "coach-1" },
    { kind: "member", id: "mem-1" },
  ]);
  assert.equal(summary.commentsDeleted, 2);
  assert.equal(db.announcement_comments.length, 0);
});
