// Same in-memory PostgREST-fake approach as src/lib/platform/coachFundraising.test.ts.
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

type Row = Record<string, unknown>;

function makeFakeDb() {
  const db: Record<string, Row[]> = { team_coaches: [], platform_admins: [], elf_accounts: [] };

  function parseFilters(qs: string) {
    const [table, query] = qs.split("?");
    return { table, params: new URLSearchParams(query ?? "") };
  }
  function matchesFilter(row: Row, field: string, expr: string): boolean {
    if (expr.startsWith("eq."))  return String(row[field]) === expr.slice(3);
    if (expr.startsWith("neq.")) return String(row[field]) !== expr.slice(4);
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
    // Unknown tables (e.g. audit_logs, which this test doesn't care about)
    // always succeed as a no-op — logAuditEvent is fire-and-forget and
    // must never fail the test.
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
    return new Response(JSON.stringify([]), { status: 200 });
  }
  return { db, handle };
}

const { db, handle } = makeFakeDb();
globalThis.fetch = (async (url: string | URL, init?: RequestInit) => handle(String(url), init)) as typeof fetch;

const { deleteAccount } = await import("./accountDeletion.ts");

const SLUG = "monroe-valley";
function reset() { for (const k of Object.keys(db)) db[k].length = 0; }

function memberActor(id: string, accountId: string | null) {
  return { kind: "member" as const, session: { id, name: "Casey Athlete", role: "athlete" as const, campaign_slug: SLUG, athlete_id: null, account_id: accountId } };
}
function coachActor(id: string, role: "head_coach" | "assistant_coach" | "booster") {
  return { kind: "coach" as const, session: { id, name: "Coach Lee", role, campaign_slug: SLUG } };
}
function platformAdminActor(platformAdminId: string, accountId: string) {
  return { kind: "platform_admin" as const, session: { platformAdminId, accountId, name: "ELF Employee", email: "employee@elitelevelfundraising.com", campaign_slug: SLUG } };
}

test("member with a linked account: account is deleted and session cannot re-authenticate (row is gone)", async () => {
  reset();
  db.elf_accounts.push({ id: "acct-1", email: "casey@example.com", password_hash: "x", salt: "y", name: "Casey Athlete" });
  const result = await deleteAccount(memberActor("mem-1", "acct-1"));
  assert.equal(result.ok, true);
  assert.equal(db.elf_accounts.find(a => a.id === "acct-1"), undefined, "elf_accounts row must be gone — no state to authenticate against");
});

test("member with no linked account (legacy pre-account row): deletion is refused, not silently no-op'd", async () => {
  reset();
  const result = await deleteAccount(memberActor("mem-2", null));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "no_linked_account");
});

test("assistant coach / booster deletion: no head-coach protection applies, deletion proceeds", async () => {
  reset();
  db.elf_accounts.push({ id: "acct-2", name: "Assistant" });
  db.team_coaches.push({ id: "coach-2", campaign_slug: SLUG, role: "assistant_coach", account_id: "acct-2" });
  const result = await deleteAccount(coachActor("coach-2", "assistant_coach"));
  assert.equal(result.ok, true);
  assert.equal(db.elf_accounts.length, 0);
});

test("HEAD COACH PROTECTION: sole head coach of a campaign cannot delete their account", async () => {
  reset();
  db.elf_accounts.push({ id: "acct-3", name: "Head Coach" });
  db.team_coaches.push({ id: "hc-1", campaign_slug: SLUG, role: "head_coach", account_id: "acct-3" });
  const result = await deleteAccount(coachActor("hc-1", "head_coach"));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "head_coach_blocker");
    assert.deepEqual((result as { campaigns: string[] }).campaigns, [SLUG]);
  }
  assert.equal(db.elf_accounts.length, 1, "account must survive the rejected deletion");
});

test("HEAD COACH PROTECTION: deletion proceeds once a second head coach exists on the same campaign", async () => {
  reset();
  db.elf_accounts.push({ id: "acct-3", name: "Head Coach" });
  db.team_coaches.push(
    { id: "hc-1", campaign_slug: SLUG, role: "head_coach", account_id: "acct-3" },
    { id: "hc-2", campaign_slug: SLUG, role: "head_coach", account_id: "acct-other" },
  );
  const result = await deleteAccount(coachActor("hc-1", "head_coach"));
  assert.equal(result.ok, true);
  assert.equal(db.elf_accounts.length, 0);
});

test("PLATFORM ADMIN PROTECTION: the last platform admin cannot delete their account", async () => {
  reset();
  db.elf_accounts.push({ id: "acct-4", name: "Sole Admin" });
  db.platform_admins.push({ id: "pa-1", account_id: "acct-4", role: "platform_admin" });
  const result = await deleteAccount(platformAdminActor("pa-1", "acct-4"));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "last_platform_admin");
  assert.equal(db.elf_accounts.length, 1);
  assert.equal(db.platform_admins.length, 1);
});

test("PLATFORM ADMIN PROTECTION: deletion proceeds once a second platform admin exists, removing both the platform_admins row and the account", async () => {
  reset();
  db.elf_accounts.push({ id: "acct-4", name: "Admin One" }, { id: "acct-5", name: "Admin Two" });
  db.platform_admins.push({ id: "pa-1", account_id: "acct-4", role: "platform_admin" }, { id: "pa-2", account_id: "acct-5", role: "platform_admin" });
  const result = await deleteAccount(platformAdminActor("pa-1", "acct-4"));
  assert.equal(result.ok, true);
  assert.equal(db.elf_accounts.find(a => a.id === "acct-4"), undefined);
  assert.equal(db.platform_admins.find(p => p.id === "pa-1"), undefined);
  // the OTHER admin must be completely unaffected
  assert.equal(db.elf_accounts.find(a => a.id === "acct-5") !== undefined, true);
  assert.equal(db.platform_admins.find(p => p.id === "pa-2") !== undefined, true);
});

test("an account that is head coach on TWO campaigns is blocked unless BOTH have a successor", async () => {
  reset();
  db.elf_accounts.push({ id: "acct-6", name: "Multi-team Coach" });
  db.team_coaches.push(
    { id: "hc-a", campaign_slug: "team-a", role: "head_coach", account_id: "acct-6" },
    { id: "hc-b", campaign_slug: "team-b", role: "head_coach", account_id: "acct-6" },
    { id: "hc-b2", campaign_slug: "team-b", role: "head_coach", account_id: "acct-other" }, // team-b has a successor
  );
  const result = await deleteAccount(coachActor("hc-a", "head_coach"));
  assert.equal(result.ok, false);
  if (!result.ok) assert.deepEqual((result as { campaigns: string[] }).campaigns, ["team-a"]);
});
