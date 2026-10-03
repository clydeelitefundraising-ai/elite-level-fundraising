// Integration-shaped tests for the Parent Access Approval service, using a
// small in-memory fake of the Supabase PostgREST layer (mocking
// globalThis.fetch) rather than a live database — this repo's existing
// test suite only covers pure functions, so this is deliberately
// self-contained (no shared test infra added/changed) and scoped to
// exactly the query shapes parentAccessRequests.ts and its dependencies
// (validateAthleteForCampaign) actually issue.
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL   = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY  = "fake-service-role-key";

type Row = Record<string, unknown>;
type Table = Row[];

function makeFakeDb() {
  const db: Record<string, Table> = {
    athletes:                [],
    parent_access_requests:  [],
    team_members:            [],
    team_member_athletes:    [],
  };
  let nextId = 1;
  const genId = () => `id-${nextId++}`;

  // Family Relationships Phase C1 concurrency test support: when armed,
  // pauses every "does a team_members row already exist for this
  // account+campaign" GET lookup until exactly `needed` of them have
  // arrived, then releases them all together — deterministically
  // reproducing the race window two sibling approveRequest() calls hit
  // (both must observe "no existing row" before either inserts), rather
  // than hoping real interleaving happens to line up. Not used by any
  // other test in this file.
  let membershipReadGate: { arrivals: number; needed: number; release: () => void; ready: Promise<void> } | null = null;
  function armMembershipReadGate(needed: number) {
    let release!: () => void;
    const ready = new Promise<void>(resolve => { release = resolve; });
    membershipReadGate = { arrivals: 0, needed, release, ready };
  }

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
      const rowVal = row[field];
      const eq = String(rowVal) === val;
      return op === "eq" ? eq : !eq;
    });
  }

  function project(row: Row, select: string | null): Row {
    if (!select || select === "*") return { ...row };
    if (select.startsWith("*,")) {
      const out = { ...row };
      const embedMatch = select.match(/(\w+):(\w+)!(\w+)\((\w+)\)/);
      if (embedMatch) {
        const [, alias, embedTable, fkField, embedCol] = embedMatch;
        const fkVal = row[fkField];
        const related = (db[embedTable] ?? []).find(r => r.id === fkVal);
        out[alias] = related ? { [embedCol]: related[embedCol] } : null;
      }
      return out;
    }
    const out: Row = {};
    for (const field of select.split(",")) out[field] = row[field];
    return out;
  }

  async function fetchImpl(url: string, init?: RequestInit): Promise<Response> {
    const path = url.replace(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, "");
    const { table, filters, select, limit } = parseQuery(path);
    const method = init?.method ?? "GET";
    db[table] = db[table] ?? [];

    if (method === "GET") {
      if (
        table === "team_members" && membershipReadGate &&
        filters.some(([f]) => f === "account_id") && filters.some(([f]) => f === "campaign_slug")
      ) {
        membershipReadGate.arrivals++;
        if (membershipReadGate.arrivals >= membershipReadGate.needed) membershipReadGate.release();
        await membershipReadGate.ready;
      }
      let rows = db[table].filter(r => matches(r, filters));
      if (limit != null) rows = rows.slice(0, limit);
      const projected = rows.map(r => project(r, select));
      return new Response(JSON.stringify(projected), { status: 200 });
    }

    if (method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      // Simulate the partial-unique-index constraints this test suite
      // actually exercises.
      if (table === "parent_access_requests" && body.status !== "declined") {
        const dup = db.parent_access_requests.find(r =>
          r.account_id === body.account_id && r.athlete_id === body.athlete_id && r.status === "pending",
        );
        if (dup) return new Response(JSON.stringify({ code: "23505", message: "duplicate" }), { status: 409 });
      }
      // Family Relationships Phase C1: team_members_account_campaign_uniq —
      // UNIQUE (account_id, campaign_slug) WHERE account_id IS NOT NULL.
      if (table === "team_members" && body.account_id != null) {
        const dup = db.team_members.find(r =>
          r.account_id === body.account_id && r.campaign_slug === body.campaign_slug,
        );
        if (dup) return new Response(JSON.stringify({ code: "23505", message: "duplicate key value violates unique constraint \"team_members_account_campaign_uniq\"" }), { status: 409 });
      }
      const now = new Date().toISOString();
      const row: Row = {
        id: genId(), status: "pending", created_at: now, updated_at: now,
        decided_by_account_id: null, decided_at: null, decline_reason: null,
        resulting_member_id: null, athlete_id: null, account_id: null,
        ...body,
      };
      db[table].push(row);
      return new Response(JSON.stringify([project(row, select)]), { status: 201 });
    }

    if (method === "PATCH") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const matched = db[table].filter(r => matches(r, filters));
      for (const row of matched) Object.assign(row, body);
      return new Response(JSON.stringify(matched.map(r => project(r, select))), { status: 200 });
    }

    return new Response("not implemented", { status: 500 });
  }

  return { db, genId, fetchImpl, armMembershipReadGate };
}

function seedAthlete(db: ReturnType<typeof makeFakeDb>["db"], id: string, campaignSlug: string, name: string) {
  db.athletes.push({ id, campaign_slug: campaignSlug, name });
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

// Dynamic import so the module (and its process.env reads inside
// restUrl/restHeaders, which are called per-request, not at import time)
// picks up the env vars set above regardless of import order.
async function loadService() {
  return import("./parentAccessRequests.ts");
}

test("a new parent request starts pending and is visible to the Head Coach queue", async () => {
  await withFakeDb(async db => {
    seedAthlete(db, "athlete-1", "wolves", "Abigail Cooper");
    const { createPendingRequest, getPendingRequestsForCampaign } = await loadService();

    const result = await createPendingRequest({
      campaignSlug: "wolves", accountId: "acct-1", parentName: "Jennifer Cooper", athleteId: "athlete-1",
    });
    assert.equal(result.ok, true);
    if (result.ok && !result.alreadyMember) assert.equal(result.request.status, "pending");

    const queue = await getPendingRequestsForCampaign("wolves");
    assert.equal(queue.length, 1);
    assert.equal(queue[0].parent_name, "Jennifer Cooper");
    assert.equal(queue[0].athlete_name, "Abigail Cooper");
  });
});

test("a duplicate pending request for the same parent+child is idempotent, not an error", async () => {
  await withFakeDb(async db => {
    seedAthlete(db, "athlete-1", "wolves", "Abigail Cooper");
    const { createPendingRequest } = await loadService();
    const input = { campaignSlug: "wolves", accountId: "acct-1", parentName: "Jennifer Cooper", athleteId: "athlete-1" };

    const first  = await createPendingRequest(input);
    const second = await createPendingRequest(input);

    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (second.ok && !second.alreadyMember) assert.equal(second.alreadyPending, true);
  });
});

test("Head Coach approval creates team access; pending parent had none before it", async () => {
  await withFakeDb(async db => {
    seedAthlete(db, "athlete-1", "wolves", "Abigail Cooper");
    const { createPendingRequest, approveRequest } = await loadService();

    const created = await createPendingRequest({
      campaignSlug: "wolves", accountId: "acct-1", parentName: "Jennifer Cooper", athleteId: "athlete-1",
    });
    assert.equal(created.ok, true);
    if (!created.ok || created.alreadyMember) return;

    // Before approval: no team_members row exists for this account at
    // all — this IS the enforcement mechanism (see parentAccessRequests.ts
    // module header): a pending parent has nothing for getMemberSession()/
    // getActorForAccount() to find, so every protected route already
    // denies them the same way it denies any unauthenticated visitor.
    assert.equal(db.team_members.length, 0);

    const approved = await approveRequest({ requestId: created.request.id, campaignSlug: "wolves", decidedByAccountId: "coach-1" });
    assert.equal(approved.ok, true);
    if (!approved.ok) return;

    assert.equal(db.team_members.length, 1);
    assert.equal(db.team_members[0].role, "parent");
    assert.equal(db.team_members[0].athlete_id, "athlete-1");
    assert.equal(db.team_member_athletes.length, 1);
    assert.equal(db.team_member_athletes[0].team_member_id, approved.memberId);
    assert.equal(approved.request.status, "approved");
    assert.equal(approved.request.resulting_member_id, approved.memberId);
  });
});

test("Head Coach decline does not create any team_members row", async () => {
  await withFakeDb(async db => {
    seedAthlete(db, "athlete-1", "wolves", "Abigail Cooper");
    const { createPendingRequest, declineRequest } = await loadService();

    const created = await createPendingRequest({
      campaignSlug: "wolves", accountId: "acct-1", parentName: "Jennifer Cooper", athleteId: "athlete-1",
    });
    if (!created.ok || created.alreadyMember) return assert.fail("expected a fresh pending request");

    const declined = await declineRequest({ requestId: created.request.id, campaignSlug: "wolves", decidedByAccountId: "coach-1" }, "Could not verify relationship");
    assert.equal(declined.ok, true);
    if (declined.ok) assert.equal(declined.request.status, "declined");
    assert.equal(db.team_members.length, 0);
  });
});

test("declined request does not grant access and a second approve/decline on it is rejected", async () => {
  await withFakeDb(async db => {
    seedAthlete(db, "athlete-1", "wolves", "Abigail Cooper");
    const { createPendingRequest, declineRequest, approveRequest } = await loadService();

    const created = await createPendingRequest({
      campaignSlug: "wolves", accountId: "acct-1", parentName: "Jennifer Cooper", athleteId: "athlete-1",
    });
    if (!created.ok || created.alreadyMember) return assert.fail("expected a fresh pending request");

    await declineRequest({ requestId: created.request.id, campaignSlug: "wolves", decidedByAccountId: "coach-1" });
    const secondDecision = await approveRequest({ requestId: created.request.id, campaignSlug: "wolves", decidedByAccountId: "coach-1" });
    assert.equal(secondDecision.ok, false);
    if (!secondDecision.ok) assert.equal(secondDecision.reason, "already_decided");
    assert.equal(db.team_members.length, 0);
  });
});

test("multi-child: a second child's approval adds a link without disturbing the first child's grant", async () => {
  await withFakeDb(async db => {
    seedAthlete(db, "athlete-1", "wolves", "Abigail Cooper");
    seedAthlete(db, "athlete-2", "wolves", "Noah Cooper");
    const { createPendingRequest, approveRequest } = await loadService();

    const req1 = await createPendingRequest({ campaignSlug: "wolves", accountId: "acct-1", parentName: "Jennifer Cooper", athleteId: "athlete-1" });
    if (!req1.ok || req1.alreadyMember) return assert.fail();
    const approve1 = await approveRequest({ requestId: req1.request.id, campaignSlug: "wolves", decidedByAccountId: "coach-1" });
    if (!approve1.ok) return assert.fail();

    const req2 = await createPendingRequest({ campaignSlug: "wolves", accountId: "acct-1", parentName: "Jennifer Cooper", athleteId: "athlete-2" });
    if (!req2.ok || req2.alreadyMember) return assert.fail();
    const approve2 = await approveRequest({ requestId: req2.request.id, campaignSlug: "wolves", decidedByAccountId: "coach-1" });
    if (!approve2.ok) return assert.fail();

    // Same team_members row reused for both children — not a second row —
    // and the legacy single athlete_id column is left as the FIRST child
    // (never overwritten by the second approval), while both children are
    // reachable via team_member_athletes (the multi-child read path).
    assert.equal(db.team_members.length, 1);
    assert.equal(approve1.memberId, approve2.memberId);
    assert.equal(db.team_members[0].athlete_id, "athlete-1");
    assert.equal(db.team_member_athletes.length, 2);
    const linkedIds = db.team_member_athletes.map(r => r.athlete_id).sort();
    assert.deepEqual(linkedIds, ["athlete-1", "athlete-2"]);
  });
});

test("multi-team: the same parent can hold independent pending requests on two different teams", async () => {
  await withFakeDb(async db => {
    seedAthlete(db, "athlete-1", "wolves", "Abigail Cooper");
    seedAthlete(db, "athlete-9", "hawks", "Liam Hawk");
    const { createPendingRequest, getPendingRequestsForCampaign } = await loadService();

    const reqA = await createPendingRequest({ campaignSlug: "wolves", accountId: "acct-1", parentName: "Jennifer Cooper", athleteId: "athlete-1" });
    const reqB = await createPendingRequest({ campaignSlug: "hawks", accountId: "acct-1", parentName: "Jennifer Cooper", athleteId: "athlete-9" });

    assert.equal(reqA.ok, true);
    assert.equal(reqB.ok, true);

    const wolvesQueue = await getPendingRequestsForCampaign("wolves");
    const hawksQueue  = await getPendingRequestsForCampaign("hawks");
    assert.equal(wolvesQueue.length, 1);
    assert.equal(hawksQueue.length, 1);
    assert.equal(wolvesQueue[0].athlete_name, "Abigail Cooper");
    assert.equal(hawksQueue[0].athlete_name, "Liam Hawk");
  });
});

test("an already-approved (pre-existing) parent-athlete relationship is treated as a no-op, not a new request", async () => {
  await withFakeDb(async db => {
    seedAthlete(db, "athlete-1", "wolves", "Abigail Cooper");
    // Simulates an existing-approved parent from before this feature
    // shipped — a live team_members row with no parent_access_requests
    // row behind it at all.
    db.team_members.push({ id: "member-legacy", campaign_slug: "wolves", role: "parent", account_id: "acct-legacy", athlete_id: "athlete-1", name: "Legacy Parent" });

    const { createPendingRequest, getPendingRequestsForCampaign } = await loadService();
    const result = await createPendingRequest({
      campaignSlug: "wolves", accountId: "acct-legacy", parentName: "Legacy Parent", athleteId: "athlete-1",
    });

    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.alreadyMember, true);
    // No new pending request was created for an already-live relationship.
    const queue = await getPendingRequestsForCampaign("wolves");
    assert.equal(queue.length, 0);
    assert.equal(db.team_members.length, 1);
  });
});

// ─── Family Relationships Phase C1: concurrent sibling approvals ──────────
//
// Real race, not sequential calls labeled as one: armMembershipReadGate()
// pauses both approveRequest() calls' "does a team_members row already
// exist for this account+campaign" check until BOTH have arrived, then
// releases them together — so both genuinely observe "no existing row"
// before either inserts, exactly the window the phase_c1 unique index +
// catch-and-reread exists to close.

test("concurrent sibling approvals: two children approved at once converge on ONE team_members row, both relationships intact", async () => {
  const { db, fetchImpl, armMembershipReadGate } = makeFakeDb();
  const realFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl as typeof fetch;
  try {
    seedAthlete(db, "athlete-emma", "wolves", "Emma Wagner");
    seedAthlete(db, "athlete-jake", "wolves", "Jake Wagner");
    const { createPendingRequest, approveRequest } = await loadService();

    const reqEmma = await createPendingRequest({ campaignSlug: "wolves", accountId: "acct-1", parentName: "Sarah Wagner", athleteId: "athlete-emma" });
    const reqJake = await createPendingRequest({ campaignSlug: "wolves", accountId: "acct-1", parentName: "Sarah Wagner", athleteId: "athlete-jake" });
    if (!reqEmma.ok || reqEmma.alreadyMember || !reqJake.ok || reqJake.alreadyMember) return assert.fail("setup failed");

    armMembershipReadGate(2);
    const [approveEmma, approveJake] = await Promise.all([
      approveRequest({ requestId: reqEmma.request.id, campaignSlug: "wolves", decidedByAccountId: "coach-1" }),
      approveRequest({ requestId: reqJake.request.id, campaignSlug: "wolves", decidedByAccountId: "coach-1" }),
    ]);

    if (!approveEmma.ok || !approveJake.ok) return assert.fail("an approval that should have succeeded failed");

    // Exactly ONE team_members row for this account+campaign — the race was
    // real (both inserts were attempted; the DB-simulated unique index
    // rejected the loser, which re-read and linked onto the winner's row).
    const membersForAccount = db.team_members.filter(r => r.account_id === "acct-1" && r.campaign_slug === "wolves");
    assert.equal(membersForAccount.length, 1);
    assert.equal(approveEmma.memberId, approveJake.memberId);
    assert.equal(membersForAccount[0].id, approveEmma.memberId);

    // Both children's relationships exist via team_member_athletes.
    const links = db.team_member_athletes.filter(r => r.team_member_id === approveEmma.memberId).map(r => r.athlete_id).sort();
    assert.deepEqual(links, ["athlete-emma", "athlete-jake"]);

    // Both requests ended up approved, both pointing at the same membership.
    const finalEmma = db.parent_access_requests.find(r => r.id === reqEmma.request.id)!;
    const finalJake = db.parent_access_requests.find(r => r.id === reqJake.request.id)!;
    assert.equal(finalEmma.status, "approved");
    assert.equal(finalJake.status, "approved");
    assert.equal(finalEmma.resulting_member_id, approveEmma.memberId);
    assert.equal(finalJake.resulting_member_id, approveEmma.memberId);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("concurrent duplicate approval of the SAME request: exactly one wins, the other sees already_decided", async () => {
  await withFakeDb(async db => {
    seedAthlete(db, "athlete-1", "wolves", "Abigail Cooper");
    const { createPendingRequest, approveRequest } = await loadService();
    const req = await createPendingRequest({ campaignSlug: "wolves", accountId: "acct-1", parentName: "Jennifer Cooper", athleteId: "athlete-1" });
    if (!req.ok || req.alreadyMember) return assert.fail();

    const [first, second] = await Promise.all([
      approveRequest({ requestId: req.request.id, campaignSlug: "wolves", decidedByAccountId: "coach-1" }),
      approveRequest({ requestId: req.request.id, campaignSlug: "wolves", decidedByAccountId: "coach-2" }),
    ]);

    const outcomes = [first, second];
    const succeeded = outcomes.filter(o => o.ok);
    const failed = outcomes.filter(o => !o.ok);
    assert.equal(succeeded.length, 1, "exactly one concurrent approval of the same request must win");
    assert.equal(failed.length, 1);
    if (!failed[0].ok) assert.equal(failed[0].reason, "already_decided");
    assert.equal(db.team_members.length, 1, "only one membership must be created regardless of the duplicate approval attempt");
  });
});

test("sibling approve + sibling decline overlap: Emma's approval is unaffected by Jake's concurrent decline", async () => {
  await withFakeDb(async db => {
    seedAthlete(db, "athlete-emma", "wolves", "Emma Wagner");
    seedAthlete(db, "athlete-jake", "wolves", "Jake Wagner");
    const { createPendingRequest, approveRequest, declineRequest } = await loadService();

    const reqEmma = await createPendingRequest({ campaignSlug: "wolves", accountId: "acct-1", parentName: "Sarah Wagner", athleteId: "athlete-emma" });
    const reqJake = await createPendingRequest({ campaignSlug: "wolves", accountId: "acct-1", parentName: "Sarah Wagner", athleteId: "athlete-jake" });
    if (!reqEmma.ok || reqEmma.alreadyMember || !reqJake.ok || reqJake.alreadyMember) return assert.fail("setup failed");

    const [approveEmma, declineJake] = await Promise.all([
      approveRequest({ requestId: reqEmma.request.id, campaignSlug: "wolves", decidedByAccountId: "coach-1" }),
      declineRequest({ requestId: reqJake.request.id, campaignSlug: "wolves", decidedByAccountId: "coach-1" }),
    ]);

    if (!approveEmma.ok) return assert.fail("Emma's approval must succeed");
    if (!declineJake.ok) return assert.fail("Jake's decline must succeed");

    assert.equal(declineJake.request.status, "declined");
    const links = db.team_member_athletes.filter(r => r.team_member_id === approveEmma.memberId).map(r => r.athlete_id);
    assert.deepEqual(links, ["athlete-emma"], "Jake's decline must not add or remove any relationship");
    assert.equal(db.team_members.length, 1);
  });
});

test("concurrent approvals for the SAME parent on DIFFERENT campaigns remain fully independent", async () => {
  await withFakeDb(async db => {
    seedAthlete(db, "athlete-1", "wolves", "Abigail Cooper");
    seedAthlete(db, "athlete-9", "hawks", "Liam Hawk");
    const { createPendingRequest, approveRequest } = await loadService();

    const reqWolves = await createPendingRequest({ campaignSlug: "wolves", accountId: "acct-1", parentName: "Jennifer Cooper", athleteId: "athlete-1" });
    const reqHawks  = await createPendingRequest({ campaignSlug: "hawks",  accountId: "acct-1", parentName: "Jennifer Cooper", athleteId: "athlete-9" });
    if (!reqWolves.ok || reqWolves.alreadyMember || !reqHawks.ok || reqHawks.alreadyMember) return assert.fail("setup failed");

    const [approveWolves, approveHawks] = await Promise.all([
      approveRequest({ requestId: reqWolves.request.id, campaignSlug: "wolves", decidedByAccountId: "coach-1" }),
      approveRequest({ requestId: reqHawks.request.id, campaignSlug: "hawks", decidedByAccountId: "coach-9" }),
    ]);

    if (!approveWolves.ok || !approveHawks.ok) return assert.fail("both approvals should succeed independently");
    assert.notEqual(approveWolves.memberId, approveHawks.memberId, "different campaigns must never share a membership row");
    assert.equal(db.team_members.filter(r => r.campaign_slug === "wolves").length, 1);
    assert.equal(db.team_members.filter(r => r.campaign_slug === "hawks").length, 1);
  });
});
