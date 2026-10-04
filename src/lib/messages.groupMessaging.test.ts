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
    team_members:             [],
    team_member_athletes:     [],
    team_coaches:             [],
    message_threads:          [],
    message_thread_participants: [],
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
      name: "Varsity Jumps", memberIds: ["m-carter"], coachIds: ["coach-2"],
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
      name: "Varsity Jumps", memberIds: ["m-carter"], coachIds: [],
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
      name: "Varsity Jumps", memberIds: ["m-carter"], coachIds: [],
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
      name: "Varsity Jumps", memberIds: ["m-carter", "m-colin"], coachIds: [],
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

    const a = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "Varsity Jumps", memberIds: ["m-carter"], coachIds: [] });
    const b = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "State Meet Travel", memberIds: ["m-carter"], coachIds: [] });
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
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", memberIds: ["m-carter"], coachIds: [] });
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
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", memberIds: ["m-carter"], coachIds: [] });
    if (!created.ok) return assert.fail();

    await removeGroupParticipant(created.thread.id, SLUG, { actor_type: "member", coach_id: null, member_id: "m-carter", platform_admin_id: null });
    await addGroupParticipants({ threadId: created.thread.id, campaignSlug: SLUG, memberIds: ["m-carter"], coachIds: [] });

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
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", memberIds: ["m-carter"], coachIds: [] });
    if (!created.ok) return assert.fail();

    // Remove Carter -> reconciliation removes Sarah too (no other reason to stay).
    await removeGroupParticipant(created.thread.id, SLUG, { actor_type: "member", coach_id: null, member_id: "m-carter", platform_admin_id: null });
    let active = await getThreadParticipants(created.thread.id);
    assert.ok(!active.some(p => p.member_id === "m-parent"), "Sarah should have been reconciled away with Carter");

    // Re-add Carter -> Sarah should come back too, reactivated not duplicated.
    await addGroupParticipants({ threadId: created.thread.id, campaignSlug: SLUG, memberIds: ["m-carter"], coachIds: [] });
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
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", memberIds: ["m-carter", "m-colin"], coachIds: [] });
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
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", memberIds: ["m-carter"], coachIds: ["coach-2"] });
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
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", memberIds: ["m-carter"], coachIds: [] });
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
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", memberIds: ["m-carter"], coachIds: [] });
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
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", memberIds: ["m-carter"], coachIds: [] });
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
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", memberIds: ["m-carter"], coachIds: [] });
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
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", memberIds: ["m-carter"], coachIds: [] });
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
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", memberIds: ["m-carter"], coachIds: [] });
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
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", memberIds: ["m-carter"], coachIds: [] });
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
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", memberIds: ["m-carter"], coachIds: [] });
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

test("syncParentIntoAthleteThreads: does NOT backfill a thread whose only coach has been soft-removed", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    seedAthlete(db, "m-carter", "athlete-carter");
    const { createGroupThread, syncParentIntoAthleteThreads, getThreadParticipants } = await loadModule();
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", memberIds: ["m-carter"], coachIds: [] });
    if (!created.ok) return assert.fail();

    // Soft-remove the only coach directly at the data layer (bypassing the
    // "last coach" guard, which is a route/service-level business rule, not
    // a data-integrity invariant) to simulate a thread that has genuinely
    // lost its only coach — exactly the scenario the removed_at filter on
    // syncParentIntoAthleteThreads's coach-presence check must handle.
    const coachRow = db.message_thread_participants.find(p => p.thread_id === created.thread.id && p.coach_id === "coach-1");
    if (coachRow) coachRow.removed_at = new Date().toISOString();

    // Now link a brand-new parent to Carter and ask the sync to backfill.
    seedParent(db, "m-parent", "athlete-carter", "Sarah");
    await syncParentIntoAthleteThreads("athlete-carter", SLUG);

    const participants = await getThreadParticipants(created.thread.id);
    assert.ok(!participants.some(p => p.member_id === "m-parent"), "a thread with no ACTIVE coach must not be treated as a valid sync target");
  });
});

test("syncParentIntoAthleteThreads: DOES backfill a thread that still has an active coach (regression)", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    seedAthlete(db, "m-carter", "athlete-carter");
    const { createGroupThread, syncParentIntoAthleteThreads, getThreadParticipants } = await loadModule();
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", memberIds: ["m-carter"], coachIds: [] });
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
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", memberIds: ["m-carter"], coachIds: [] });
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
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "coach-1", creatorName: "Coach", creatorRole: "head_coach", name: "G", memberIds: ["m-carter"], coachIds: ["coach-2"] });
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
    const created = await createGroupThread({ slug: SLUG, creatorCoachId: "ac-1", creatorName: "Assistant", creatorRole: "assistant_coach", name: "G", memberIds: ["m-carter"], coachIds: ["coach-1"] });
    if (!created.ok) return assert.fail();

    const thread = await getThreadById(created.thread.id, SLUG);
    assert.ok(thread);
    assert.equal(canManageGroupThread("head_coach", "coach-1", thread!), true);
    assert.equal(canManageGroupThread("assistant_coach", "coach-1", thread!), false, "coach-1 is only a participant here, not the creator — an assistant_coach role check must go by creator, not membership");
  });
});
