// HTTP-layer tests for POST /api/admin/athletes/import/parse — closing the
// route-handler test gap identified in the Roster Import Phase 1 safety
// audit. The pure parsing/mapping/duplicate logic this route calls into is
// already covered by csvParse.test.ts, xlsxParse.test.ts, and
// rosterCandidates.test.ts; this file exercises the route's OWN code: the
// auth gate, file-type/size/row-count validation, and the "no writes" claim.
//
// A module resolution hook (testSupport/nextStubLoader.mjs) lets the real
// route.ts be imported directly under `node --test` — it only redirects
// "next/server"/"next/headers" to minimal Fetch-API-backed stubs and
// resolves the project's "@/*" alias; it changes nothing about the route
// file itself. Supabase REST calls are mocked via globalThis.fetch, same
// approach as bulkImportAthletes.test.ts/parentAccessRequests.test.ts.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.ADMIN_PASSWORD = "test-password";
process.env.ADMIN_PEPPER   = "test-pepper";

register(new URL("../testSupport/nextStubLoader.mjs", import.meta.url).href, import.meta.url);

const { __setTestCookie } = await import("../testSupport/nextHeadersStub.mjs");
const { getAdminToken } = await import("@/lib/adminAuth");

type Row = Record<string, unknown>;

function makeFakeDb() {
  const db: Record<string, Row[]> = {
    campaign_settings:    [{ campaign_slug: "wolves" }],
    athletes:             [],
    team_members:         [],
    fundraising_contacts: [],
  };
  const writeAttempts: { table: string; method: string }[] = [];

  async function fetchImpl(url: string, init?: RequestInit): Promise<Response> {
    const path = url.replace(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, "");
    const [table, query] = path.split("?");
    const method = init?.method ?? "GET";

    if (method !== "GET") writeAttempts.push({ table, method });

    if (method === "GET") {
      const slugMatch = (query ?? "").match(/campaign_slug=eq\.([^&]+)/);
      const slug = slugMatch ? decodeURIComponent(slugMatch[1]) : null;
      const rows = (db[table] ?? []).filter(r => !slug || r.campaign_slug === slug);
      return new Response(JSON.stringify(rows), { status: 200 });
    }

    // Any write would be a defect for this route — fail loudly rather than
    // silently succeeding, so a regression shows up as a thrown/rejected
    // fetch rather than a passing test that never checked.
    return new Response(JSON.stringify({ error: "unexpected write in parse route test" }), { status: 500 });
  }

  return { db, writeAttempts, fetchImpl };
}

async function withFakeDb<T>(run: (ctx: ReturnType<typeof makeFakeDb>) => Promise<T>): Promise<T> {
  const ctx = makeFakeDb();
  const realFetch = globalThis.fetch;
  globalThis.fetch = ctx.fetchImpl as typeof fetch;
  try {
    return await run(ctx);
  } finally {
    globalThis.fetch = realFetch;
  }
}

async function loadRoute() {
  return import("./route.ts");
}

function authenticate() {
  __setTestCookie("elf_admin", getAdminToken() as string);
}
function unauthenticate() {
  __setTestCookie("elf_admin", undefined);
}

function postFile(file: File, campaignSlug = "wolves"): Request {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("campaign_slug", campaignSlug);
  return new Request("http://test.local/api/admin/athletes/import/parse", { method: "POST", body: fd });
}

async function xlsxFile(build: (wb: ExcelJS.Workbook) => void, filename = "roster.xlsx"): Promise<File> {
  const wb = new ExcelJS.Workbook();
  build(wb);
  const buf = await wb.xlsx.writeBuffer();
  return new File([buf], filename, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

const VALID_CSV = "Name,Class,Event\nMason Brooks,Freshman,Sprints\nAbby Cooper,Junior,Relay";

test("POST /import/parse: unauthenticated request is rejected with 401", async () => {
  await withFakeDb(async ({ writeAttempts }) => {
    unauthenticate();
    const { POST } = await loadRoute();
    const file = new File([VALID_CSV], "roster.csv", { type: "text/csv" });
    const res = await POST(postFile(file) as never);
    assert.equal(res.status, 401);
    assert.equal(writeAttempts.length, 0);
  });
});

test("POST /import/parse: a valid CSV is accepted and parsed", async () => {
  await withFakeDb(async () => {
    authenticate();
    const { POST } = await loadRoute();
    const file = new File([VALID_CSV], "roster.csv", { type: "text/csv" });
    const res = await POST(postFile(file) as never);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.candidates.length, 2);
    assert.equal(body.candidates[0].name, "Mason Brooks");
  });
});

test("POST /import/parse: a valid XLSX is accepted and parsed", async () => {
  await withFakeDb(async () => {
    authenticate();
    const { POST } = await loadRoute();
    const file = await xlsxFile(wb => {
      const ws = wb.addWorksheet("Roster");
      ws.addRow(["Name", "Class", "Event"]);
      ws.addRow(["Mason Brooks", "Freshman", "Sprints"]);
    });
    const res = await POST(postFile(file) as never);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.worksheetName, "Roster");
    assert.equal(body.candidates.length, 1);
  });
});

test("POST /import/parse: a legacy .xls file is rejected", async () => {
  await withFakeDb(async () => {
    authenticate();
    const { POST } = await loadRoute();
    const file = new File([VALID_CSV], "roster.xls", { type: "application/vnd.ms-excel" });
    const res = await POST(postFile(file) as never);
    assert.equal(res.status, 415);
    const body = await res.json();
    assert.match(body.error, /\.xls/);
  });
});

test("POST /import/parse: a PDF is rejected", async () => {
  await withFakeDb(async () => {
    authenticate();
    const { POST } = await loadRoute();
    const file = new File(["%PDF-1.4 fake"], "roster.pdf", { type: "application/pdf" });
    const res = await POST(postFile(file) as never);
    assert.equal(res.status, 415);
  });
});

test("POST /import/parse: a DOCX is rejected", async () => {
  await withFakeDb(async () => {
    authenticate();
    const { POST } = await loadRoute();
    const file = new File(["fake docx bytes"], "roster.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const res = await POST(postFile(file) as never);
    assert.equal(res.status, 415);
  });
});

test("POST /import/parse: an extension/MIME mismatch is rejected (a .csv file claiming to be a PDF)", async () => {
  await withFakeDb(async () => {
    authenticate();
    const { POST } = await loadRoute();
    const file = new File([VALID_CSV], "roster.csv", { type: "application/pdf" });
    const res = await POST(postFile(file) as never);
    assert.equal(res.status, 415);
    const body = await res.json();
    assert.match(body.error, /doesn't match/);
  });
});

test("POST /import/parse: a file over 5MB is rejected before parsing", async () => {
  await withFakeDb(async () => {
    authenticate();
    const { POST } = await loadRoute();
    const big = "Name,Class\n" + "A".repeat(6 * 1024 * 1024);
    const file = new File([big], "roster.csv", { type: "text/csv" });
    const res = await POST(postFile(file) as never);
    assert.equal(res.status, 413);
  });
});

test("POST /import/parse: more than 1,000 data rows is rejected", async () => {
  await withFakeDb(async () => {
    authenticate();
    const { POST } = await loadRoute();
    const lines = ["Name,Class"];
    for (let i = 0; i < 1001; i++) lines.push(`Athlete ${i},Freshman`);
    const file = new File([lines.join("\n")], "roster.csv", { type: "text/csv" });
    const res = await POST(postFile(file) as never);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /1,?000-row/);
  });
});

test("POST /import/parse: a corrupted .xlsx file returns a controlled error, not a crash", async () => {
  await withFakeDb(async () => {
    authenticate();
    const { POST } = await loadRoute();
    const file = new File(["this is not a real zip/xlsx file"], "roster.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const res = await POST(postFile(file) as never);
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.ok(typeof body.error === "string" && body.error.length > 0);
  });
});

test("POST /import/parse: the unmodified header-only template is rejected as having no athlete rows", async () => {
  await withFakeDb(async () => {
    authenticate();
    const { POST } = await loadRoute();
    const file = new File(["Athlete Name,Class Year,Event\r\n"], "elf-roster-template.csv", { type: "text/csv" });
    const res = await POST(postFile(file) as never);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /no athlete rows/);
  });
});

test("POST /import/parse: a successful parse performs zero database writes", async () => {
  await withFakeDb(async ({ writeAttempts }) => {
    authenticate();
    const { POST } = await loadRoute();
    const file = new File([VALID_CSV], "roster.csv", { type: "text/csv" });
    const res = await POST(postFile(file) as never);
    assert.equal(res.status, 200);
    assert.deepEqual(writeAttempts, []);
  });
});

test("POST /import/parse: campaign scoping — existing-athlete lookups only ever query the supplied campaign", async () => {
  await withFakeDb(async ({ db }) => {
    db.athletes.push(
      { id: "a1", campaign_slug: "wolves", name: "Mason Brooks", class_year: "Freshman", event: null },
      { id: "a2", campaign_slug: "falcons", name: "Zoe Washington", class_year: "Senior", event: null },
    );
    authenticate();
    const { POST } = await loadRoute();
    const file = new File(["Name,Class\nZoe Washington,Senior"], "roster.csv", { type: "text/csv" });
    const res = await POST(postFile(file, "wolves") as never);
    const body = await res.json();
    // Zoe Washington exists in a different campaign (falcons) — must not be
    // flagged as a duplicate against the "wolves" import.
    assert.equal(body.candidates[0].status, "ready");
    assert.equal(body.candidates[0].existingMatch, null);
  });
});
