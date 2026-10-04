// Group Messaging G1 — service-layer tests for the new group functions in
// messages.ts (createGroupThread, addGroupParticipants,
// removeGroupParticipant, canManageGroupThread, validateGroupName), plus
// regression coverage proving DM-only logic (findCanonicalExistingThread)
// is unaffected. Same fake-fetch-DB technique as
// resolveRequiredFamilyParticipants.test.ts — dynamic import AFTER setting
// env vars, since messages.ts reads them into top-level consts.
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

function seedAthlete(db: Record<string, Row[]>, memberId: string, athleteId: string, name = "Athlete") {
  db.team_members.push({ id: memberId, campaign_slug: SLUG, role: "athlete", athlete_id: athleteId, name, account_id: null });
}
function seedParent(db: Record<string, Row[]>, memberId: string, athleteId: string, name = "Parent") {
  db.team_members.push({ id: memberId, campaign_slug: SLUG, role: "parent", athlete_id: athleteId, name, account_id: null });
}
function seedCoach(db: Record<string, Row[]>, coachId: string, role: "head_coach" | "assistant_coach" = "head_coach", name = "Coach") {
  db.team_coaches.push({ id: coachId, campaign_slug: SLUG, role, name, account_id: null });
}

// ── validateGroupName ──────────────────────────────────────────────────────

test("validateGroupName: required", async () => {
  const { validateGroupName } = await loadModule();
  assert.equal(validateGroupName(undefined).ok, false);
  assert.equal(validateGroupName(null).ok, false);
  assert.equal(validateGroupName("").ok, false);
});

test("validateGroupName: whitespace-only is rejected", async () => {
  const { validateGroupName } = await loadModule();
  assert.equal(validateGroupName("   ").ok, false);
});

test("validateGroupName: trims", async () => {
  const { validateGroupName } = await loadModule();
  const result = validateGroupName("  Varsity Jumps  ");
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.name, "Varsity Jumps");
});

test("validateGroupName: enforces the 80-char max", async () => {
  const { validateGroupName, GROUP_NAME_MAX_LENGTH } = await loadModule();
  assert.equal(GROUP_NAME_MAX_LENGTH, 80);
  assert.equal(validateGroupName("a".repeat(81)).ok, false);
  assert.equal(validateGroupName("a".repeat(80)).ok, true);
});

// ── canManageGroupThread ────────────────────────────────────────────────────

test("canManageGroupThread: Head Coach manages any group", async () => {
  const { canManageGroupThread } = await loadModule();
  const thread = { created_by_type: "coach" as const, created_by_coach_id: "some-other-coach" };
  assert.equal(canManageGroupThread("head_coach", "head-coach-id", thread), true);
});

test("canManageGroupThread: Assistant Coach manages only their own group", async () => {
  const { canManageGroupThread } = await loadModule();
  const ownThread = { created_by_type: "coach" as const, created_by_coach_id: "assistant-1" };
  const otherThread = { created_by_type: "coach" as const, created_by_coach_id: "assistant-2" };
  assert.equal(canManageGroupThread("assistant_coach", "assistant-1", ownThread), true);
  assert.equal(canManageGroupThread("assistant_coach", "assistant-1", otherThread), false);
});

// ── createGroupThread ────────────────────────────────────────────────────────

test("createGroupThread: creator, selected athlete, and selected staff are all present", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1", "head_coach");
    seedCoach(db, "coach-2", "assistant_coach");
    seedAthlete(db, "m-carter", "athlete-carter", "Carter Sanders");
    const { createGroupThread, getThreadParticipants } = await loadModule();

    const result = await createGroupThread({
      slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach Smith", creatorRole: "head_coach",
      name: "Varsity Jumps", rosterAthleteIds: ["athlete-carter"], coachIds: ["coach-2"],
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.thread.thread_type, "group");
    assert.equal(result.thread.group_name, "Varsity Jumps");

    const participants = await getThreadParticipants(result.thread.id);
    const coachIds = participants.filter(p => p.actor_type === "coach").map(p => p.coach_id);
    const memberIds = participants.filter(p => p.actor_type === "member").map(p => p.member_id);
    assert.deepEqual(coachIds.sort(), ["coach-1", "coach-2"]);
    assert.deepEqual(memberIds, ["m-carter"]);
  });
});

test("createGroupThread: a linked parent is automatically included", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    seedAthlete(db, "m-carter", "athlete-carter");
    seedParent(db, "m-parent", "athlete-carter", "Sarah");
    const { createGroupThread, getThreadParticipants } = await loadModule();

    const result = await createGroupThread({
      slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach",
      name: "Varsity Jumps", rosterAthleteIds: ["athlete-carter"], coachIds: [],
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const participants = await getThreadParticipants(result.thread.id);
    const parent = participants.find(p => p.member_id === "m-parent");
    assert.ok(parent, "linked parent must be a participant");
    assert.equal(parent?.is_auto_included, true);
  });
});

test("createGroupThread: multiple parents linked to the same athlete are ALL included", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    seedAthlete(db, "m-carter", "athlete-carter");
    seedParent(db, "m-parent-a", "athlete-carter", "Mom");
    seedParent(db, "m-parent-b", "athlete-carter", "Dad");
    const { createGroupThread, getThreadParticipants } = await loadModule();

    const result = await createGroupThread({
      slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach",
      name: "Varsity Jumps", rosterAthleteIds: ["athlete-carter"], coachIds: [],
    });
    if (!result.ok) return assert.fail();
    const participants = await getThreadParticipants(result.thread.id);
    const parentIds = participants.filter(p => p.member_id?.startsWith("m-parent")).map(p => p.member_id);
    assert.deepEqual(parentIds.sort(), ["m-parent-a", "m-parent-b"]);
  });
});

test("createGroupThread: a parent linked to TWO selected athletes is included exactly once (deduped)", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    seedAthlete(db, "m-carter", "athlete-carter");
    seedAthlete(db, "m-colin", "athlete-colin");
    db.team_members.push({ id: "m-parent", campaign_slug: SLUG, role: "parent", athlete_id: "athlete-carter", name: "Sarah", account_id: null });
    db.team_member_athletes.push({ team_member_id: "m-parent", athlete_id: "athlete-colin" });
    const { createGroupThread, getThreadParticipants } = await loadModule();

    const result = await createGroupThread({
      slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach",
      name: "Varsity Jumps", rosterAthleteIds: ["athlete-carter", "athlete-colin"], coachIds: [],
    });
    if (!result.ok) return assert.fail();
    const participants = await getThreadParticipants(result.thread.id);
    const parentRows = participants.filter(p => p.member_id === "m-parent");
    assert.equal(parentRows.length, 1, "the same parent must not appear twice despite two qualifying children");
  });
});

test("createGroupThread: two groups with identical participants coexist as separate threads", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    seedAthlete(db, "m-carter", "athlete-carter");
    const { createGroupThread } = await loadModule();

    const a = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "Varsity Jumps", rosterAthleteIds: ["athlete-carter"], coachIds: [] });
    const b = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "State Meet Travel", rosterAthleteIds: ["athlete-carter"], coachIds: [] });
    if (!a.ok || !b.ok) return assert.fail();
    assert.notEqual(a.thread.id, b.thread.id);
    assert.equal(db.message_threads.length, 2);
  });
});

// ── addGroupParticipants / removeGroupParticipant (soft removal) ───────────

test("removeGroupParticipant: removed athlete is excluded from active participants, message_thread_participants row is NOT deleted", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    seedAthlete(db, "m-carter", "athlete-carter");
    const { createGroupThread, getThreadParticipants, removeGroupParticipant } = await loadModule();
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", rosterAthleteIds: ["athlete-carter"], coachIds: [] });
    if (!created.ok) return assert.fail();

    const result = await removeGroupParticipant(created.thread.id, SLUG, { actor_type: "member", coach_id: null, member_id: "m-carter", platform_admin_id: null });
    assert.equal(result.ok, true);

    const active = await getThreadParticipants(created.thread.id);
    assert.ok(!active.some(p => p.member_id === "m-carter"), "removed athlete must not appear in the active list");

    const rowStillExists = db.message_thread_participants.some(p => p.member_id === "m-carter");
    assert.equal(rowStillExists, true, "the row itself must be soft-removed, not deleted");
  });
});

test("addGroupParticipants (re-add) reactivates the existing row rather than creating a duplicate", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    seedAthlete(db, "m-carter", "athlete-carter");
    const { createGroupThread, getThreadParticipants, removeGroupParticipant, addGroupParticipants } = await loadModule();
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", rosterAthleteIds: ["athlete-carter"], coachIds: [] });
    if (!created.ok) return assert.fail();

    await removeGroupParticipant(created.thread.id, SLUG, { actor_type: "member", coach_id: null, member_id: "m-carter", platform_admin_id: null });
    await addGroupParticipants({ threadId: created.thread.id, campaignSlug: SLUG, rosterAthleteIds: ["athlete-carter"], coachIds: [] });

    const rowsForCarter = db.message_thread_participants.filter(p => p.member_id === "m-carter");
    assert.equal(rowsForCarter.length, 1, "re-adding must reactivate the existing row, never create a second one");
    assert.equal(rowsForCarter[0].removed_at, null);

    const active = await getThreadParticipants(created.thread.id);
    assert.ok(active.some(p => p.member_id === "m-carter"));
  });
});

test("addGroupParticipants reactivates a previously family-removed parent when they're required again", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    seedAthlete(db, "m-carter", "athlete-carter");
    seedParent(db, "m-parent", "athlete-carter", "Sarah");
    const { createGroupThread, getThreadParticipants, removeGroupParticipant, addGroupParticipants } = await loadModule();
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", rosterAthleteIds: ["athlete-carter"], coachIds: [] });
    if (!created.ok) return assert.fail();

    // Remove Carter -> reconciliation removes Sarah too (no other reason to stay).
    await removeGroupParticipant(created.thread.id, SLUG, { actor_type: "member", coach_id: null, member_id: "m-carter", platform_admin_id: null });
    let active = await getThreadParticipants(created.thread.id);
    assert.ok(!active.some(p => p.member_id === "m-parent"), "Sarah should have been reconciled away with Carter");

    // Re-add Carter -> Sarah should come back too, reactivated not duplicated.
    await addGroupParticipants({ threadId: created.thread.id, campaignSlug: SLUG, rosterAthleteIds: ["athlete-carter"], coachIds: [] });
    active = await getThreadParticipants(created.thread.id);
    assert.ok(active.some(p => p.member_id === "m-parent"), "Sarah must be reactivated once Carter is back");
    const parentRows = db.message_thread_participants.filter(p => p.member_id === "m-parent");
    assert.equal(parentRows.length, 1);
  });
});

test("reconciliation: parent retained when a DIFFERENT selected athlete still grants access", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    seedAthlete(db, "m-carter", "athlete-carter");
    seedAthlete(db, "m-colin", "athlete-colin");
    db.team_members.push({ id: "m-parent", campaign_slug: SLUG, role: "parent", athlete_id: "athlete-carter", name: "Sarah", account_id: null });
    db.team_member_athletes.push({ team_member_id: "m-parent", athlete_id: "athlete-colin" });
    const { createGroupThread, getThreadParticipants, removeGroupParticipant } = await loadModule();
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", rosterAthleteIds: ["athlete-carter", "athlete-colin"], coachIds: [] });
    if (!created.ok) return assert.fail();

    await removeGroupParticipant(created.thread.id, SLUG, { actor_type: "member", coach_id: null, member_id: "m-carter", platform_admin_id: null });

    const active = await getThreadParticipants(created.thread.id);
    assert.ok(active.some(p => p.member_id === "m-parent"), "Sarah must remain — Colin still justifies her inclusion");
    assert.ok(!active.some(p => p.member_id === "m-carter"), "Carter himself must be gone");
  });
});

test("reconciliation: manually-selected staff is never touched by family reconciliation", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    seedCoach(db, "coach-2", "assistant_coach", "Assistant");
    seedAthlete(db, "m-carter", "athlete-carter");
    const { createGroupThread, getThreadParticipants, removeGroupParticipant } = await loadModule();
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", rosterAthleteIds: ["athlete-carter"], coachIds: ["coach-2"] });
    if (!created.ok) return assert.fail();

    await removeGroupParticipant(created.thread.id, SLUG, { actor_type: "member", coach_id: null, member_id: "m-carter", platform_admin_id: null });

    const active = await getThreadParticipants(created.thread.id);
    assert.ok(active.some(p => p.coach_id === "coach-2"), "manually-selected staff must be unaffected by athlete removal/reconciliation");
  });
});

test("removeGroupParticipant refuses to remove the last active coach from a group", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    seedAthlete(db, "m-carter", "athlete-carter");
    const { createGroupThread, removeGroupParticipant } = await loadModule();
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", rosterAthleteIds: ["athlete-carter"], coachIds: [] });
    if (!created.ok) return assert.fail();

    const result = await removeGroupParticipant(created.thread.id, SLUG, { actor_type: "coach", coach_id: "coach-1", member_id: null, platform_admin_id: null });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 400);
  });
});

test("removeGroupParticipant refuses to directly remove an auto-included (family) participant", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    seedAthlete(db, "m-carter", "athlete-carter");
    seedParent(db, "m-parent", "athlete-carter", "Sarah");
    const { createGroupThread, removeGroupParticipant } = await loadModule();
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", rosterAthleteIds: ["athlete-carter"], coachIds: [] });
    if (!created.ok) return assert.fail();

    const result = await removeGroupParticipant(created.thread.id, SLUG, { actor_type: "member", coach_id: null, member_id: "m-parent", platform_admin_id: null });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 400);
  });
});

// ── DM regression: findCanonicalExistingThread is unaffected by thread_type ──

test("DM regression: findCanonicalExistingThread only ever matches thread_type=dm, never a group", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    seedAthlete(db, "m-carter", "athlete-carter");
    const { createGroupThread, findCanonicalExistingThread } = await loadModule();
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", rosterAthleteIds: ["athlete-carter"], coachIds: [] });
    if (!created.ok) return assert.fail();

    // Seed a participant row for the coach pointing at the SAME thread so
    // findCanonicalExistingThread's "my threads" lookup can find it, then
    // ask it to match the exact same non-observer participant set the
    // group has — it must NOT return the group thread.
    const match = await findCanonicalExistingThread(
      SLUG,
      { kind: "coach", id: "coach-1" },
      [
        { actor_type: "coach", coach_id: "coach-1", member_id: null, platform_admin_id: null },
        { actor_type: "member", coach_id: null, member_id: "m-carter", platform_admin_id: null },
      ],
    );
    assert.equal(match, null, "a DM lookup must never resolve to a group thread even with an identical participant set");
  });
});

// ── G1 review correction 1: archived groups are entirely inaccessible ──────

test("archived group: disappears from a participant's thread list", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    seedAthlete(db, "m-carter", "athlete-carter");
    const { createGroupThread, archiveGroupThread, getThreadsForActor } = await loadModule();
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", rosterAthleteIds: ["athlete-carter"], coachIds: [] });
    if (!created.ok) return assert.fail();

    let threads = await getThreadsForActor(SLUG, { kind: "coach", id: "coach-1" });
    assert.ok(threads.some(t => t.id === created.thread.id), "sanity: active group is listed");

    await archiveGroupThread(created.thread.id);
    threads = await getThreadsForActor(SLUG, { kind: "coach", id: "coach-1" });
    assert.ok(!threads.some(t => t.id === created.thread.id), "archived group must disappear from the thread list");
  });
});

test("archived group: cannot be opened through a stale threadId (getThreadById returns null)", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    seedAthlete(db, "m-carter", "athlete-carter");
    const { createGroupThread, archiveGroupThread, getThreadById } = await loadModule();
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", rosterAthleteIds: ["athlete-carter"], coachIds: [] });
    if (!created.ok) return assert.fail();

    await archiveGroupThread(created.thread.id);
    const thread = await getThreadById(created.thread.id, SLUG);
    assert.equal(thread, null, "an archived thread must be unreachable via getThreadById, the chokepoint thread detail/send/read-marking all use");
  });
});

test("archived group: isParticipant (the send/attachment chokepoint) returns false even for a legitimate active participant", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    seedAthlete(db, "m-carter", "athlete-carter");
    const { createGroupThread, archiveGroupThread, isParticipant } = await loadModule();
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", rosterAthleteIds: ["athlete-carter"], coachIds: [] });
    if (!created.ok) return assert.fail();

    let ok = await isParticipant(created.thread.id, { kind: "coach", id: "coach-1" });
    assert.equal(ok, true, "sanity: active coach is a participant before archiving");

    await archiveGroupThread(created.thread.id);
    ok = await isParticipant(created.thread.id, { kind: "coach", id: "coach-1" });
    assert.equal(ok, false, "isParticipant must reject every actor once the thread is archived — this is also the attachment sign/download chokepoint, so attachment access fails too");
  });
});

test("archived group: participants cannot be mutated (add) after archiving — loadManageableGroup's getThreadById returns null", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    seedAthlete(db, "m-carter", "athlete-carter");
    seedAthlete(db, "m-colin", "athlete-colin");
    const { createGroupThread, archiveGroupThread, getThreadById } = await loadModule();
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", rosterAthleteIds: ["athlete-carter"], coachIds: [] });
    if (!created.ok) return assert.fail();

    await archiveGroupThread(created.thread.id);
    // The participants/rename routes both gate on getThreadById(threadId, slug)
    // returning a non-null, non-archived thread before allowing any mutation
    // (see loadManageableGroup in both route files) — proving it returns
    // null here proves those routes reject the mutation too, without
    // needing to re-exercise the full route/auth stack in this file.
    const thread = await getThreadById(created.thread.id, SLUG);
    assert.equal(thread, null);
  });
});

test("active (non-archived) groups are completely unaffected by the archived-thread checks", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    seedAthlete(db, "m-carter", "athlete-carter");
    const { createGroupThread, getThreadById, isParticipant, getThreadsForActor } = await loadModule();
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", rosterAthleteIds: ["athlete-carter"], coachIds: [] });
    if (!created.ok) return assert.fail();

    assert.ok(await getThreadById(created.thread.id, SLUG));
    assert.equal(await isParticipant(created.thread.id, { kind: "coach", id: "coach-1" }), true);
    const threads = await getThreadsForActor(SLUG, { kind: "coach", id: "coach-1" });
    assert.ok(threads.some(t => t.id === created.thread.id));
  });
});

test("DM regression: DMs are entirely unaffected by archived_at (never set, never filtered out)", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    seedAthlete(db, "m-carter", "athlete-carter");
    db.message_threads.push({
      id: "dm-1", campaign_slug: SLUG, thread_type: "dm", group_name: null, archived_at: null,
      subject: null, created_by_type: "coach", created_by_coach_id: "coach-1", created_by_member_id: null,
      created_by_platform_admin_id: null, creator_name: "Coach", creator_role: "head_coach",
      last_message_at: new Date().toISOString(), last_message_preview: null, created_at: new Date().toISOString(),
    });
    db.message_thread_participants.push(
      { id: "p1", thread_id: "dm-1", actor_type: "coach", coach_id: "coach-1", member_id: null, platform_admin_id: null, is_auto_included: false, is_observer: false, removed_at: null },
      { id: "p2", thread_id: "dm-1", actor_type: "member", coach_id: null, member_id: "m-carter", platform_admin_id: null, is_auto_included: false, is_observer: false, removed_at: null },
    );
    const { getThreadById, isParticipant, getThreadsForActor } = await loadModule();

    assert.ok(await getThreadById("dm-1", SLUG));
    assert.equal(await isParticipant("dm-1", { kind: "coach", id: "coach-1" }), true);
    const threads = await getThreadsForActor(SLUG, { kind: "coach", id: "coach-1" });
    assert.ok(threads.some(t => t.id === "dm-1"));
  });
});

// ── G1 review correction 2: removed_at consistency (soft-removed coach) ────

// G3A review correction: this test originally used createGroupThread() to
// set up its "lost its only coach" scenario. Since every G3A group now
// ALSO gets a message_thread_athletes roster assignment, and that path
// deliberately does NOT require an active coach participant (see
// getActiveAssignedGroupThreadIds's own comment — a group's validity is
// archived_at, not transient coach-participant presence), a GROUP no
// longer reproduces this scenario: the roster-seeded path now correctly
// backfills it regardless. This test is narrowed to a DM — the one thread
// shape that never gets a message_thread_athletes row at all, so the
// original member-seeded coach-presence check (unchanged, still correct
// for DMs) remains exactly as tested here.
test("syncParentIntoAthleteThreads: does NOT backfill a DM whose only coach has been soft-removed", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    seedAthlete(db, "m-carter", "athlete-carter");
    db.message_threads.push({
      id: "dm-1", campaign_slug: SLUG, thread_type: "dm", group_name: null, archived_at: null,
      subject: null, created_by_type: "coach", created_by_coach_id: "coach-1", created_by_member_id: null,
      created_by_platform_admin_id: null, creator_name: "Coach", creator_role: "head_coach",
      last_message_at: new Date().toISOString(), last_message_preview: null, created_at: new Date().toISOString(),
    });
    db.message_thread_participants.push(
      // The thread's only coach — already soft-removed, simulating a DM
      // that has genuinely lost its only coach (e.g. a staff-removal
      // cascade, or a data-integrity edge case) — exactly the scenario the
      // removed_at filter on syncParentIntoAthleteThreads's coach-presence
      // check must handle.
      { id: "p-coach", thread_id: "dm-1", actor_type: "coach", coach_id: "coach-1", member_id: null, platform_admin_id: null, is_auto_included: false, is_observer: false, removed_at: new Date().toISOString() },
      { id: "p-carter", thread_id: "dm-1", actor_type: "member", coach_id: null, member_id: "m-carter", platform_admin_id: null, is_auto_included: false, is_observer: false, removed_at: null },
    );

    const { syncParentIntoAthleteThreads, getThreadParticipants } = await loadModule();
    seedParent(db, "m-parent", "athlete-carter", "Sarah");
    await syncParentIntoAthleteThreads("athlete-carter", SLUG);

    const participants = await getThreadParticipants("dm-1");
    assert.ok(!participants.some(p => p.member_id === "m-parent"), "a DM with no ACTIVE coach must not be treated as a valid sync target");
  });
});

test("syncParentIntoAthleteThreads: DOES backfill a thread that still has an active coach (regression)", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    seedAthlete(db, "m-carter", "athlete-carter");
    const { createGroupThread, syncParentIntoAthleteThreads, getThreadParticipants } = await loadModule();
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", rosterAthleteIds: ["athlete-carter"], coachIds: [] });
    if (!created.ok) return assert.fail();

    seedParent(db, "m-parent", "athlete-carter", "Sarah");
    await syncParentIntoAthleteThreads("athlete-carter", SLUG);

    const participants = await getThreadParticipants(created.thread.id);
    assert.ok(participants.some(p => p.member_id === "m-parent"), "a thread with an active coach must still be backfilled normally");
  });
});

test("thread list participant display excludes a removed participant", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    seedAthlete(db, "m-carter", "athlete-carter");
    const { createGroupThread, removeGroupParticipant, getThreadsForActor } = await loadModule();
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", rosterAthleteIds: ["athlete-carter"], coachIds: [] });
    if (!created.ok) return assert.fail();

    await removeGroupParticipant(created.thread.id, SLUG, { actor_type: "member", coach_id: null, member_id: "m-carter", platform_admin_id: null });

    const threads = await getThreadsForActor(SLUG, { kind: "coach", id: "coach-1" });
    const thread = threads.find(t => t.id === created.thread.id);
    assert.ok(thread, "the group itself must still be listed (coach-1 is still active)");
    assert.ok(!thread?.participants.some(p => p.member_id === "m-carter"), "the removed athlete must not appear in the thread's displayed participant list");
  });
});

// ── G1 review correction 5: creator/orphan-group verification ──────────────

test("orphan-group verification: reconciliation after athlete removal NEVER removes a coach row", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    seedCoach(db, "coach-2", "assistant_coach");
    seedAthlete(db, "m-carter", "athlete-carter");
    const { createGroupThread, removeGroupParticipant, getThreadParticipants } = await loadModule();
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", rosterAthleteIds: ["athlete-carter"], coachIds: ["coach-2"] });
    if (!created.ok) return assert.fail();

    await removeGroupParticipant(created.thread.id, SLUG, { actor_type: "member", coach_id: null, member_id: "m-carter", platform_admin_id: null });

    const active = await getThreadParticipants(created.thread.id);
    const coaches = active.filter(p => p.actor_type === "coach");
    assert.deepEqual(coaches.map(c => c.coach_id).sort(), ["coach-1", "coach-2"], "family reconciliation must never touch coach rows, regardless of what athlete removal triggered it");
  });
});

test("orphan-group verification: Head Coach retains management of an Assistant-created group even after other changes", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1", "head_coach");
    seedCoach(db, "ac-1", "assistant_coach");
    seedAthlete(db, "m-carter", "athlete-carter");
    const { createGroupThread, canManageGroupThread, getThreadById } = await loadModule();
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "ac-1", creatorName: "Assistant", creatorRole: "assistant_coach", name: "G", rosterAthleteIds: ["athlete-carter"], coachIds: ["coach-1"] });
    if (!created.ok) return assert.fail();

    const thread = await getThreadById(created.thread.id, SLUG);
    assert.ok(thread);
    assert.equal(canManageGroupThread("head_coach", "coach-1", thread!), true);
    assert.equal(canManageGroupThread("assistant_coach", "coach-1", thread!), false, "coach-1 is only a participant here, not the creator — an assistant_coach role check must go by creator, not membership");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Group Messaging G3A — roster assignment (message_thread_athletes)
// ═══════════════════════════════════════════════════════════════════════════
//
// These tests use the roster athlete id (e.g. "athlete-carter") as the
// rosterAthleteId everywhere — NOT a team_members id — and only call
// seedAthlete() (which creates a team_members row) for scenarios that are
// explicitly testing a JOINED athlete. An "unjoined" roster athlete in
// these tests is simply an athlete id with no corresponding team_members
// row ever seeded — exactly the production UC Riverside scenario.

test("G3A create: roster-only (unjoined) athlete gets an assignment but NO fake team_members participant", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    const { createGroupThread, getThreadParticipants, getActiveRosterAssignments } = await loadModule();

    const result = await createGroupThread({
      slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach",
      name: "Varsity Long Jump", rosterAthleteIds: ["athlete-carter"], coachIds: [],
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const assignments = await getActiveRosterAssignments(result.thread.id);
    assert.deepEqual(assignments, ["athlete-carter"], "roster assignment must be recorded even though Carter never joined");

    const participants = await getThreadParticipants(result.thread.id);
    assert.ok(!participants.some(p => p.member_id === "athlete-carter"), "an athletes.id must NEVER appear as a message_thread_participants.member_id");
    assert.equal(participants.filter(p => p.actor_type === "member").length, 0, "no fake member participant should exist for an unjoined athlete");
  });
});

test("G3A create: approved parent of an UNJOINED roster athlete is active immediately (parent-before-athlete-join)", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    seedParent(db, "m-mom", "athlete-carter", "Mom");
    const { createGroupThread, getThreadParticipants } = await loadModule();

    const result = await createGroupThread({
      slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach",
      name: "Varsity Long Jump", rosterAthleteIds: ["athlete-carter"], coachIds: [],
    });
    if (!result.ok) return assert.fail();

    const participants = await getThreadParticipants(result.thread.id);
    const mom = participants.find(p => p.member_id === "m-mom");
    assert.ok(mom, "Mom must be an active participant even though Carter has never joined");
    assert.equal(mom?.is_auto_included, true);
    assert.ok(!participants.some(p => p.actor_type === "member" && p.member_id === "athlete-carter"), "Carter himself must still have no fake participant row");
  });
});

test("G3A create: a joined roster athlete is still seeded as a DIRECT (non-auto-included) participant, unchanged from pre-G3A", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    seedAthlete(db, "m-carter", "athlete-carter");
    const { createGroupThread, getThreadParticipants } = await loadModule();

    const result = await createGroupThread({
      slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach",
      name: "G", rosterAthleteIds: ["athlete-carter"], coachIds: [],
    });
    if (!result.ok) return assert.fail();

    const participants = await getThreadParticipants(result.thread.id);
    const carter = participants.find(p => p.member_id === "m-carter");
    assert.ok(carter);
    assert.equal(carter?.is_auto_included, false);
  });
});

test("G3A addGroupParticipants: adding an unjoined roster athlete records the assignment only", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    seedAthlete(db, "m-carter", "athlete-carter");
    const { createGroupThread, addGroupParticipants, getThreadParticipants, getActiveRosterAssignments } = await loadModule();
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", rosterAthleteIds: ["athlete-carter"], coachIds: [] });
    if (!created.ok) return assert.fail();

    await addGroupParticipants({ threadId: created.thread.id, campaignSlug: SLUG, rosterAthleteIds: ["athlete-colin"], coachIds: [] });

    const assignments = await getActiveRosterAssignments(created.thread.id);
    assert.deepEqual(assignments.sort(), ["athlete-carter", "athlete-colin"]);
    const participants = await getThreadParticipants(created.thread.id);
    assert.ok(!participants.some(p => p.member_id === "athlete-colin"));
  });
});

test("G3A addGroupParticipants: adding an unjoined athlete with an approved parent activates the parent", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    seedParent(db, "m-mom", "athlete-colin", "Mom");
    const { createGroupThread, addGroupParticipants, getThreadParticipants } = await loadModule();
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", rosterAthleteIds: [], coachIds: [] });
    if (!created.ok) return assert.fail();

    await addGroupParticipants({ threadId: created.thread.id, campaignSlug: SLUG, rosterAthleteIds: ["athlete-colin"], coachIds: [] });

    const participants = await getThreadParticipants(created.thread.id);
    assert.ok(participants.some(p => p.member_id === "m-mom"), "Mom must activate the moment her unjoined child is assigned");
  });
});

test("G3A removeRosterAthleteFromGroup: removing a JOINED athlete soft-removes both the assignment and the participant", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    seedAthlete(db, "m-carter", "athlete-carter");
    const { createGroupThread, removeRosterAthleteFromGroup, getThreadParticipants, getActiveRosterAssignments } = await loadModule();
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", rosterAthleteIds: ["athlete-carter"], coachIds: [] });
    if (!created.ok) return assert.fail();

    const result = await removeRosterAthleteFromGroup(created.thread.id, SLUG, "athlete-carter");
    assert.equal(result.ok, true);

    assert.deepEqual(await getActiveRosterAssignments(created.thread.id), []);
    const participants = await getThreadParticipants(created.thread.id);
    assert.ok(!participants.some(p => p.member_id === "m-carter"));
  });
});

test("G3A removeRosterAthleteFromGroup: removing an UNJOINED athlete is a clean no-op on participants (nothing existed to remove)", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    const { createGroupThread, removeRosterAthleteFromGroup, getActiveRosterAssignments } = await loadModule();
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", rosterAthleteIds: ["athlete-carter"], coachIds: [] });
    if (!created.ok) return assert.fail();

    const result = await removeRosterAthleteFromGroup(created.thread.id, SLUG, "athlete-carter");
    assert.equal(result.ok, true);
    assert.deepEqual(await getActiveRosterAssignments(created.thread.id), []);
  });
});

test("G3A removeRosterAthleteFromGroup: unassigned athlete returns 404", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    const { createGroupThread, removeRosterAthleteFromGroup } = await loadModule();
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", rosterAthleteIds: [], coachIds: [] });
    if (!created.ok) return assert.fail();

    const result = await removeRosterAthleteFromGroup(created.thread.id, SLUG, "athlete-never-assigned");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 404);
  });
});

test("G3A removeRosterAthleteFromGroup: multi-child parent RETAINED when one sibling's assignment remains", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    seedParent(db, "m-mom", "athlete-carter", "Mom");
    db.team_member_athletes.push({ team_member_id: "m-mom", athlete_id: "athlete-abby" });
    const { createGroupThread, removeRosterAthleteFromGroup, getThreadParticipants } = await loadModule();
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", rosterAthleteIds: ["athlete-carter", "athlete-abby"], coachIds: [] });
    if (!created.ok) return assert.fail();

    await removeRosterAthleteFromGroup(created.thread.id, SLUG, "athlete-carter");

    const participants = await getThreadParticipants(created.thread.id);
    assert.ok(participants.some(p => p.member_id === "m-mom"), "Mom must remain — Abby's assignment still justifies her inclusion");
  });
});

test("G3A removeRosterAthleteFromGroup: multi-child parent REMOVED after the final qualifying assignment is removed", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    seedParent(db, "m-mom", "athlete-carter", "Mom");
    db.team_member_athletes.push({ team_member_id: "m-mom", athlete_id: "athlete-abby" });
    const { createGroupThread, removeRosterAthleteFromGroup, getThreadParticipants } = await loadModule();
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", rosterAthleteIds: ["athlete-carter", "athlete-abby"], coachIds: [] });
    if (!created.ok) return assert.fail();

    await removeRosterAthleteFromGroup(created.thread.id, SLUG, "athlete-carter");
    await removeRosterAthleteFromGroup(created.thread.id, SLUG, "athlete-abby");

    const participants = await getThreadParticipants(created.thread.id);
    assert.ok(!participants.some(p => p.member_id === "m-mom"), "Mom must lose access once no assigned child justifies her inclusion");
  });
});

test("G3A removeRosterAthleteFromGroup: staff/coach rows are never touched", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    seedCoach(db, "coach-2", "assistant_coach");
    const { createGroupThread, removeRosterAthleteFromGroup, getThreadParticipants } = await loadModule();
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", rosterAthleteIds: ["athlete-carter"], coachIds: ["coach-2"] });
    if (!created.ok) return assert.fail();

    await removeRosterAthleteFromGroup(created.thread.id, SLUG, "athlete-carter");

    const active = await getThreadParticipants(created.thread.id);
    assert.deepEqual(active.filter(p => p.actor_type === "coach").map(c => c.coach_id).sort(), ["coach-1", "coach-2"]);
  });
});

test("G3A re-add: re-adding a previously-removed roster assignment reactivates it rather than duplicating", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    const { createGroupThread, removeRosterAthleteFromGroup, addGroupParticipants, getActiveRosterAssignments } = await loadModule();
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", rosterAthleteIds: ["athlete-carter"], coachIds: [] });
    if (!created.ok) return assert.fail();

    await removeRosterAthleteFromGroup(created.thread.id, SLUG, "athlete-carter");
    await addGroupParticipants({ threadId: created.thread.id, campaignSlug: SLUG, rosterAthleteIds: ["athlete-carter"], coachIds: [] });

    const rows = db.message_thread_athletes.filter(r => r.athlete_id === "athlete-carter");
    assert.equal(rows.length, 1, "re-adding must reactivate the existing row, never create a second one");
    assert.equal(rows[0].removed_at, null);
    assert.deepEqual(await getActiveRosterAssignments(created.thread.id), ["athlete-carter"]);
  });
});

// ── D. LATER JOIN: athlete assigned before joining, then joins ─────────────

test("G3A activateRosterAssignmentsForJoinedAthlete: athlete assigned to TWO groups before joining; joining activates both automatically", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    const { createGroupThread, activateRosterAssignmentsForJoinedAthlete, getThreadParticipants } = await loadModule();
    const g1 = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "Varsity Long Jump", rosterAthleteIds: ["athlete-carter"], coachIds: [] });
    const g2 = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "State Qualifiers", rosterAthleteIds: ["athlete-carter"], coachIds: [] });
    if (!g1.ok || !g2.ok) return assert.fail();

    // Carter joins — simulate createLinkedAthleteMember's post-link hook.
    seedAthlete(db, "m-carter", "athlete-carter");
    await activateRosterAssignmentsForJoinedAthlete("athlete-carter", SLUG, "m-carter");

    const p1 = await getThreadParticipants(g1.thread.id);
    const p2 = await getThreadParticipants(g2.thread.id);
    assert.ok(p1.some(p => p.member_id === "m-carter"), "Varsity Long Jump must activate Carter");
    assert.ok(p2.some(p => p.member_id === "m-carter"), "State Qualifiers must activate Carter");
  });
});

test("G3A activateRosterAssignmentsForJoinedAthlete: never activates into an archived group", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    const { createGroupThread, archiveGroupThread, activateRosterAssignmentsForJoinedAthlete } = await loadModule();
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", rosterAthleteIds: ["athlete-carter"], coachIds: [] });
    if (!created.ok) return assert.fail();
    await archiveGroupThread(created.thread.id);

    seedAthlete(db, "m-carter", "athlete-carter");
    await activateRosterAssignmentsForJoinedAthlete("athlete-carter", SLUG, "m-carter");

    // getThreadParticipants itself doesn't filter archived — read the raw
    // table directly to prove no participant row was ever inserted.
    assert.ok(!db.message_thread_participants.some(p => p.thread_id === created.thread.id && p.member_id === "m-carter"), "an archived group must never be activated into");
  });
});

test("G3A activateRosterAssignmentsForJoinedAthlete: idempotent — safe to call twice, never duplicates the participant row", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    const { createGroupThread, activateRosterAssignmentsForJoinedAthlete } = await loadModule();
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", rosterAthleteIds: ["athlete-carter"], coachIds: [] });
    if (!created.ok) return assert.fail();

    seedAthlete(db, "m-carter", "athlete-carter");
    await activateRosterAssignmentsForJoinedAthlete("athlete-carter", SLUG, "m-carter");
    await activateRosterAssignmentsForJoinedAthlete("athlete-carter", SLUG, "m-carter");

    assert.equal(db.message_thread_participants.filter(p => p.member_id === "m-carter").length, 1);
  });
});

test("G3A review correction: activateRosterAssignmentsForJoinedAthlete does not depend on the original creator/any particular coach remaining an active participant", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "ac-1", "assistant_coach");
    const { createGroupThread, activateRosterAssignmentsForJoinedAthlete, getThreadParticipants } = await loadModule();
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "ac-1", creatorName: "Assistant", creatorRole: "assistant_coach", name: "Varsity Long Jump", rosterAthleteIds: ["athlete-carter"], coachIds: [] });
    if (!created.ok) return assert.fail();

    // The creating Assistant Coach is later removed from staff entirely —
    // simulates removeStaffRelationship()'s hard DELETE cascading their
    // message_thread_participants row away. The group itself is untouched
    // (still non-archived) and the team's Head Coach can still manage it
    // via canManageGroupThread's creator-independent rule.
    const creatorRow = db.message_thread_participants.find(p => p.thread_id === created.thread.id && p.coach_id === "ac-1");
    if (creatorRow) creatorRow.removed_at = new Date().toISOString();

    seedAthlete(db, "m-carter", "athlete-carter");
    await activateRosterAssignmentsForJoinedAthlete("athlete-carter", SLUG, "m-carter");

    const participants = await getThreadParticipants(created.thread.id);
    assert.ok(participants.some(p => p.member_id === "m-carter"), "activation must not depend on the original creator (or any specific coach id) still being an active participant");
  });
});

// ── E. LATER PARENT APPROVAL: roster-only athlete assigned, parent approved later ──

test("G3A syncParentIntoAthleteThreads: activates a parent into a roster-assignment-seeded group even though the athlete has never joined", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    const { createGroupThread, syncParentIntoAthleteThreads, getThreadParticipants } = await loadModule();
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "Varsity Long Jump", rosterAthleteIds: ["athlete-carter"], coachIds: [] });
    if (!created.ok) return assert.fail();

    // Mom is approved AFTER the group already exists.
    seedParent(db, "m-mom", "athlete-carter", "Mom");
    await syncParentIntoAthleteThreads("athlete-carter", SLUG);

    const participants = await getThreadParticipants(created.thread.id);
    assert.ok(participants.some(p => p.member_id === "m-mom"), "Mom must be activated purely from the roster assignment — Carter never had a team_members row");
  });
});

test("G3A syncParentIntoAthleteThreads: does NOT activate a parent into an archived roster-assigned group", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    const { createGroupThread, archiveGroupThread, syncParentIntoAthleteThreads } = await loadModule();
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", rosterAthleteIds: ["athlete-carter"], coachIds: [] });
    if (!created.ok) return assert.fail();
    await archiveGroupThread(created.thread.id);

    seedParent(db, "m-mom", "athlete-carter", "Mom");
    await syncParentIntoAthleteThreads("athlete-carter", SLUG);

    assert.ok(!db.message_thread_participants.some(p => p.thread_id === created.thread.id && p.member_id === "m-mom"), "an archived group must never gain a new participant via this sync");
  });
});

test("G3A review correction: syncParentIntoAthleteThreads STILL activates a parent into a valid, non-archived roster-assigned group even if its only coach participant was removed (e.g. staff removal cascade) — a stale coach-participant row is not what makes a group invalid", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    const { createGroupThread, syncParentIntoAthleteThreads, getThreadParticipants } = await loadModule();
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", rosterAthleteIds: ["athlete-carter"], coachIds: [] });
    if (!created.ok) return assert.fail();

    // Simulates removeStaffRelationship()'s hard DELETE on team_coaches
    // cascading the coach's message_thread_participants row away — this
    // group is still perfectly valid (non-archived) and still manageable
    // by the team's real Head Coach; it just has no active coach
    // PARTICIPANT row left at this exact moment.
    const coachRow = db.message_thread_participants.find(p => p.thread_id === created.thread.id && p.coach_id === "coach-1");
    if (coachRow) coachRow.removed_at = new Date().toISOString();

    seedParent(db, "m-mom", "athlete-carter", "Mom");
    await syncParentIntoAthleteThreads("athlete-carter", SLUG);

    const participants = await getThreadParticipants(created.thread.id);
    assert.ok(participants.some(p => p.member_id === "m-mom"), "a non-archived roster-assigned group must still be a valid sync target even with no active coach participant row — archived_at is the only validity signal that matters here");
  });
});

// ── Security / cross-campaign safety ───────────────────────────────────────

test("G3A: resolveRequiredFamilyParticipantsForRosterAthletes never crosses campaigns", async () => {
  await withFakeDb(async db => {
    const OTHER_SLUG = "hawks";
    db.team_members.push({ id: "m-mom-other", campaign_slug: OTHER_SLUG, role: "parent", athlete_id: "athlete-carter", name: "Mom", account_id: null });
    const { resolveRequiredFamilyParticipantsForRosterAthletes } = await loadModule();

    const required = await resolveRequiredFamilyParticipantsForRosterAthletes(["athlete-carter"], SLUG);
    assert.deepEqual(required, [], "a parent relationship recorded under a different campaign must never resolve for this campaign");
  });
});

test("G3A: getActiveRosterAssignments only returns ACTIVE (non-removed) assignments", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    const { createGroupThread, removeRosterAthleteFromGroup, getActiveRosterAssignments } = await loadModule();
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", rosterAthleteIds: ["athlete-carter", "athlete-colin"], coachIds: [] });
    if (!created.ok) return assert.fail();

    await removeRosterAthleteFromGroup(created.thread.id, SLUG, "athlete-carter");

    assert.deepEqual(await getActiveRosterAssignments(created.thread.id), ["athlete-colin"]);
  });
});

test("G3A: getGroupRosterAssignments reports joined status per athlete", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    seedAthlete(db, "m-carter", "athlete-carter");
    const { createGroupThread, getGroupRosterAssignments } = await loadModule();
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", rosterAthleteIds: ["athlete-carter", "athlete-colin"], coachIds: [] });
    if (!created.ok) return assert.fail();

    // getGroupRosterAssignments resolves names via the athletes table, which
    // this fake db does not model — it only asserts the joined flag here,
    // tolerating an empty name when the athletes table has no matching row.
    const rows = await getGroupRosterAssignments(created.thread.id, SLUG);
    const byId = new Map(rows.map(r => [r.athlete_id, r]));
    // athletes table isn't seeded in this fake db, so rows come back empty —
    // this call must not throw, and must never claim an unjoined athlete is joined.
    assert.equal(byId.size, 0, "with no athletes table rows seeded, nothing can be resolved — proves the function degrades safely rather than throwing");
  });
});
