// Fix 3 — proves isThreadBlockedForActor() (the function wired into the
// existing-thread send route) correctly detects a block against ANY
// other thread participant, in either direction, and is unaffected by
// blocks that don't involve this thread's participants at all. Same
// in-memory PostgREST-fake approach as other lib tests.
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

type Row = Record<string, unknown>;

function makeFakeDb() {
  const db: Record<string, Row[]> = { message_thread_participants: [], user_blocks: [] };

  function parseFilters(qs: string) {
    const [table, query] = qs.split("?");
    return { table, params: new URLSearchParams(query ?? "") };
  }
  function matchesFilter(row: Row, field: string, expr: string): boolean {
    if (expr.startsWith("eq.")) return String(row[field]) === expr.slice(3);
    return true;
  }
  function matchesOr(row: Row, orExpr: string): boolean {
    const clauses = orExpr.slice(1, -1);
    const andGroups = clauses.match(/and\(([^)]*)\)/g) ?? [];
    return andGroups.some(group => {
      const inner = group.slice(4, -1);
      return inner.split(",").every(cond => {
        const [field, expr] = cond.split(".eq.");
        return String(row[field]) === expr;
      });
    });
  }
  function select(table: Row[], params: URLSearchParams): Row[] {
    let rows = table;
    for (const [key, val] of params.entries()) {
      if (["select", "limit", "order"].includes(key)) continue;
      if (key === "or") { rows = rows.filter(r => matchesOr(r, val)); continue; }
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

const { isThreadBlockedForActor } = await import("./messages.ts");

const SLUG = "monroe-valley";
function reset() { db.message_thread_participants.length = 0; db.user_blocks.length = 0; }

function seedParticipant(actorType: "coach" | "member" | "platform_admin", id: string) {
  db.message_thread_participants.push({
    id: `p-${id}`, thread_id: "t1", actor_type: actorType,
    coach_id: actorType === "coach" ? id : null,
    member_id: actorType === "member" ? id : null,
    platform_admin_id: actorType === "platform_admin" ? id : null,
    is_auto_included: false, is_observer: false,
    team_coaches: null, team_members: null, platform_admins: null,
  });
}

test("a thread with no block relationship is not blocked", async () => {
  reset();
  seedParticipant("member", "mem-1");
  seedParticipant("coach", "coach-1");
  assert.equal(await isThreadBlockedForActor("t1", SLUG, { kind: "member", id: "mem-1" }), false);
});

test("blocked, direction 1: the blocker cannot send into the existing thread", async () => {
  reset();
  seedParticipant("member", "mem-1");
  seedParticipant("coach", "coach-1");
  db.user_blocks.push({ id: "b1", campaign_slug: SLUG, blocker_kind: "member", blocker_id: "mem-1", blocked_kind: "coach", blocked_id: "coach-1" });
  assert.equal(await isThreadBlockedForActor("t1", SLUG, { kind: "member", id: "mem-1" }), true);
});

test("blocked, direction 2: the BLOCKED party also cannot send into the existing thread (symmetric)", async () => {
  reset();
  seedParticipant("member", "mem-1");
  seedParticipant("coach", "coach-1");
  db.user_blocks.push({ id: "b1", campaign_slug: SLUG, blocker_kind: "member", blocker_id: "mem-1", blocked_kind: "coach", blocked_id: "coach-1" });
  assert.equal(await isThreadBlockedForActor("t1", SLUG, { kind: "coach", id: "coach-1" }), true);
});

test("a block against someone NOT in this thread does not block it", async () => {
  reset();
  seedParticipant("member", "mem-1");
  seedParticipant("coach", "coach-1");
  db.user_blocks.push({ id: "b1", campaign_slug: SLUG, blocker_kind: "member", blocker_id: "mem-1", blocked_kind: "coach", blocked_id: "some-other-coach" });
  assert.equal(await isThreadBlockedForActor("t1", SLUG, { kind: "member", id: "mem-1" }), false);
});

test("a block in a DIFFERENT campaign does not block this thread", async () => {
  reset();
  seedParticipant("member", "mem-1");
  seedParticipant("coach", "coach-1");
  db.user_blocks.push({ id: "b1", campaign_slug: "other-campaign", blocker_kind: "member", blocker_id: "mem-1", blocked_kind: "coach", blocked_id: "coach-1" });
  assert.equal(await isThreadBlockedForActor("t1", SLUG, { kind: "member", id: "mem-1" }), false);
});

test("a multi-party thread is blocked if the actor has a block relationship with ANY participant — not just the primary recipient (e.g. a silently auto-included observer coach)", async () => {
  reset();
  seedParticipant("member", "mem-athlete");
  seedParticipant("coach", "coach-primary");
  seedParticipant("coach", "coach-observer"); // e.g. Head Coach auto-added for oversight
  db.user_blocks.push({ id: "b1", campaign_slug: SLUG, blocker_kind: "member", blocker_id: "mem-athlete", blocked_kind: "coach", blocked_id: "coach-observer" });
  // The athlete never blocked coach-primary, only the silently-included
  // observer — but the message would still reach the blocked observer,
  // so the whole send must still be refused.
  assert.equal(await isThreadBlockedForActor("t1", SLUG, { kind: "member", id: "mem-athlete" }), true);
});

test("an unrelated third party's own block (not involving the actor at all) never blocks the actor's send", async () => {
  reset();
  seedParticipant("member", "mem-athlete");
  seedParticipant("member", "mem-parent");
  seedParticipant("coach", "coach-1");
  // mem-parent blocked coach-1 — a relationship that doesn't involve
  // mem-athlete at all. mem-athlete's own ability to message this thread
  // must be unaffected by someone ELSE's block.
  db.user_blocks.push({ id: "b1", campaign_slug: SLUG, blocker_kind: "member", blocker_id: "mem-parent", blocked_kind: "coach", blocked_id: "coach-1" });
  assert.equal(await isThreadBlockedForActor("t1", SLUG, { kind: "member", id: "mem-athlete" }), false);
});

test("unblocking (removing the row) restores the thread to unblocked", async () => {
  reset();
  seedParticipant("member", "mem-1");
  seedParticipant("coach", "coach-1");
  db.user_blocks.push({ id: "b1", campaign_slug: SLUG, blocker_kind: "member", blocker_id: "mem-1", blocked_kind: "coach", blocked_id: "coach-1" });
  assert.equal(await isThreadBlockedForActor("t1", SLUG, { kind: "member", id: "mem-1" }), true);
  db.user_blocks.length = 0;
  assert.equal(await isThreadBlockedForActor("t1", SLUG, { kind: "member", id: "mem-1" }), false);
});
