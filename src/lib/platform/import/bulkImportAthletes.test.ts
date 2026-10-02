// Integration-shaped tests for bulkImportAthletes(), using a small in-memory
// fake of the Supabase PostgREST layer (mocking globalThis.fetch) — same
// approach as parentAccessRequests.test.ts. Deliberately self-contained, not
// shared test infra, scoped to exactly the query shapes createAthlete() (the
// function bulkImportAthletes delegates to, row by row) issues against the
// `athletes` table.
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

type Row = Record<string, unknown>;

function makeFakeDb() {
  const athletes: Row[] = [];
  let nextId = 1;

  async function fetchImpl(url: string, init?: RequestInit): Promise<Response> {
    const path = url.replace(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, "");
    const [table, query] = path.split("?");
    const method = init?.method ?? "GET";
    assert.equal(table, "athletes", "bulkImportAthletes must only touch the athletes table");

    if (method === "GET") {
      const slugMatch = (query ?? "").match(/campaign_slug=eq\.([^&]+)/);
      const slug = slugMatch ? decodeURIComponent(slugMatch[1]) : "";
      const rows = athletes.filter(a => a.campaign_slug === slug);
      return new Response(JSON.stringify(rows), { status: 200 });
    }

    if (method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const row: Row = { id: `ath-${nextId++}`, created_at: new Date().toISOString(), ...body };
      athletes.push(row);
      return new Response(JSON.stringify([row]), { status: 201 });
    }

    return new Response("not implemented", { status: 500 });
  }

  return { athletes, fetchImpl };
}

async function withFakeDb<T>(run: (athletes: Row[]) => Promise<T>): Promise<T> {
  const { athletes, fetchImpl } = makeFakeDb();
  const realFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl as typeof fetch;
  try {
    return await run(athletes);
  } finally {
    globalThis.fetch = realFetch;
  }
}

async function loadService() {
  return import("./bulkImportAthletes.ts");
}

test("bulkImportAthletes: a normal batch creates every row", async () => {
  await withFakeDb(async athletes => {
    const { bulkImportAthletes } = await loadService();
    const result = await bulkImportAthletes("wolves", [
      { rowNumber: 1, name: "Mason Brooks", class_year: "Freshman", event: "Sprints" },
      { rowNumber: 2, name: "Abby Cooper", class_year: "Junior", event: "Relay" },
    ]);
    assert.equal(result.created, 2);
    assert.equal(result.skipped, 0);
    assert.equal(result.failed, 0);
    assert.equal(athletes.length, 2);
  });
});

test("bulkImportAthletes: a mixed valid/invalid batch reports per-row failure without aborting the rest", async () => {
  await withFakeDb(async () => {
    const { bulkImportAthletes } = await loadService();
    const result = await bulkImportAthletes("wolves", [
      { rowNumber: 1, name: "Mason Brooks", class_year: "Freshman" },
      { rowNumber: 2, name: "", class_year: "Junior" }, // invalid — empty name
    ]);
    assert.equal(result.created, 1);
    assert.equal(result.failed, 1);
    const failedRow = result.results.find(r => r.rowNumber === 2);
    assert.equal(failedRow?.status, "failed");
  });
});

test("bulkImportAthletes: re-runs the exact duplicate check against CURRENT database state, not the client's stale snapshot", async () => {
  await withFakeDb(async athletes => {
    // Simulate another admin having already added this athlete after the
    // review step ran client-side.
    athletes.push({ id: "existing-1", campaign_slug: "wolves", name: "Mason Brooks", class_year: "Freshman" });
    const { bulkImportAthletes } = await loadService();
    const result = await bulkImportAthletes("wolves", [
      { rowNumber: 1, name: "Mason Brooks", class_year: "Freshman" },
    ]);
    assert.equal(result.created, 0);
    assert.equal(result.skipped, 1);
    assert.equal(athletes.length, 1, "must never create a second row for an existing athlete");
  });
});

test("bulkImportAthletes: never updates or overwrites the existing row on a collision — it stays exactly as it was", async () => {
  await withFakeDb(async athletes => {
    athletes.push({ id: "existing-1", campaign_slug: "wolves", name: "Mason Brooks", class_year: "Freshman", event: "Hurdles" });
    const { bulkImportAthletes } = await loadService();
    await bulkImportAthletes("wolves", [
      { rowNumber: 1, name: "mason brooks", class_year: "Senior", event: "Discus" }, // same person, different casing + different class/event
    ]);
    assert.equal(athletes.length, 1);
    assert.equal(athletes[0].class_year, "Freshman", "the existing record must not be overwritten by the colliding import row");
    assert.equal(athletes[0].event, "Hurdles");
  });
});

test("bulkImportAthletes: honors an explicit Import Anyway (overrideCollision) for a true duplicate", async () => {
  await withFakeDb(async athletes => {
    athletes.push({ id: "existing-1", campaign_slug: "wolves", name: "Mason Brooks", class_year: "Freshman" });
    const { bulkImportAthletes } = await loadService();
    const result = await bulkImportAthletes("wolves", [
      { rowNumber: 1, name: "Mason Brooks", class_year: "Freshman", overrideCollision: true },
    ]);
    assert.equal(result.created, 1);
    assert.equal(athletes.length, 2, "Import Anyway must create a second, independent athlete record");
  });
});

test("bulkImportAthletes: intra-batch duplicates are caught automatically — the second identical row is skipped, not double-created", async () => {
  await withFakeDb(async athletes => {
    const { bulkImportAthletes } = await loadService();
    const result = await bulkImportAthletes("wolves", [
      { rowNumber: 1, name: "Mason Brooks", class_year: "Freshman" },
      { rowNumber: 2, name: "Mason Brooks", class_year: "Freshman" },
    ]);
    assert.equal(result.created, 1);
    assert.equal(result.skipped, 1);
    assert.equal(athletes.length, 1);
  });
});

test("bulkImportAthletes: campaign scoping — a same-name athlete in a different campaign is not a collision", async () => {
  await withFakeDb(async athletes => {
    athletes.push({ id: "existing-1", campaign_slug: "falcons", name: "Mason Brooks", class_year: "Freshman" });
    const { bulkImportAthletes } = await loadService();
    const result = await bulkImportAthletes("wolves", [
      { rowNumber: 1, name: "Mason Brooks", class_year: "Freshman" },
    ]);
    assert.equal(result.created, 1);
    assert.equal(athletes.length, 2);
  });
});
