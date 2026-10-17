// Team Management Phase 2 — teamTasksStore error classification. The
// "missing table" path must be narrow: only schema-cache / undefined
// table+function errors count as "not set up yet"; everything else is a
// real error and must never be presented as "no tasks".
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

const { classifyWriteError, isMissingSchemaError, getTask, listTasks } = await import("./teamTasksStore.ts");

const body = (code: string, message = "") => JSON.stringify({ code, message });

test("missing schema: only PGRST205/PGRST202/42P01/42883", () => {
  for (const code of ["PGRST205", "PGRST202", "42P01", "42883"]) assert.ok(isMissingSchemaError(body(code)), code);
  for (const code of ["PGRST116", "42501", "23505", "XX000", "P0001", "22P02"]) assert.equal(isMissingSchemaError(body(code)), false, code);
  assert.equal(isMissingSchemaError("<html>Bad gateway</html>"), false);
  assert.equal(isMissingSchemaError(""), false);
});

test("write errors map to stable reasons", () => {
  assert.equal(classifyWriteError(body("PGRST202")), "unavailable");
  assert.equal(classifyWriteError(body("P0001", "team_task_not_found")), "not_found");
  assert.equal(classifyWriteError(body("P0001", "team_task_not_active")), "not_active");
  assert.equal(classifyWriteError(body("P0001", "team_task_version_conflict")), "conflict");
  assert.equal(classifyWriteError(body("P0001", "team_task_resource_file_not_on_team")), "invalid");
  assert.equal(classifyWriteError(body("P0001", "team_task_resource_team_mismatch")), "invalid");
  assert.equal(classifyWriteError(body("23514", "violates check constraint")), "invalid");
  assert.equal(classifyWriteError(body("42501", "permission denied")), "error");
  assert.equal(classifyWriteError("gateway timeout"), "error");
});

async function withFetch<T>(impl: typeof fetch, run: () => Promise<T>): Promise<T> {
  const real = globalThis.fetch;
  globalThis.fetch = impl;
  try { return await run(); } finally { globalThis.fetch = real; }
}

test("listTasks: missing table → unavailable; permission error → error (not masked); network throw → error", async () => {
  const opts = { status: "active" as const, audiences: ["both" as const] };
  await withFetch((async () => new Response(body("PGRST205"), { status: 404 })) as typeof fetch, async () => {
    assert.deepEqual(await listTasks("wolves", opts), { ok: false, reason: "unavailable" });
  });
  await withFetch((async () => new Response(body("42501", "permission denied"), { status: 401 })) as typeof fetch, async () => {
    assert.deepEqual(await listTasks("wolves", opts), { ok: false, reason: "error" });
  });
  await withFetch((async () => { throw new Error("offline"); }) as typeof fetch, async () => {
    assert.deepEqual(await listTasks("wolves", opts), { ok: false, reason: "error" });
  });
});

test("listTasks with no visible audiences never queries the database", async () => {
  let called = false;
  await withFetch((async () => { called = true; return new Response("[]"); }) as typeof fetch, async () => {
    assert.deepEqual(await listTasks("wolves", { status: "active", audiences: [] }), { ok: true, value: [] });
  });
  assert.equal(called, false);
});

test("getTask: malformed id (22P02) is not_found; query is scoped to the team", async () => {
  let url = "";
  await withFetch((async (u: string) => { url = u; return new Response(body("22P02"), { status: 400 }); }) as typeof fetch, async () => {
    assert.deepEqual(await getTask("wolves", "not-a-uuid"), { ok: false, reason: "not_found" });
  });
  assert.match(url, /campaign_slug=eq\.wolves/);
  assert.doesNotMatch(url, /created_by_account_id|created_by_coach_id/); // identity ids never selected
});
