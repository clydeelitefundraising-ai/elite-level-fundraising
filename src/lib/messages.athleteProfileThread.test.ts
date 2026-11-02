// Athlete profile "Messages" — findExistingDirectThread() is the READ-ONLY
// lookup behind the coach's athlete profile button: it must find exactly
// the canonical conversation the composer would reuse (athlete + required
// parents/guardians), never create or modify anything, and never surface
// a conversation the coach isn't part of. Same fake-fetch-DB technique as
// messages.groupMessaging.test.ts.
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

type Row = Record<string, unknown>;

function makeFakeDb() {
  const db: Record<string, Row[]> = {
    team_members:                [],
    team_member_athletes:        [],
    team_coaches:                [],
    message_threads:             [],
    message_thread_participants: [],
    message_thread_athletes:     [],
  };
  let nextId = 1;
  const genId = (prefix: string) => `${prefix}-${nextId++}`;

  function parseQuery(qs: string) {
    const [table, query] = qs.split("?");
    const params = new URLSearchParams(query ?? "");
    return { table, params };
  }

  function matches(row: Row, field: string, expr: string): boolean {
    if (expr.startsWith("eq.")) return String(row[field]) === expr.slice(3);
    if (expr === "is.null") return row[field] === null || row[field] === undefined;
    if (expr.startsWith("in.(") && expr.endsWith(")")) {
      const ids = expr.slice(4, -1).split(",").map(decodeURIComponent);
      return ids.includes(String(row[field]));
    }
    return true;
  }

  function select(table: Row[], params: URLSearchParams): Row[] {
    let rows = table;
    for (const [key, val] of params.entries()) {
      if (key === "select" || key === "limit" || key === "order") continue;
      rows = rows.filter(r => matches(r, key, val));
    }
    const limit = params.get("limit");
    if (limit) rows = rows.slice(0, parseInt(limit, 10));
    return rows.map(r => ({ ...r }));
  }

  async function fetchImpl(url: string, init?: RequestInit): Promise<Response> {
    const path = url.replace(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, "");
    const { table, params } = parseQuery(path);
    const method = init?.method ?? "GET";
    const tableRows = db[table] ?? [];

    if (method === "GET") {
      // Embeds (team_coaches!coach_id(...) etc.) are irrelevant to these
      // tests — getThreadParticipants()'s resolveParticipant() tolerates a
      // missing embed by falling back to "Unknown"/"", which none of these
      // tests assert on.
      return new Response(JSON.stringify(select(tableRows, params)), { status: 200 });
    }
    if (method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const rows = Array.isArray(body) ? body : [body];
      const created = rows.map(r => ({
        id: genId(table),
        created_at: new Date().toISOString(),
        is_auto_included: false,
        is_observer: false,
        removed_at: null,
        coach_id: null,
        member_id: null,
        platform_admin_id: null,
        last_message_at: new Date().toISOString(),
        last_message_preview: null,
        subject: null,
        thread_type: "dm",
        group_name: null,
        archived_at: null,
        created_by_member_id: null,
        created_by_platform_admin_id: null,
        ...r,
      }));
      (db[table] ??= []).push(...created);
      return new Response(JSON.stringify(created), { status: 201 });
    }
    if (method === "PATCH") {
      const patch = JSON.parse(String(init?.body ?? "{}"));
      const matched = select(tableRows, params);
      const matchedIds = new Set(matched.map(r => r.id));
      for (const row of tableRows) if (matchedIds.has(row.id)) Object.assign(row, patch);
      return new Response(JSON.stringify(matched.map(r => ({ ...r, ...patch }))), { status: 200 });
    }
    return new Response("not implemented", { status: 500 });
  }

  return { db, fetchImpl };
}

async function withFakeDb<T>(run: (db: Record<string, Row[]>) => Promise<T>): Promise<T> {
  const { db, fetchImpl } = makeFakeDb();
  const realFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl as typeof fetch;
  try {
    return await run(db);
  } finally {
    globalThis.fetch = realFetch;
  }
}

async function loadModule() {
  return import("./messages.ts");
}

const SLUG = "wolves";
const OTHER = "lions";

function seedAthlete(db: Record<string, Row[]>, memberId: string, athleteId: string, name = "Athlete") {
  db.team_members.push({ id: memberId, campaign_slug: SLUG, role: "athlete", athlete_id: athleteId, name, account_id: null });
}
function seedParent(db: Record<string, Row[]>, memberId: string, athleteId: string, name = "Parent") {
  db.team_members.push({ id: memberId, campaign_slug: SLUG, role: "parent", athlete_id: athleteId, name, account_id: null });
}
function seedCoach(db: Record<string, Row[]>, coachId: string, role: "head_coach" | "assistant_coach" = "head_coach", name = "Coach") {
  db.team_coaches.push({ id: coachId, campaign_slug: SLUG, role, name, account_id: null });
}

const coach = (id: string) => ({ kind: "coach" as const, id });

async function resolve(mod: Awaited<ReturnType<typeof loadModule>>, actorId: string, recipientId: string, isHead = false) {
  return mod.resolveOrCreateThreadForRecipient({
    slug: SLUG, actor: coach(actorId), actorName: "Coach", actorRole: isHead ? "head_coach" : "assistant_coach",
    actorIsHeadCoach: isHead, recipientActorType: "member", recipientId, initialPreview: null,
  });
}

test("athlete with a linked parent: finds the existing family conversation the parent started", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "c-asst", "assistant_coach");
    seedAthlete(db, "m-hannah", "a-hannah", "Hannah Gray");
    seedParent(db, "m-douglas", "a-hannah", "Douglas Gray");
    const mod = await loadModule();
    // Douglas (parent) -> coach: Hannah is auto-included as family.
    const started = await mod.resolveOrCreateThreadForRecipient({
      slug: SLUG, actor: { kind: "member", id: "m-douglas" }, actorName: "Douglas Gray", actorRole: "parent",
      actorIsHeadCoach: false, recipientActorType: "coach", recipientId: "c-asst", initialPreview: null,
    });
    if (!started.ok) return assert.fail(started.error);
    const found = await mod.findExistingDirectThread({ slug: SLUG, actor: coach("c-asst"), recipientActorType: "member", recipientId: "m-hannah" });
    assert.equal(found?.id, started.thread.id, "the family thread is the athlete's conversation — reused, not a new athlete-only thread");
  });
});

test("the lookup matches what the composer would reuse, and repeated sends never duplicate", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "c-asst", "assistant_coach");
    seedCoach(db, "c-head", "head_coach");
    seedAthlete(db, "m-hannah", "a-hannah", "Hannah Gray");
    seedParent(db, "m-douglas", "a-hannah", "Douglas Gray");
    const mod = await loadModule();
    const first = await resolve(mod, "c-asst", "m-hannah");
    const second = await resolve(mod, "c-asst", "m-hannah");
    if (!first.ok || !second.ok) return assert.fail();
    assert.equal(second.thread.id, first.thread.id);
    assert.equal(second.reused, true);
    assert.equal(db.message_threads.length, 1);
    const found = await mod.findExistingDirectThread({ slug: SLUG, actor: coach("c-asst"), recipientActorType: "member", recipientId: "m-hannah" });
    assert.equal(found?.id, first.thread.id);
    // The thread keeps parent oversight: parent is a full participant, the head coach an observer.
    const parts = db.message_thread_participants.filter(p => p.thread_id === first.thread.id);
    assert.ok(parts.some(p => p.member_id === "m-douglas" && !p.is_observer), "parent included");
    assert.ok(parts.some(p => p.coach_id === "c-head" && p.is_observer), "head coach oversight");
  });
});

test("athlete with no conversation: returns null and writes nothing", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "c-asst", "assistant_coach");
    seedAthlete(db, "m-hannah", "a-hannah");
    seedParent(db, "m-douglas", "a-hannah");
    const mod = await loadModule();
    const before = JSON.stringify(db);
    const found = await mod.findExistingDirectThread({ slug: SLUG, actor: coach("c-asst"), recipientActorType: "member", recipientId: "m-hannah" });
    assert.equal(found, null);
    assert.equal(JSON.stringify(db), before, "read-only: no thread, participant or oversight row is created");
  });
});

test("a thread the coach only oversees (another coach's conversation) is not returned", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "c-asst", "assistant_coach");
    seedCoach(db, "c-head", "head_coach");
    seedAthlete(db, "m-hannah", "a-hannah");
    const mod = await loadModule();
    const asst = await resolve(mod, "c-asst", "m-hannah");
    if (!asst.ok) return assert.fail();
    const found = await mod.findExistingDirectThread({ slug: SLUG, actor: coach("c-head"), recipientActorType: "member", recipientId: "m-hannah" });
    assert.equal(found, null, "the head coach's own conversation with the athlete is a different canonical thread");
  });
});

test("an athlete-only thread is never matched when a parent is linked (oversight can't be bypassed)", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "c-asst", "assistant_coach");
    seedAthlete(db, "m-hannah", "a-hannah");
    seedParent(db, "m-douglas", "a-hannah");
    // A legacy coach+athlete-only DM (no parent).
    db.message_threads.push({ id: "t-legacy", campaign_slug: SLUG, thread_type: "dm", archived_at: null, last_message_at: new Date().toISOString() });
    db.message_thread_participants.push(
      { id: "p1", thread_id: "t-legacy", actor_type: "coach", coach_id: "c-asst", member_id: null, platform_admin_id: null, is_observer: false, removed_at: null },
      { id: "p2", thread_id: "t-legacy", actor_type: "member", coach_id: null, member_id: "m-hannah", platform_admin_id: null, is_observer: false, removed_at: null },
    );
    const mod = await loadModule();
    const found = await mod.findExistingDirectThread({ slug: SLUG, actor: coach("c-asst"), recipientActorType: "member", recipientId: "m-hannah" });
    assert.equal(found, null);
  });
});

test("team context: a member of another team is never resolved", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "c-asst", "assistant_coach");
    db.team_members.push({ id: "m-other", campaign_slug: OTHER, role: "athlete", athlete_id: "a-other", name: "Other", account_id: null });
    const mod = await loadModule();
    const found = await mod.findExistingDirectThread({ slug: SLUG, actor: coach("c-asst"), recipientActorType: "member", recipientId: "m-other" });
    assert.equal(found, null);
  });
});

test("members can't use the lookup to reach other members", async () => {
  await withFakeDb(async db => {
    seedAthlete(db, "m-hannah", "a-hannah");
    seedParent(db, "m-douglas", "a-hannah");
    const mod = await loadModule();
    const found = await mod.findExistingDirectThread({ slug: SLUG, actor: { kind: "member", id: "m-douglas" }, recipientActorType: "member", recipientId: "m-hannah" });
    assert.equal(found, null);
  });
});

// ── Parent recipients: only parents someone can sign in as (messageRecipients.ts)

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();
function seedParentAs(db: Record<string, Row[]>, memberId: string, athleteId: string, opts: { accountId?: string | null; createdAt?: string | null; slug?: string; name?: string }) {
  db.team_members.push({
    id: memberId, campaign_slug: opts.slug ?? SLUG, role: "parent", athlete_id: athleteId, name: opts.name ?? "Parent",
    account_id: opts.accountId ?? null, created_at: opts.createdAt ?? null,
  });
}

test("parent recipient with an ELF account: a new conversation is created, with family and head coach oversight", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "c-asst", "assistant_coach");
    seedCoach(db, "c-head", "head_coach");
    seedAthlete(db, "m-jo", "a-jo", "Jo Junior");
    seedParentAs(db, "m-tess", "a-jo", { accountId: "acct-tess", createdAt: daysAgo(200), name: "Tess Two" });
    const mod = await loadModule();
    const res = await resolve(mod, "c-asst", "m-tess");
    if (!res.ok) return assert.fail(res.error);
    assert.equal(res.reused, false);
    const parts = db.message_thread_participants.filter(p => p.thread_id === res.thread.id);
    assert.ok(parts.some(p => p.member_id === "m-jo" && !p.is_observer), "athlete included (oversight)");
    assert.ok(parts.some(p => p.coach_id === "c-head" && p.is_observer), "head coach oversight");
  });
});

test("parent with no account and no possible session: refused before anything is written", async () => {
  for (const createdAt of [daysAgo(31), daysAgo(400), null]) {
    await withFakeDb(async db => {
      seedCoach(db, "c-asst", "assistant_coach");
      seedAthlete(db, "m-fay", "a-fay");
      seedParentAs(db, "m-nora", "a-fay", { accountId: null, createdAt, name: "Nora NoAccount" });
      const mod = await loadModule();
      const before = JSON.stringify(db);
      const res = await resolve(mod, "c-asst", "m-nora");
      assert.equal(res.ok, false, String(createdAt));
      if (res.ok) return;
      assert.equal(res.status, 422);
      assert.match(res.error, /doesn't have an active ELF account/);
      assert.equal(JSON.stringify(db), before, "no thread, participant or oversight row");
    });
  }
});

test("legacy team-code parent still inside the 30-day session: can be messaged", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "c-asst", "assistant_coach");
    seedAthlete(db, "m-lou", "a-lou");
    seedParentAs(db, "m-gil", "a-lou", { accountId: null, createdAt: daysAgo(5), name: "Gil Graduating" });
    const mod = await loadModule();
    const res = await resolve(mod, "c-asst", "m-gil");
    assert.equal(res.ok, true);
  });
});

test("an existing conversation with a parent who can no longer sign in keeps working (reused, nothing refused)", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "c-asst", "assistant_coach");
    seedAthlete(db, "m-sam", "a-sam");
    seedParentAs(db, "m-pat", "a-sam", { accountId: null, createdAt: daysAgo(90), name: "Pat Mixed" });
    const mod = await loadModule();
    // The parent started it back when they could sign in.
    const started = await mod.resolveOrCreateThreadForRecipient({
      slug: SLUG, actor: { kind: "member", id: "m-pat" }, actorName: "Pat Mixed", actorRole: "parent",
      actorIsHeadCoach: false, recipientActorType: "coach", recipientId: "c-asst", initialPreview: null,
    });
    if (!started.ok) return assert.fail(started.error);
    const again = await resolve(mod, "c-asst", "m-pat");
    if (!again.ok) return assert.fail(again.error);
    assert.equal(again.reused, true);
    assert.equal(again.thread.id, started.thread.id);
    assert.equal(db.message_threads.length, 1);
  });
});

test("athlete recipients and other teams' parents are unaffected by the parent rule", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "c-asst", "assistant_coach");
    seedAthlete(db, "m-jo", "a-jo");
    seedParentAs(db, "m-old", "a-jo", { accountId: null, createdAt: daysAgo(400) });
    seedParentAs(db, "m-elsewhere", "a-x", { accountId: "acct-x", createdAt: daysAgo(1), slug: OTHER });
    const mod = await loadModule();
    const toAthlete = await resolve(mod, "c-asst", "m-jo");
    assert.equal(toAthlete.ok, true, "athlete conversation still created (the inactive parent is included for oversight)");
    const other = await resolve(mod, "c-asst", "m-elsewhere");
    assert.equal(other.ok, false);
    if (!other.ok) assert.equal(other.status, 404, "another team's parent is never resolved");
  });
});
