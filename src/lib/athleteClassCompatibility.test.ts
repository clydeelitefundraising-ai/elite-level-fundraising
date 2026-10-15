// Write-path compatibility for the expanded grade levels: the services that
// store athletes.class_year / pending_athlete_requests.class_year accept the
// new labels (and existing nonstandard values) verbatim — no allowlist, no
// remapping. Uses an in-memory fake of the PostgREST layer (mocking
// globalThis.fetch), same approach as bulkImportAthletes.test.ts.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

// athleteRequests.ts uses extensionless relative imports ("./_client"),
// which plain Node ESM can't resolve — reuse the existing test resolver.
register(new URL("../app/api/admin/athletes/import/testSupport/nextStubLoader.mjs", import.meta.url).href, import.meta.url);

type Row = Record<string, unknown>;
type Call = { method: string; table: string; query: string; body: Row | null };

async function withFakeDb<T>(run: (db: { tables: Record<string, Row[]>; calls: Call[] }) => Promise<T>): Promise<T> {
  const tables: Record<string, Row[]> = {};
  const calls: Call[] = [];
  let nextId = 1;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const path = url.replace(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, "");
    const [table, query = ""] = path.split("?");
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Row : null;
    calls.push({ method, table, query, body });
    tables[table] = tables[table] ?? [];
    if (method === "GET") return new Response(JSON.stringify(tables[table]), { status: 200 });
    if (method === "POST") {
      const row: Row = { id: `row-${nextId++}`, created_at: new Date().toISOString(), ...body };
      tables[table].push(row);
      return new Response(JSON.stringify([row]), { status: 201 });
    }
    if (method === "PATCH") return new Response(null, { status: 204 });
    return new Response("not implemented", { status: 500 });
  }) as typeof fetch;
  try {
    return await run({ tables, calls });
  } finally {
    globalThis.fetch = realFetch;
  }
}

const NEW_GRADES = ["6th Grade", "7th Grade", "8th Grade", "Other"];

test("createAthlete: each new grade is stored exactly as given", async () => {
  const { createAthlete } = await import("./platform/athletes.ts");
  await withFakeDb(async ({ tables }) => {
    for (const [i, grade] of NEW_GRADES.entries()) {
      const result = await createAthlete({ campaignSlug: "wolves", name: `Athlete ${i}`, classYear: grade });
      assert.equal(result.ok, true, grade);
    }
    assert.deepEqual(tables.athletes.map(r => r.class_year), NEW_GRADES);
  });
});

test("createAthlete: existing high-school and nonstandard values are still accepted unchanged", async () => {
  const { createAthlete } = await import("./platform/athletes.ts");
  await withFakeDb(async ({ tables }) => {
    for (const [i, grade] of ["Freshman", "Senior", "RS Sophomore"].entries()) {
      const result = await createAthlete({ campaignSlug: "wolves", name: `Legacy ${i}`, classYear: grade });
      assert.equal(result.ok, true, grade);
    }
    assert.deepEqual(tables.athletes.map(r => r.class_year), ["Freshman", "Senior", "RS Sophomore"]);
  });
});

test("createAthlete: a blank class is still rejected (required-field contract unchanged)", async () => {
  const { createAthlete } = await import("./platform/athletes.ts");
  await withFakeDb(async ({ calls }) => {
    const result = await createAthlete({ campaignSlug: "wolves", name: "No Class", classYear: "  " });
    assert.equal(result.ok, false);
    assert.equal(calls.filter(c => c.method === "POST").length, 0);
  });
});

test("updateAthlete: editing to a new grade PATCHes class_year verbatim", async () => {
  const { updateAthlete } = await import("./supabase.ts");
  await withFakeDb(async ({ calls }) => {
    await updateAthlete("ath-1", { name: "Mason Brooks", event: null, class_year: "8th Grade" });
    const patch = calls.find(c => c.method === "PATCH");
    assert.ok(patch);
    assert.equal(patch.table, "athletes");
    assert.equal(patch.body?.class_year, "8th Grade");
  });
});

test("createPendingRequest: a self-registration request with a new grade stores it exactly", async () => {
  const { createPendingRequest } = await import("./platform/athleteRequests.ts");
  await withFakeDb(async ({ tables }) => {
    const result = await createPendingRequest({ campaignSlug: "wolves", accountId: "acct-1", fullName: "Ava Diaz", classYear: "7th Grade" });
    assert.equal(result.ok, true);
    assert.equal(tables.pending_athlete_requests[0].class_year, "7th Grade");
  });
});

test("createPendingRequest: blank class still rejected", async () => {
  const { createPendingRequest } = await import("./platform/athleteRequests.ts");
  await withFakeDb(async () => {
    const result = await createPendingRequest({ campaignSlug: "wolves", accountId: "acct-1", fullName: "Ava Diaz", classYear: "" });
    assert.deepEqual(result, { ok: false, reason: "validation", message: "Class/year is required." });
  });
});
