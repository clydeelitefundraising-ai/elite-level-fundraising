// School Links — "Create new school" (POST /api/platform-admin/school-links/
// schools): authorization, validation, duplicate prevention (normalized
// name + place, slug collisions, a lost concurrent race), audit attribution,
// and that creating a school never links a season.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.ELF_ACCOUNT_PEPPER        = "fake-account-pepper";
process.env.ADMIN_PASSWORD            = "shared-admin-password";
process.env.ADMIN_PEPPER              = "shared-admin-pepper";

register(new URL("../../../../lib/testSupport/nextStubLoader.mjs", import.meta.url).href, import.meta.url);

const { __setTestCookie } = await import("../../../../lib/testSupport/nextHeadersStub.mjs");
const { NextRequest } = await import("../../../../lib/testSupport/nextServerStub.mjs");
const { makeAccountCookie } = await import("@/lib/accountAuth");
const { getAdminToken } = await import("@/lib/adminAuth");

type Row = Record<string, unknown>;

function makeWorld() {
  const db: Record<string, Row[]> = {
    elf_accounts: [
      { id: "acct-admin", email: "admin@elf.test", name: "ELF Admin", salt: "s-admin", profile_photo_url: null },
      { id: "acct-coach", email: "coach@elf.test", name: "Coach", salt: "s-coach", profile_photo_url: null },
    ],
    platform_admins: [{ id: "pa-1", account_id: "acct-admin", role: "platform_admin" }],
    organizations: [
      { id: "org-default", slug: "default", school_name: "", city: "", state: "" },
      { id: "org-monroe", slug: "monroe-valley-high-school", school_name: "Monroe Valley High School", city: "Phoenix", state: "AZ" },
      { id: "org-apollo-hs", slug: "apollo-hs-glendale", school_name: "Apollo H.S.", city: "Glendale", state: "AZ" },
      { id: "org-lincoln", slug: "lincoln-high-school", school_name: "Lincoln High School", city: "Omaha", state: "NE" },
    ],
    campaign_settings: [{ campaign_slug: "apollo-track-and-field-2027", school_name: "Apollo High School", organization_id: null }],
    audit_logs: [],
  };
  const requests: { method: string; path: string; body?: Row }[] = [];
  const hooks: { beforeInsert?: () => void; orgReadStatus?: number; auditStatuses?: number[] } = {};
  let n = 0;
  async function fetchImpl(url: string, init?: RequestInit): Promise<Response> {
    const path = url.replace(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, "");
    const [table, q] = path.split("?");
    const p = new URLSearchParams(q ?? "");
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ method, path, body });
    const rows = (db[table] ??= []);
    if (method === "GET") {
      if (table === "organizations" && hooks.orgReadStatus) return new Response("{}", { status: hooks.orgReadStatus });
      let out = rows;
      for (const [k, v] of p.entries()) {
        if (v.startsWith("eq.")) out = out.filter(r => String(r[k]) === decodeURIComponent(v.slice(3)));
        if (v.startsWith("neq.")) out = out.filter(r => String(r[k]) !== decodeURIComponent(v.slice(4)));
      }
      return new Response(JSON.stringify(out), { status: 200 });
    }
    if (method === "POST" && table === "organizations") {
      hooks.beforeInsert?.();
      if (rows.some(r => r.slug === body.slug)) {
        return new Response(JSON.stringify({ code: "23505", message: "duplicate key value violates unique constraint \"organizations_slug_key\"" }), { status: 409 });
      }
      const row = { id: `org-new-${++n}`, ...body };
      rows.push(row);
      return new Response(JSON.stringify([row]), { status: 201 });
    }
    if (method === "POST" && table === "audit_logs" && hooks.auditStatuses?.length) {
      const status = hooks.auditStatuses.shift()!;
      if (status < 300) rows.push({ ...body });
      return new Response("", { status });
    }
    if (method === "POST") { rows.push({ ...body }); return new Response("", { status: 201 }); }
    return new Response("null", { status: 405 });
  }
  return { db, requests, hooks, fetchImpl };
}

type World = ReturnType<typeof makeWorld>;
async function withWorld(run: (w: World) => Promise<void>, who: "admin" | "coach" | "shared-admin" | "nobody" = "admin") {
  const w = makeWorld();
  const real = globalThis.fetch;
  globalThis.fetch = w.fetchImpl as typeof fetch;
  __setTestCookie("elf_session", undefined);
  __setTestCookie("elf_admin", undefined);
  if (who === "admin") __setTestCookie("elf_session", makeAccountCookie("acct-admin", "s-admin"));
  if (who === "coach") __setTestCookie("elf_session", makeAccountCookie("acct-coach", "s-coach"));
  if (who === "shared-admin") __setTestCookie("elf_admin", getAdminToken()!);
  try { await run(w); } finally { globalThis.fetch = real; __setTestCookie("elf_session", undefined); __setTestCookie("elf_admin", undefined); }
}

const create = async (body: unknown) => {
  const { POST } = await import("./schools/route.ts");
  const res = await POST(new NextRequest("http://test.local/x", {
    method: "POST", headers: { "content-type": "application/json", "user-agent": "qa-agent", "x-forwarded-for": "203.0.113.9" }, body: JSON.stringify(body),
  }) as never);
  return { status: res.status, body: await res.json() };
};
const inserts = (w: World) => w.requests.filter(q => q.method === "POST" && q.path.startsWith("organizations"));
const audits = (w: World) => w.requests.filter(q => q.method === "POST" && q.path === "audit_logs").map(q => q.body!);
const linkWrites = (w: World) => w.requests.filter(q => q.method !== "GET" && (q.path.startsWith("campaign_settings") || q.path.startsWith("rpc/")));
const APOLLO = { school_name: "Apollo High School", city: "Phoenix", state: "AZ" };

for (const who of ["nobody", "coach", "shared-admin"] as const) {
  test(`create school: ${who} is refused before any read or write`, async () => {
    await withWorld(async w => {
      const res = await create(APOLLO);
      assert.equal(res.status, 401);
      assert.equal(w.requests.filter(q => q.path.startsWith("organizations") || q.path === "audit_logs").length, 0);
    }, who);
  });
}

test("create school: invalid input is refused with the field, nothing is read or written", async () => {
  await withWorld(async w => {
    for (const [body, field] of [
      [{ ...APOLLO, school_name: " " }, "school_name"],
      [{ ...APOLLO, school_name: "--" }, "school_name"],
      [{ ...APOLLO, school_name: "x".repeat(121) }, "school_name"],
      [{ ...APOLLO, city: "" }, "city"],
      [{ ...APOLLO, state: "Arizona" }, "state"],
      [{ ...APOLLO, state: "" }, "state"],
      [null, "school_name"],
    ] as const) {
      const res = await create(body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(res.body.field, field);
    }
    assert.equal(inserts(w).length, 0);
    assert.equal(audits(w).length, 0);
  });
});

test("create school: inserts only name, city, state and a slug; audited as the Platform Admin; links nothing", async () => {
  await withWorld(async w => {
    const res = await create({ school_name: "  Apollo   High School ", city: " Phoenix ", state: "az", organization_id: "x", show_community_partners: true });
    assert.equal(res.status, 201);
    assert.equal(res.body.auditRecorded, true);
    assert.deepEqual(inserts(w).map(q => q.body), [{ slug: "apollo-high-school", school_name: "Apollo High School", city: "Phoenix", state: "AZ" }]);
    assert.deepEqual(res.body.school, { id: "org-new-1", slug: "apollo-high-school", school_name: "Apollo High School", city: "Phoenix", state: "AZ", label: "Apollo High School — Phoenix, AZ" });
    const [a] = audits(w);
    assert.equal(audits(w).length, 1);
    assert.deepEqual(
      [a.action, a.entity_type, a.entity_id, a.actor_type, a.actor_id, a.actor_email, a.admin_identifier, a.ip_address, a.user_agent],
      ["organization.created", "organization", "org-new-1", "platform_admin", "pa-1", "admin@elf.test", "admin@elf.test", "203.0.113.9", "qa-agent"],
    );
    assert.deepEqual(a.new_value, { school_name: "Apollo High School", city: "Phoenix", state: "AZ", slug: "apollo-high-school" });
    assert.deepEqual(linkWrites(w), [], "creating a school never links a season");
    assert.equal(w.db.campaign_settings[0].organization_id, null);
  });
});

test("duplicates: the same school (case, spacing, punctuation ignored) in the same place is never created", async () => {
  await withWorld(async w => {
    for (const body of [
      { school_name: "monroe valley high school", city: "PHOENIX", state: "AZ" },
      { school_name: "Monroe-Valley  High School!", city: "phoenix ", state: "az" },
      { school_name: "Apollo HS", city: "Glendale", state: "AZ" },
    ]) {
      const res = await create(body);
      assert.equal(res.status, 409, JSON.stringify(body));
      assert.equal(res.body.code, "duplicate");
    }
    assert.equal((await create({ school_name: "Monroe Valley High School", city: "Phoenix", state: "AZ" })).body.existing.id, "org-monroe");
    assert.equal(inserts(w).length, 0);
    assert.equal(audits(w).length, 0);
  });
});

test("duplicates: an existing slug equal to the new name's key counts as the same school", async () => {
  await withWorld(async w => {
    w.db.organizations.push({ id: "org-hand", slug: "desert-vista-high-school", school_name: "DVHS", city: "Phoenix", state: "AZ" });
    const res = await create({ school_name: "Desert Vista High School", city: "Phoenix", state: "AZ" });
    assert.deepEqual([res.status, res.body.code, res.body.existing.id], [409, "duplicate", "org-hand"]);
  });
});

test("same name, different place: needs explicit confirmation, then gets a place-specific slug", async () => {
  await withWorld(async w => {
    const first = await create({ school_name: "Lincoln High School", city: "Lincoln", state: "NE" });
    assert.deepEqual([first.status, first.body.code], [409, "similar"]);
    assert.deepEqual(first.body.similar.map((s: Row) => s.id), ["org-lincoln"]);
    assert.equal(inserts(w).length, 0);
    const second = await create({ school_name: "Lincoln High School", city: "Lincoln", state: "NE", acknowledgeSimilar: true });
    assert.equal(second.status, 201);
    assert.equal(second.body.school.slug, "lincoln-high-school-lincoln-ne");
    assert.equal(audits(w).length, 1);
    // ...and that exact place is now a duplicate, even when confirmed again.
    const third = await create({ school_name: "Lincoln High School", city: "lincoln", state: "NE", acknowledgeSimilar: true });
    assert.deepEqual([third.status, third.body.code], [409, "duplicate"]);
  });
});

test("concurrency: a create that loses the race to the same school reports it, never a second record or audit", async () => {
  await withWorld(async w => {
    w.hooks.beforeInsert = () => {
      w.hooks.beforeInsert = undefined;
      w.db.organizations.push({ id: "org-racer", slug: "apollo-high-school", school_name: "Apollo High School", city: "Phoenix", state: "AZ" });
    };
    const res = await create(APOLLO);
    assert.deepEqual([res.status, res.body.code, res.body.existing.id], [409, "duplicate", "org-racer"]);
    assert.equal(w.db.organizations.filter(o => o.slug === "apollo-high-school").length, 1);
    assert.equal(inserts(w).length, 1, "one attempt, no random-suffix retry");
    assert.equal(audits(w).length, 0);
  });
});

test("a failed school read refuses creation (503) instead of guessing there are no duplicates", async () => {
  await withWorld(async w => {
    w.hooks.orgReadStatus = 500;
    const res = await create(APOLLO);
    assert.equal(res.status, 503);
    assert.match(res.body.error, /Nothing was changed/);
    assert.equal(inserts(w).length, 0);
  });
});

test("the empty 'default' seed row is never a match, and a school named Default can't take its slug", async () => {
  await withWorld(async w => {
    const res = await create({ school_name: "Default", city: "Mesa", state: "AZ" });
    assert.equal(res.status, 201);
    assert.equal(res.body.school.slug, "default-mesa-az");
    assert.equal(w.db.organizations.filter(o => o.slug === "default").length, 1);
  });
});

test("wiring: picker hides the seed row; the form only creates; linking still needs Preview + Confirm", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");
  assert.match(read("src/lib/platform/schoolLinks.ts"), /organizations\?select=\$\{ORG_SELECT\}&slug=neq\.default\$\{filter\}/);
  const form = read("src/app/platform-admin/school-links/[slug]/CreateSchoolForm.tsx");
  assert.deepEqual([...form.matchAll(/fetch\("([^"]+)"/g)].map(m => m[1]), ["/api/platform-admin/school-links/schools"]);
  assert.doesNotMatch(form, /\/preview|previewToken|method: "PUT"/);
  const panel = read("src/app/platform-admin/school-links/[slug]/SchoolLinkPanel.tsx");
  assert.match(panel, /onCreated=\{\(school, auditRecorded\) => selectSchool\(school, true, auditRecorded\)\}/);
  assert.match(panel, /const selectSchool = [\s\S]*?choose\(school\);/, "selecting discards any preview (choose → discard)");
  assert.match(panel, /Nothing is linked yet — preview and confirm to link\./);
  // The confirm is still the only link write, and it still needs the preview token.
  assert.match(panel, /body: JSON\.stringify\(\{ organizationId: preview\.organizationId, seasons: preview\.confirm, previewToken: preview\.previewToken \}\)/);
  // Creating lives outside the linking library, which still never creates.
  assert.doesNotMatch(read("src/lib/platform/schoolLinks.ts"), /organizations`?,s*{s*method: "POST"|restInsert/);
});

test("audit failure: the audit row is awaited and retried once; a second failure keeps the school and says so", async () => {
  await withWorld(async w => {
    w.hooks.auditStatuses = [500, 201];
    const retried = await create(APOLLO);
    assert.deepEqual([retried.status, retried.body.auditRecorded], [201, true]);
    assert.equal(audits(w).length, 2, "one retry");
    assert.equal(w.db.audit_logs.length, 1, "exactly one audit row written");
  });
  await withWorld(async w => {
    w.hooks.auditStatuses = [500, 503];
    const errors: string[] = [];
    const realError = console.error, realWarn = console.warn;
    console.error = (m: string) => { errors.push(String(m)); };
    console.warn = () => {};
    try {
      const failed = await create(APOLLO);
      assert.deepEqual([failed.status, failed.body.auditRecorded], [201, false]);
      assert.equal(audits(w).length, 2, "no more than one retry");
      assert.equal(w.db.audit_logs.length, 0);
      assert.ok(w.db.organizations.some(o => o.slug === "apollo-high-school"), "the valid school is kept, not deleted");
      assert.deepEqual(linkWrites(w), []);
      assert.ok(errors.some(e => e.includes(String(failed.body.school.id))), "server log names the school id");
      assert.ok(errors.every(e => !e.includes("Apollo") && !e.includes("admin@elf.test")), "no names or emails in the log");
    } finally { console.error = realError; console.warn = realWarn; }
  });
});

test("wiring: an unrecorded audit row is shown to the admin", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");
  assert.match(read("src/app/platform-admin/school-links/[slug]/CreateSchoolForm.tsx"), /onCreated\(d\.school, d\.auditRecorded !== false\)/);
  const panel = read("src/app/platform-admin/school-links/[slug]/SchoolLinkPanel.tsx");
  assert.match(panel, /if \(!auditRecorded\) setAuditWarning\(/);
  assert.match(panel, /\{auditWarning && <p role="alert"/);
});
