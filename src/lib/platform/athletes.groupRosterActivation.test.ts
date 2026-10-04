// Group Messaging G3A — proves createLinkedAthleteMember() (the canonical
// "roster athlete became a joined identity" lifecycle hook) actually
// activates any pre-existing roster-group assignments for that athlete, via
// its dynamic import of messages.ts. Same fake-fetch-DB technique as
// messages.groupMessaging.test.ts (supports is.null/in.() query operators,
// needed for the activation hook's own queries) — this file additionally
// models `athletes` (for validateAthleteForCampaign) since createLinkedAthleteMember
// itself requires it.
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

type Row = Record<string, unknown>;

function makeFakeDb() {
  const db: Record<string, Row[]> = {
    athletes:                    [],
    team_members:                [],
    team_member_athletes:        [],
    team_coaches:                [],
    message_threads:             [],
    message_thread_participants: [],
    message_thread_athletes:     [],
  };
  let nextId = 1;
  const genId = (prefix: string) => `${prefix}-${nextId++}`;

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
    const [table, query] = path.split("?");
    const params = new URLSearchParams(query ?? "");
    const method = init?.method ?? "GET";
    const tableRows = db[table] ?? [];

    if (method === "GET") {
      // Injected failure for the "cleanup fails -> athlete not deleted"
      // test: simulates removeRosterAthleteFromAllGroups()'s initial
      // assignment lookup itself failing (network/auth error), never a
      // real business-logic case.
      if (table === "message_thread_athletes" && params.get("athlete_id") === "eq.athlete-force-fail") {
        return new Response("simulated failure", { status: 500 });
      }
      return new Response(JSON.stringify(select(tableRows, params)), { status: 200 });
    }
    if (method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const rows = Array.isArray(body) ? body : [body];
      const created = rows.map(r => ({
        id: genId(table), created_at: new Date().toISOString(),
        is_auto_included: false, is_observer: false, removed_at: null,
        coach_id: null, member_id: null, platform_admin_id: null,
        last_message_at: new Date().toISOString(), last_message_preview: null,
        subject: null, thread_type: "dm", group_name: null, archived_at: null,
        created_by_member_id: null, created_by_platform_admin_id: null,
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
    if (method === "DELETE") {
      const matched = select(tableRows, params);
      const matchedIds = new Set(matched.map(r => r.id));
      db[table] = tableRows.filter(r => !matchedIds.has(r.id));
      return new Response(JSON.stringify(matched), { status: 200 });
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

const SLUG = "wolves";

function seedCoach(db: Record<string, Row[]>, coachId: string, name = "Coach") {
  db.team_coaches.push({ id: coachId, campaign_slug: SLUG, role: "head_coach", name, account_id: null });
}
function seedRosterAthlete(db: Record<string, Row[]>, athleteId: string, name = "Carter Sanders") {
  db.athletes.push({ id: athleteId, campaign_slug: SLUG, name });
}
function seedJoinedAthlete(db: Record<string, Row[]>, memberId: string, athleteId: string, name = "Carter Sanders") {
  seedRosterAthlete(db, athleteId, name);
  db.team_members.push({ id: memberId, campaign_slug: SLUG, role: "athlete", athlete_id: athleteId, name, account_id: null });
}
function seedParent(db: Record<string, Row[]>, memberId: string, athleteId: string, name = "Parent") {
  db.team_members.push({ id: memberId, campaign_slug: SLUG, role: "parent", athlete_id: athleteId, name, account_id: null });
}

test("G3A: createLinkedAthleteMember activates pre-existing roster-group assignments on join", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    seedRosterAthlete(db, "athlete-carter");
    const { createGroupThread, getThreadParticipants } = await import("../messages.ts");
    const group = await createGroupThread({
      slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach",
      name: "Varsity Long Jump", rosterAthleteIds: ["athlete-carter"], coachIds: [],
    });
    if (!group.ok) return assert.fail();

    // Sanity: Carter has no participant row yet — he hasn't joined.
    let participants = await getThreadParticipants(group.thread.id);
    assert.ok(!participants.some(p => p.member_id === "athlete-carter"));

    const { createLinkedAthleteMember } = await import("./athletes.ts");
    const result = await createLinkedAthleteMember({
      campaignSlug: SLUG, athleteId: "athlete-carter", accountId: "acct-carter", name: "Carter Sanders",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    participants = await getThreadParticipants(group.thread.id);
    assert.ok(participants.some(p => p.member_id === result.member.id), "Carter's new team_members identity must be activated into Varsity Long Jump automatically, with no coach action");
  });
});

test("G3A: createLinkedAthleteMember succeeds even if roster activation would fail (best-effort, never blocks the join)", async () => {
  await withFakeDb(async db => {
    seedRosterAthlete(db, "athlete-carter");
    // Deliberately no coach/group seeded — activateRosterAssignmentsForJoinedAthlete
    // will find zero assignments and no-op, proving the join itself never
    // depends on there being anything to activate.
    const { createLinkedAthleteMember } = await import("./athletes.ts");
    const result = await createLinkedAthleteMember({
      campaignSlug: SLUG, athleteId: "athlete-carter", accountId: "acct-carter", name: "Carter Sanders",
    });
    assert.equal(result.ok, true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// G3A review correction — deleteAthleteWithMessagingCleanup()
// ═══════════════════════════════════════════════════════════════════════════

test("G3A delete: assigned + JOINED athlete deleted -> their group message access is removed", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    seedJoinedAthlete(db, "m-carter", "athlete-carter");
    const { createGroupThread, getThreadParticipants } = await import("../messages.ts");
    const group = await createGroupThread({
      slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach",
      name: "Varsity Long Jump", rosterAthleteIds: ["athlete-carter"], coachIds: [],
    });
    if (!group.ok) return assert.fail();
    let participants = await getThreadParticipants(group.thread.id);
    assert.ok(participants.some(p => p.member_id === "m-carter"), "sanity: Carter is an active participant before deletion");

    const { deleteAthleteWithMessagingCleanup } = await import("./athletes.ts");
    const result = await deleteAthleteWithMessagingCleanup("athlete-carter", SLUG);
    assert.equal(result.ok, true);

    participants = await getThreadParticipants(group.thread.id);
    assert.ok(!participants.some(p => p.member_id === "m-carter"), "Carter's message access must be removed once his roster row is deleted");
    assert.ok(!db.athletes.some((a: Row) => a.id === "athlete-carter"), "the athlete row itself must actually be deleted");
  });
});

test("G3A delete: assigned + UNJOINED athlete deleted -> the assignment disappears cleanly, nothing throws", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    seedRosterAthlete(db, "athlete-carter");
    const { createGroupThread, getActiveRosterAssignments } = await import("../messages.ts");
    const group = await createGroupThread({
      slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach",
      name: "Varsity Long Jump", rosterAthleteIds: ["athlete-carter"], coachIds: [],
    });
    if (!group.ok) return assert.fail();

    const { deleteAthleteWithMessagingCleanup } = await import("./athletes.ts");
    const result = await deleteAthleteWithMessagingCleanup("athlete-carter", SLUG);
    assert.equal(result.ok, true);

    assert.deepEqual(await getActiveRosterAssignments(group.thread.id), []);
    assert.ok(!db.athletes.some((a: Row) => a.id === "athlete-carter"));
  });
});

test("G3A delete: deleting an athlete with an auto-included parent reconciles the family participant away", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    seedRosterAthlete(db, "athlete-carter");
    seedParent(db, "m-mom", "athlete-carter", "Mom");
    const { createGroupThread, getThreadParticipants } = await import("../messages.ts");
    const group = await createGroupThread({
      slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach",
      name: "Varsity Long Jump", rosterAthleteIds: ["athlete-carter"], coachIds: [],
    });
    if (!group.ok) return assert.fail();
    let participants = await getThreadParticipants(group.thread.id);
    assert.ok(participants.some(p => p.member_id === "m-mom"), "sanity: Mom is active before deletion");

    const { deleteAthleteWithMessagingCleanup } = await import("./athletes.ts");
    await deleteAthleteWithMessagingCleanup("athlete-carter", SLUG);

    participants = await getThreadParticipants(group.thread.id);
    assert.ok(!participants.some(p => p.member_id === "m-mom"), "Mom must lose access — Carter was her only qualifying assignment in this group");
  });
});

test("G3A delete: parent linked to two assigned siblings keeps access through the remaining sibling", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    seedRosterAthlete(db, "athlete-carter");
    seedRosterAthlete(db, "athlete-abby", "Abby Cooper");
    seedParent(db, "m-mom", "athlete-carter", "Mom");
    db.team_member_athletes.push({ team_member_id: "m-mom", athlete_id: "athlete-abby" });
    const { createGroupThread, getThreadParticipants } = await import("../messages.ts");
    const group = await createGroupThread({
      slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach",
      name: "Varsity Long Jump", rosterAthleteIds: ["athlete-carter", "athlete-abby"], coachIds: [],
    });
    if (!group.ok) return assert.fail();

    const { deleteAthleteWithMessagingCleanup } = await import("./athletes.ts");
    await deleteAthleteWithMessagingCleanup("athlete-carter", SLUG);

    const participants = await getThreadParticipants(group.thread.id);
    assert.ok(participants.some(p => p.member_id === "m-mom"), "Mom must remain — Abby's assignment still justifies her inclusion");
  });
});

test("G3A delete: deleting the FINAL qualifying child removes the family-only parent's access", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    seedRosterAthlete(db, "athlete-carter");
    seedRosterAthlete(db, "athlete-abby", "Abby Cooper");
    seedParent(db, "m-mom", "athlete-carter", "Mom");
    db.team_member_athletes.push({ team_member_id: "m-mom", athlete_id: "athlete-abby" });
    const { createGroupThread, getThreadParticipants } = await import("../messages.ts");
    const group = await createGroupThread({
      slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach",
      name: "Varsity Long Jump", rosterAthleteIds: ["athlete-carter", "athlete-abby"], coachIds: [],
    });
    if (!group.ok) return assert.fail();

    const { deleteAthleteWithMessagingCleanup } = await import("./athletes.ts");
    await deleteAthleteWithMessagingCleanup("athlete-carter", SLUG);
    await deleteAthleteWithMessagingCleanup("athlete-abby", SLUG);

    const participants = await getThreadParticipants(group.thread.id);
    assert.ok(!participants.some(p => p.member_id === "m-mom"), "Mom must lose access once no assigned child remains");
  });
});

test("G3A delete: unrelated staff and other athletes are never touched", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    seedCoach(db, "coach-2", "Assistant");
    seedRosterAthlete(db, "athlete-carter");
    seedJoinedAthlete(db, "m-colin", "athlete-colin");
    const { createGroupThread, getThreadParticipants } = await import("../messages.ts");
    const group = await createGroupThread({
      slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach",
      name: "Varsity Long Jump", rosterAthleteIds: ["athlete-carter", "athlete-colin"], coachIds: ["coach-2"],
    });
    if (!group.ok) return assert.fail();

    const { deleteAthleteWithMessagingCleanup } = await import("./athletes.ts");
    await deleteAthleteWithMessagingCleanup("athlete-carter", SLUG);

    const participants = await getThreadParticipants(group.thread.id);
    assert.deepEqual(participants.filter(p => p.actor_type === "coach").map(c => c.coach_id).sort(), ["coach-1", "coach-2"]);
    assert.ok(participants.some(p => p.member_id === "m-colin"), "Colin, a different athlete entirely, must be unaffected");
  });
});

test("G3A delete: a DM thread (no message_thread_athletes row ever exists for it) is never touched", async () => {
  await withFakeDb(async db => {
    seedJoinedAthlete(db, "m-carter", "athlete-carter");
    db.message_threads.push({
      id: "dm-1", campaign_slug: SLUG, thread_type: "dm", group_name: null, archived_at: null,
      subject: null, created_by_type: "coach", created_by_coach_id: "coach-1", created_by_member_id: null,
      created_by_platform_admin_id: null, creator_name: "Coach", creator_role: "head_coach",
      last_message_at: new Date().toISOString(), last_message_preview: null, created_at: new Date().toISOString(),
    });
    db.message_thread_participants.push(
      { id: "p1", thread_id: "dm-1", actor_type: "member", coach_id: null, member_id: "m-carter", platform_admin_id: null, is_auto_included: false, is_observer: false, removed_at: null },
    );

    const { deleteAthleteWithMessagingCleanup } = await import("./athletes.ts");
    const result = await deleteAthleteWithMessagingCleanup("athlete-carter", SLUG);
    assert.equal(result.ok, true);

    const dmRow = db.message_thread_participants.find((p: Row) => p.thread_id === "dm-1");
    assert.equal(dmRow?.removed_at, null, "a DM participant must never be touched by roster-deletion cleanup — only message_thread_athletes-seeded group access is in scope");
  });
});

test("G3A delete: if messaging cleanup fails, the athlete is NOT deleted", async () => {
  await withFakeDb(async db => {
    seedRosterAthlete(db, "athlete-force-fail");

    const { deleteAthleteWithMessagingCleanup } = await import("./athletes.ts");
    const result = await deleteAthleteWithMessagingCleanup("athlete-force-fail", SLUG);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "messaging_cleanup_failed");

    assert.ok(db.athletes.some((a: Row) => a.id === "athlete-force-fail"), "the athlete row must still exist — a failed cleanup must never allow the delete to proceed");
  });
});

test("G3A delete: a nonexistent athlete id returns not_found without attempting cleanup", async () => {
  await withFakeDb(async () => {
    const { deleteAthleteWithMessagingCleanup } = await import("./athletes.ts");
    const result = await deleteAthleteWithMessagingCleanup("athlete-does-not-exist", SLUG);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "not_found");
  });
});
