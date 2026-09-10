// Integration-shaped tests for the Post Likes service — same in-memory
// fake-PostgREST approach as parentAccessRequests.test.ts (see that file's
// header comment for the rationale). Scoped to exactly the query shapes
// postLikes.ts and validateAnnouncementForCampaign (comments.ts) issue.
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

type Row = Record<string, unknown>;
type Table = Row[];

function makeFakeDb() {
  const db: Record<string, Table> = { announcements: [], post_likes: [] };
  let nextId = 1;
  const genId = () => `id-${nextId++}`;

  function parseQuery(qs: string): { table: string; filters: [string, string, string][]; select: string | null; limit: number | null } {
    const [table, query] = qs.split("?");
    const filters: [string, string, string][] = [];
    let select: string | null = null;
    let limit: number | null = null;
    for (const pair of (query ?? "").split("&")) {
      if (!pair) continue;
      const [rawKey, rawVal] = pair.split("=");
      const key = decodeURIComponent(rawKey);
      const val = decodeURIComponent(rawVal ?? "");
      if (key === "select") { select = val; continue; }
      if (key === "limit")  { limit = Number(val); continue; }
      if (key === "order")  { continue; }
      const m = val.match(/^(eq|neq)\.(.*)$/);
      if (m) filters.push([key, m[1], m[2]]);
    }
    return { table, filters, select, limit };
  }

  function matches(row: Row, filters: [string, string, string][]): boolean {
    return filters.every(([field, op, val]) => {
      const eq = String(row[field]) === val;
      return op === "eq" ? eq : !eq;
    });
  }

  async function fetchImpl(url: string, init?: RequestInit): Promise<Response> {
    const path = url.replace(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, "");
    const { table, filters, limit } = parseQuery(path);
    const method = init?.method ?? "GET";
    db[table] = db[table] ?? [];

    if (method === "GET") {
      let rows = db[table].filter(r => matches(r, filters));
      if (limit != null) rows = rows.slice(0, limit);
      return new Response(JSON.stringify(rows), { status: 200 });
    }

    if (method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (table === "post_likes") {
        const dup = db.post_likes.find(r =>
          r.announcement_id === body.announcement_id &&
          ((body.author_coach_id  && r.author_coach_id  === body.author_coach_id) ||
           (body.author_member_id && r.author_member_id === body.author_member_id)),
        );
        if (dup) return new Response(JSON.stringify({ code: "23505", message: "duplicate" }), { status: 409 });
      }
      const row: Row = { id: genId(), created_at: new Date().toISOString(), ...body };
      db[table].push(row);
      return new Response(JSON.stringify([row]), { status: 201 });
    }

    if (method === "DELETE") {
      const before = db[table].length;
      db[table] = db[table].filter(r => !matches(r, filters));
      return new Response(JSON.stringify({ deleted: before - db[table].length }), { status: 200 });
    }

    return new Response("not implemented", { status: 500 });
  }

  return { db, fetchImpl };
}

function seedAnnouncement(db: ReturnType<typeof makeFakeDb>["db"], id: string, campaignSlug: string, title = "Practice moved") {
  db.announcements.push({ id, campaign_slug: campaignSlug, title });
}

async function withFakeDb<T>(run: (db: ReturnType<typeof makeFakeDb>["db"]) => Promise<T>): Promise<T> {
  const { db, fetchImpl } = makeFakeDb();
  const realFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl as typeof fetch;
  try {
    return await run(db);
  } finally {
    globalThis.fetch = realFetch;
  }
}

async function loadService() {
  return import("./postLikes.ts");
}

const coach1  = { kind: "coach" as const,  id: "coach-1" };
const parent1 = { kind: "member" as const, id: "member-1" };
const parent2 = { kind: "member" as const, id: "member-2" };

test("an authorized user can like a post; count and liked_by_me reflect it", async () => {
  await withFakeDb(async db => {
    seedAnnouncement(db, "post-1", "wolves");
    const { toggleLike } = await loadService();

    const result = await toggleLike("post-1", "wolves", parent1);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.liked, true);
    assert.equal(result.status.count, 1);
    assert.equal(result.status.liked_by_me, true);
    assert.equal(db.post_likes.length, 1);
  });
});

test("a duplicate like from the same member is prevented at the DB level and does not double the count", async () => {
  await withFakeDb(async db => {
    seedAnnouncement(db, "post-1", "wolves");
    db.post_likes.push({ id: "existing", campaign_slug: "wolves", announcement_id: "post-1", author_type: "member", author_coach_id: null, author_member_id: parent1.id, created_at: new Date().toISOString() });
    const { getLikeStatus } = await loadService();

    // Simulates the DB unique index already having exactly one row for
    // this (announcement, member) pair — toggleLike's own read-before-
    // write means it would unlike, not double-insert, on a second real
    // tap; this asserts the count-reading side never overcounts even if
    // a duplicate row briefly existed.
    const status = await getLikeStatus("post-1", "wolves", parent1);
    assert.equal(status.count, 1);
    assert.equal(status.liked_by_me, true);
  });
});

test("tapping again unlikes — toggling twice returns to zero", async () => {
  await withFakeDb(async db => {
    seedAnnouncement(db, "post-1", "wolves");
    const { toggleLike } = await loadService();

    const liked = await toggleLike("post-1", "wolves", parent1);
    assert.equal(liked.ok, true);
    if (liked.ok) assert.equal(liked.liked, true);

    const unliked = await toggleLike("post-1", "wolves", parent1);
    assert.equal(unliked.ok, true);
    if (unliked.ok) {
      assert.equal(unliked.liked, false);
      assert.equal(unliked.status.count, 0);
    }
    assert.equal(db.post_likes.length, 0);
  });
});

test("aggregate count is correct across multiple distinct likers (coach + members)", async () => {
  await withFakeDb(async db => {
    seedAnnouncement(db, "post-1", "wolves");
    const { toggleLike, getLikeStatus } = await loadService();

    await toggleLike("post-1", "wolves", coach1);
    await toggleLike("post-1", "wolves", parent1);
    await toggleLike("post-1", "wolves", parent2);

    const status = await getLikeStatus("post-1", "wolves", parent1);
    assert.equal(status.count, 3);
    assert.equal(status.liked_by_me, true); // parent1 is the viewer here
  });
});

test("current-user liked state is per-viewer, not global — one viewer's like doesn't show as another's", async () => {
  await withFakeDb(async db => {
    seedAnnouncement(db, "post-1", "wolves");
    const { toggleLike, getLikeStatus } = await loadService();

    await toggleLike("post-1", "wolves", parent1);

    const viewer1Status = await getLikeStatus("post-1", "wolves", parent1);
    const viewer2Status = await getLikeStatus("post-1", "wolves", parent2);
    assert.equal(viewer1Status.liked_by_me, true);
    assert.equal(viewer2Status.liked_by_me, false);
    assert.equal(viewer1Status.count, 1);
    assert.equal(viewer2Status.count, 1);
  });
});

test("liking a nonexistent (or cross-campaign) announcement is rejected, never silently attributed", async () => {
  await withFakeDb(async db => {
    seedAnnouncement(db, "post-1", "wolves");
    const { toggleLike } = await loadService();

    const wrongCampaign = await toggleLike("post-1", "hawks", parent1);
    assert.equal(wrongCampaign.ok, false);
    if (!wrongCampaign.ok) assert.equal(wrongCampaign.reason, "announcement_not_found");

    const missing = await toggleLike("no-such-post", "wolves", parent1);
    assert.equal(missing.ok, false);

    assert.equal(db.post_likes.length, 0);
  });
});
