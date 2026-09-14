// Same in-memory PostgREST-fake approach as src/lib/platform/coachFundraising.test.ts.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

type Row = Record<string, unknown>;

function makeFakeDb() {
  const db: Record<string, Row[]> = { user_blocks: [] };
  let nextId = 1;
  const genId = () => `id-${nextId++}`;

  function parseFilters(qs: string) {
    const [table, query] = qs.split("?");
    return { table, params: new URLSearchParams(query ?? "") };
  }
  // Minimal `or=(and(...),and(...))` support — just enough for
  // isBlockedEitherDirection's exact query shape, not a general parser.
  function matchesOr(row: Row, orExpr: string): boolean {
    const clauses = orExpr.slice(1, -1); // strip outer ()
    const andGroups = clauses.match(/and\(([^)]*)\)/g) ?? [];
    return andGroups.some(group => {
      const inner = group.slice(4, -1);
      return inner.split(",").every(cond => {
        const [field, expr] = cond.split(".eq.");
        return String(row[field]) === expr;
      });
    });
  }
  function matchesFilter(row: Row, field: string, expr: string): boolean {
    if (expr.startsWith("eq.")) return String(row[field]) === expr.slice(3);
    return true;
  }
  function select(table: Row[], params: URLSearchParams): Row[] {
    let rows = table;
    for (const [key, val] of params.entries()) {
      if (["select", "limit", "order"].includes(key)) continue;
      if (key === "or") { rows = rows.filter(r => matchesOr(r, val)); continue; }
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
      const row: Row = { id: genId(), created_at: new Date().toISOString(), ...body };
      tableRows.push(row);
      return new Response(JSON.stringify([row]), { status: 201 });
    }
    if (method === "DELETE") {
      const matched = select(tableRows, params);
      const matchedIds = new Set(matched.map(r => r.id));
      const remaining = tableRows.filter(r => !matchedIds.has(r.id));
      tableRows.length = 0;
      tableRows.push(...remaining);
      return new Response(JSON.stringify(matched), { status: 200 });
    }
    return new Response(JSON.stringify([]), { status: 200 });
  }
  return { db, handle };
}

const { db, handle } = makeFakeDb();
globalThis.fetch = (async (url: string | URL, init?: RequestInit) => handle(String(url), init)) as typeof fetch;

const { blockUser, unblockUser, getBlockedByMe, isBlockedEitherDirection } = await import("./blocks.ts");

const SLUG = "monroe-valley";
function reset() { db.user_blocks.length = 0; }

test("member can block a coach", async () => {
  reset();
  const result = await blockUser(SLUG, { kind: "member", id: "mem-1" }, "coach", "coach-1");
  assert.equal(result.ok, true);
  assert.equal(db.user_blocks.length, 1);
});

test("self-block is rejected", async () => {
  reset();
  const result = await blockUser(SLUG, { kind: "member", id: "mem-1" }, "member", "mem-1");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "self_block");
  assert.equal(db.user_blocks.length, 0);
});

test("blocking the same person twice is idempotent, not a duplicate row", async () => {
  reset();
  await blockUser(SLUG, { kind: "member", id: "mem-1" }, "coach", "coach-1");
  const second = await blockUser(SLUG, { kind: "member", id: "mem-1" }, "coach", "coach-1");
  assert.equal(second.ok, true);
  assert.equal(db.user_blocks.length, 1);
});

test("isBlockedEitherDirection sees a block regardless of which side is queried", async () => {
  reset();
  await blockUser(SLUG, { kind: "member", id: "mem-1" }, "coach", "coach-1");
  assert.equal(await isBlockedEitherDirection(SLUG, { kind: "member", id: "mem-1" }, { kind: "coach", id: "coach-1" }), true);
  assert.equal(await isBlockedEitherDirection(SLUG, { kind: "coach", id: "coach-1" }, { kind: "member", id: "mem-1" }), true);
});

test("unblock restores messaging (isBlockedEitherDirection returns false again)", async () => {
  reset();
  const created = await blockUser(SLUG, { kind: "member", id: "mem-1" }, "coach", "coach-1");
  if (!("block" in created)) throw new Error("setup failed");
  await unblockUser(SLUG, { kind: "member", id: "mem-1" }, "coach", "coach-1");
  assert.equal(await isBlockedEitherDirection(SLUG, { kind: "member", id: "mem-1" }, { kind: "coach", id: "coach-1" }), false);
});

test("a block in one campaign does not apply in another (campaign boundary enforced)", async () => {
  reset();
  await blockUser(SLUG, { kind: "member", id: "mem-1" }, "coach", "coach-1");
  assert.equal(await isBlockedEitherDirection("a-different-campaign", { kind: "member", id: "mem-1" }, { kind: "coach", id: "coach-1" }), false);
});

test("getBlockedByMe only returns the caller's own blocks, not other actors'", async () => {
  reset();
  await blockUser(SLUG, { kind: "member", id: "mem-1" }, "coach", "coach-1");
  await blockUser(SLUG, { kind: "member", id: "mem-2" }, "coach", "coach-9");
  const mine = await getBlockedByMe(SLUG, { kind: "member", id: "mem-1" });
  assert.equal(mine.length, 1);
  assert.equal(mine[0].blocked_id, "coach-1");
});

// ─── CRITICAL: blocking must never touch announcement visibility ──────────────
//
// isAnnouncementVisibleToActor / getAnnouncements / getAnnouncementMeta
// must have zero source-level dependency on user_blocks or
// lib/moderation/blocks — enforced structurally (nothing imports it),
// not by a runtime exception list. This is a static guard: if a future
// change ever adds such an import, this test fails immediately, before
// any behavioral drift could reach production. The full 18-test audience
// matrix in announcementVisibility.test.ts is left completely untouched
// by this change and continues to pass unmodified (see the test run
// report — not duplicated here).
// Full functional mocking of resolveOrCreateThreadForRecipient's entire
// dependency graph (fetchCoachById, fetchMemberById, family-participant
// resolution, head-coach oversight, canonical-thread reuse) is out of
// scope for a lib-level test — it's already covered end-to-end by
// messages.test.ts's own suite. This is a targeted source check instead:
// proves the one call site required to enforce blocking (the single
// chokepoint documented in messages.ts) is actually wired up, so a
// future refactor can't silently drop the block check while every
// isBlockedEitherDirection() unit test above keeps passing in isolation.
test("INTEGRATION GUARD: resolveOrCreateThreadForRecipient actually calls isBlockedEitherDirection", () => {
  const source = readFileSync(join(process.cwd(), "src/lib/messages.ts"), "utf8");
  const fnStart = source.indexOf("export async function resolveOrCreateThreadForRecipient");
  assert.ok(fnStart >= 0, "resolveOrCreateThreadForRecipient must still exist in messages.ts");
  const fnBody = source.slice(fnStart, fnStart + 3000);
  assert.ok(fnBody.includes("isBlockedEitherDirection"), "resolveOrCreateThreadForRecipient must check isBlockedEitherDirection before creating/reusing a thread");
});

// Fix 3 (QA follow-up): the resolve/create path above was never the gap
// — sending into an ALREADY-OPEN thread (the actual send path for every
// message after the first) never consulted blocking at all. This proves
// that route now does.
test("INTEGRATION GUARD: the existing-thread send route actually calls isThreadBlockedForActor before sending", () => {
  const source = readFileSync(
    join(process.cwd(), "src/app/api/team/[slug]/messages/threads/[threadId]/messages/route.ts"),
    "utf8",
  );
  assert.ok(source.includes("isThreadBlockedForActor"), "the existing-thread send route must check isThreadBlockedForActor before inserting a message");
});

test("REGRESSION: announcement visibility source files never import user_blocks or moderation/blocks", () => {
  const files = [
    join(process.cwd(), "src/lib/announcementVisibility.ts"),
    join(process.cwd(), "src/lib/teamData.ts"),
    join(process.cwd(), "src/lib/notifications.ts"),
  ];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.ok(!/user_blocks/i.test(source), `${file} must never reference user_blocks`);
    assert.ok(!/moderation\/blocks/.test(source), `${file} must never import lib/moderation/blocks`);
  }
});
