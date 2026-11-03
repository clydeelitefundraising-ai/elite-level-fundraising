// School-Account Linking Phase A — the Organization Center edits ONE
// explicit school. Route tests (admin cookie, fetch-mocked PostgREST) for
// the profile, templates and sponsor-package APIs, plus the pure rules.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.ADMIN_PASSWORD = "test-password";
process.env.ADMIN_PEPPER   = "test-pepper";

register(new URL("../../../../lib/testSupport/nextStubLoader.mjs", import.meta.url).href, import.meta.url);

const { NextRequest } = await import("../../../../lib/testSupport/nextServerStub.mjs");
const { __setTestCookie } = await import("../../../../lib/testSupport/nextHeadersStub.mjs");
const { getAdminToken } = await import("@/lib/adminAuth");
const { pickEditableOrgFields, organizationIdParam, organizationLabel, filterOrganizations, sortOrganizations, isLegacyPlaceholderOrganization } = await import("@/lib/organizationCenter");

type Row = Record<string, unknown>;
const A = "11111111-1111-4111-8111-111111111111"; // Monroe Valley
const B = "22222222-2222-4222-8222-222222222222"; // Chino Valley
const MISSING = "33333333-3333-4333-8333-333333333333";

function makeWorld() {
  const db: Record<string, Row[]> = {
    organizations: [
      { id: "00000000-0000-4000-8000-000000000000", slug: "default", school_name: "", city: "", state: "" }, // legacy first row
      { id: A, slug: "monroe-valley-high-school", school_name: "Monroe Valley High School", city: "Phoenix", state: "AZ", show_community_partners: true },
      { id: B, slug: "chino-valley-high-school", school_name: "Chino Valley High School", city: "Chino Valley", state: "AZ", show_community_partners: false },
    ],
    communication_templates: [],
    sponsor_packages: [
      { id: "pkg-a", organization_id: A, name: "Gold A", sort_order: 0 },
      { id: "pkg-b", organization_id: B, name: "Gold B", sort_order: 0 },
    ],
    audit_logs: [],
  };
  const requests: { method: string; path: string; body?: unknown }[] = [];
  const matches = (r: Row, k: string, v: string) => (v.startsWith("eq.") ? String(r[k]) === v.slice(3) : true);
  const filter = (rows: Row[], p: URLSearchParams) => {
    let out = rows;
    for (const [k, v] of p.entries()) if (!["select", "limit", "order"].includes(k)) out = out.filter(r => matches(r, k, v));
    const limit = p.get("limit");
    return limit ? out.slice(0, +limit) : out;
  };
  async function fetchImpl(url: string, init?: RequestInit): Promise<Response> {
    const path = url.replace(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, "");
    const [table, q] = path.split("?");
    const p = new URLSearchParams(q ?? "");
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ method, path, body });
    const rows = (db[table] ??= []);
    if (method === "GET") return new Response(JSON.stringify(filter(rows, p)), { status: 200 });
    if (method === "PATCH") { const hit = filter(rows, p); for (const r of hit) Object.assign(r, body); return new Response(JSON.stringify(hit), { status: 200 }); }
    if (method === "DELETE") { const hit = filter(rows, p); db[table] = rows.filter(r => !hit.includes(r)); return new Response(JSON.stringify(hit), { status: 200 }); }
    if (method === "POST") { const made = [{ id: `new-${requests.length}`, ...body }]; rows.push(...made); return new Response(JSON.stringify(made), { status: 201 }); }
    return new Response("null", { status: 405 });
  }
  return { db, requests, fetchImpl };
}

async function withWorld(run: (w: ReturnType<typeof makeWorld>) => Promise<void>, signedIn = true) {
  const w = makeWorld();
  const real = globalThis.fetch;
  globalThis.fetch = w.fetchImpl as typeof fetch;
  __setTestCookie("elf_admin", signedIn ? getAdminToken()! : undefined);
  try { await run(w); } finally { globalThis.fetch = real; __setTestCookie("elf_admin", undefined); }
}

const req = (path: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://test.local${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }) as never;

const profile = () => import("./route.ts");
const templates = () => import("./templates/route.ts");
const packages = () => import("./sponsor-packages/route.ts");
const pkg = () => import("./sponsor-packages/[id]/route.ts");
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

// ── Who ───────────────────────────────────────────────────────────────────

test("every Organization Center API refuses a request without the admin session", async () => {
  await withWorld(async w => {
    assert.equal((await (await profile()).GET(req(`/api/admin/organization?organizationId=${A}`))).status, 401);
    assert.equal((await (await profile()).PUT(req("/api/admin/organization", "PUT", { organizationId: A, school_name: "X" }))).status, 401);
    assert.equal((await (await templates()).PUT(req("/x", "PUT", { organizationId: A, type: "welcome" }))).status, 401);
    assert.equal((await (await packages()).POST(req("/x", "POST", { organizationId: A, name: "P" }))).status, 401);
    assert.equal((await (await pkg()).DELETE(req(`/x?organizationId=${A}`, "DELETE"), ctx("pkg-a"))).status, 401);
    assert.equal(w.requests.length, 0, "nothing read or written");
  }, false);
});

// ── Which school ──────────────────────────────────────────────────────────

test("a school must be named explicitly: missing or malformed ids are refused, never 'the first school'", async () => {
  await withWorld(async w => {
    assert.equal((await (await profile()).GET(req("/api/admin/organization"))).status, 400);
    assert.equal((await (await profile()).PUT(req("/api/admin/organization", "PUT", { school_name: "Renamed" }))).status, 400);
    assert.equal((await (await profile()).PUT(req("/api/admin/organization", "PUT", { organizationId: "default", school_name: "Renamed" }))).status, 400);
    assert.equal((await (await templates()).GET(req("/x"))).status, 400);
    assert.equal((await (await packages()).GET(req("/x"))).status, 400);
    assert.equal((await (await pkg()).DELETE(req("/x", "DELETE"), ctx("pkg-a"))).status, 400);
    assert.ok(!w.requests.some(r => /organizations\?select=(id|\*)&limit=1/.test(r.path)), "no first-row lookup");
    assert.equal(w.db.organizations[0].school_name, "", "the legacy first row is untouched");
  });
});

test("GET returns exactly the requested school; an unknown school is 404", async () => {
  await withWorld(async () => {
    const res = await (await profile()).GET(req(`/api/admin/organization?organizationId=${B}`));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).org.school_name, "Chino Valley High School");
    assert.equal((await (await profile()).GET(req(`/api/admin/organization?organizationId=${MISSING}`))).status, 404);
  });
});

test("PUT updates only the named school, only editable fields, and is audit-logged", async () => {
  await withWorld(async w => {
    const res = await (await profile()).PUT(req("/api/admin/organization", "PUT", {
      organizationId: B, school_name: "  Chino Valley HS  ", city: "Chino Valley", default_contact_goal: 12,
      // never editable here:
      id: A, slug: "hijack", created_at: "2020-01-01", show_community_partners: true, team_id: "x",
    }));
    assert.equal(res.status, 200);
    const patch = w.requests.find(r => r.method === "PATCH")!;
    assert.match(patch.path, new RegExp(`^organizations\\?id=eq\\.${B}&`));
    const sent = patch.body as Row;
    assert.deepEqual(Object.keys(sent).sort(), ["city", "default_contact_goal", "school_name", "updated_at"]);
    assert.equal(sent.school_name, "Chino Valley HS");
    const b = w.db.organizations.find(o => o.id === B)!, a = w.db.organizations.find(o => o.id === A)!;
    assert.equal(b.slug, "chino-valley-high-school");
    assert.equal(b.show_community_partners, false, "advertising flag can't be changed here");
    assert.equal(a.school_name, "Monroe Valley High School", "other schools untouched");
    await new Promise(r => setTimeout(r, 0));
    const audit = w.requests.find(r => r.path.startsWith("audit_logs"));
    assert.ok(audit, "audit row written");
    assert.equal((audit!.body as Row).entity_id, B);
    assert.equal((audit!.body as Row).action, "organization.update");
  });
});

test("PUT never creates a school: an unknown id is 404 and nothing is inserted", async () => {
  await withWorld(async w => {
    const res = await (await profile()).PUT(req("/api/admin/organization", "PUT", { organizationId: MISSING, school_name: "Ghost" }));
    assert.equal(res.status, 404);
    assert.ok(!w.requests.some(r => r.method === "POST" && r.path.startsWith("organizations")));
    assert.equal(w.db.organizations.length, 3);
  });
});

test("PUT refuses wrong types and empty names", async () => {
  await withWorld(async w => {
    for (const bad of [{ school_name: "" }, { default_contact_goal: "12" }, { default_show_sponsors: "yes" }, { city: 5 }, { nothing_editable: true }]) {
      const res = await (await profile()).PUT(req("/api/admin/organization", "PUT", { organizationId: A, ...bad }));
      assert.equal(res.status, 400, JSON.stringify(bad));
    }
    assert.ok(!w.requests.some(r => r.method === "PATCH"));
  });
});

// ── Templates and sponsor packages stay inside the chosen school ──────────

test("templates: read and saved for the named school only", async () => {
  await withWorld(async w => {
    const res = await (await templates()).PUT(req("/x", "PUT", { organizationId: A, type: "welcome", subject: "Hi", body_text: "Body" }));
    assert.equal(res.status, 200);
    assert.equal(w.db.communication_templates[0].organization_id, A);
    assert.equal((await (await templates()).PUT(req("/x", "PUT", { organizationId: MISSING, type: "welcome" }))).status, 404);
    await (await templates()).GET(req(`/x?organizationId=${B}`));
    assert.ok(w.requests.some(r => r.path.startsWith(`communication_templates?organization_id=eq.${B}`)));
  });
});

test("sponsor packages: created for the named school; edit/delete can't reach another school's package", async () => {
  await withWorld(async w => {
    const made = await (await packages()).POST(req("/x", "POST", { organizationId: B, name: "Silver" }));
    assert.equal(made.status, 200);
    assert.equal(w.db.sponsor_packages.at(-1)!.organization_id, B);

    // pkg-a belongs to A — addressed through B it's not found and survives.
    assert.equal((await (await pkg()).DELETE(req(`/x?organizationId=${B}`, "DELETE"), ctx("pkg-a"))).status, 404);
    assert.equal((await (await pkg()).PUT(req(`/x?organizationId=${B}`, "PUT", { name: "Hijacked" }), ctx("pkg-a"))).status, 404);
    assert.equal(w.db.sponsor_packages.find(p => p.id === "pkg-a")!.name, "Gold A");

    assert.equal((await (await pkg()).DELETE(req(`/x?organizationId=${A}`, "DELETE"), ctx("pkg-a"))).status, 200);
    assert.ok(!w.db.sponsor_packages.some(p => p.id === "pkg-a"));
    assert.ok(w.db.sponsor_packages.some(p => p.id === "pkg-b"), "the other school's package is untouched");
  });
});

// ── The page and the rules ────────────────────────────────────────────────

test("no Organization Center code resolves a school with a first-row (limit=1) lookup any more", () => {
  for (const f of [
    "src/app/admin/organization/page.tsx",
    "src/app/api/admin/organization/route.ts",
    "src/app/api/admin/organization/templates/route.ts",
    "src/app/api/admin/organization/sponsor-packages/route.ts",
  ]) {
    const src = readFileSync(join(process.cwd(), f), "utf8");
    assert.doesNotMatch(src, /organizations\?select=[^`"]*&limit=1/, f);
    assert.doesNotMatch(src, /getFirstOrgId/, f);
  }
  const page = readFileSync(join(process.cwd(), "src/app/admin/organization/page.tsx"), "utf8");
  assert.match(page, /organizationIdParam\(typeof school === "string" \? school : null\)/);
  assert.match(page, /return <OrganizationPicker schools=\{rows\} loadFailed=\{!orgRes\.ok\} \/>;/);
});

test("rules: ids, labels (name — city, state), search by name/city/state, sort", () => {
  assert.equal(organizationIdParam(A.toUpperCase()), A);
  for (const bad of [null, "", "default", "1; drop", `${A}x`]) assert.equal(organizationIdParam(bad), null);
  assert.equal(organizationLabel({ school_name: "Monroe Valley High School", city: "Phoenix", state: "AZ", slug: "m" }), "Monroe Valley High School — Phoenix, AZ");
  assert.equal(organizationLabel({ school_name: "", city: "", state: "", slug: "default" }), "Unnamed record (default)");
  const rows = [
    { school_name: "Lincoln High School", city: "Omaha", state: "NE", slug: "lincoln-ne" },
    { school_name: "Lincoln High School", city: "Portland", state: "OR", slug: "lincoln-or" },
    { school_name: "", city: "", state: "", slug: "default" },
  ];
  assert.deepEqual(filterOrganizations(rows, "portland").map(r => r.slug), ["lincoln-or"]);
  assert.deepEqual(filterOrganizations(rows, " ne ").map(r => r.slug), ["lincoln-ne"]);
  assert.deepEqual(sortOrganizations(rows).map(r => r.slug), ["lincoln-ne", "lincoln-or", "default"]);
  const ok = pickEditableOrgFields({ school_name: "X", default_show_sponsors: false, slug: "no" });
  assert.ok(ok.ok && ok.fields.sort().join() === "default_show_sponsors,school_name");
});

test("picker: the empty legacy 'default' placeholder is hidden (display only); it stays reachable and is never modified", () => {
  assert.equal(isLegacyPlaceholderOrganization({ slug: "default", school_name: "" }), true);
  assert.equal(isLegacyPlaceholderOrganization({ slug: "default", school_name: "   " }), true);
  assert.equal(isLegacyPlaceholderOrganization({ slug: "default", school_name: "Named Later High" }), false, "a named record is a real school");
  assert.equal(isLegacyPlaceholderOrganization({ slug: "default-mesa-az", school_name: "" }), false);
  assert.equal(isLegacyPlaceholderOrganization({ slug: "monroe", school_name: "Monroe" }), false);
  const page = readFileSync(join(process.cwd(), "src/app/admin/organization/page.tsx"), "utf8").replace(/\r\n/g, "\n");
  // Only the picker list is filtered; the list query and the ?school=<id> editor query are unchanged.
  assert.match(page, /sortOrganizations\(orgs\.filter\(o => !isLegacyPlaceholderOrganization\(o\)\)\.map\(/);
  assert.match(page, /organizations\?select=id,slug,school_name,city,state`/);
  assert.match(page, /organizations\?id=eq\.\$\{orgId\}&select=\*&limit=1`/);
  assert.doesNotMatch(page, /method: "(PATCH|DELETE|POST)"/, "the page never writes");
});
