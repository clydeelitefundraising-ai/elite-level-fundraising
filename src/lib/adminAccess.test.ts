// Admin consolidation, Stage 0 — the legacy /admin API is authorized ONLY
// through getAdminAccess() (Platform Admin account, or temporarily the
// shared password), every write is audited with the real actor, and the
// shared password never reaches a Platform-Admin-only surface.
//
// Part 1 is a static inventory of src/app/api/admin (a new route fails
// until it uses the helper). Part 2 runs real handlers against a fake
// PostgREST with real account cookies.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.ELF_ACCOUNT_PEPPER        = "fake-account-pepper";
process.env.ADMIN_PASSWORD            = "shared-admin-password";
process.env.ADMIN_PEPPER              = "shared-admin-pepper";

register(new URL("./testSupport/nextStubLoader.mjs", import.meta.url).href, import.meta.url);

const { __setTestCookie } = await import("./testSupport/nextHeadersStub.mjs");
const { NextRequest } = await import("./testSupport/nextServerStub.mjs");
const { makeAccountCookie } = await import("@/lib/accountAuth");
const { getAdminToken } = await import("@/lib/adminAuth");
const { getAdminAccess, adminAuditActor } = await import("@/lib/adminAccess");

const ROOT = process.cwd();
const API = join(ROOT, "src", "app", "api");

// ── Part 1: static inventory ──────────────────────────────────────────────

type Handler = { route: string; method: string; body: string; file: string };
function handlers(dir: string): Handler[] {
  const out: Handler[] = [];
  (function walk(d: string) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "route.ts") {
        const route = relative(API, d).split(sep).join("/");
        const src = readFileSync(p, "utf8").replace(/\r\n/g, "\n");
        const re = /^export (?:async )?function (GET|POST|PUT|PATCH|DELETE)\b/gm;
        const starts = [...src.matchAll(re)].map(m => ({ i: m.index!, method: m[1] }));
        starts.forEach((s, k) => out.push({ route, method: s.method, file: src, body: src.slice(s.i, k + 1 < starts.length ? starts[k + 1].i : src.length) }));
      }
    }
  })(dir);
  return out;
}
const admin = handlers(join(API, "admin"));
const key = (h: Handler) => `${h.route} ${h.method}`;

// Handlers that are NOT behind getAdminAccess(), with the reason.
const NO_GATE: Record<string, string> = {
  "admin/login POST": "the shared-password sign-in itself (rate limited)",
  "admin/logout POST": "clears the shared-password cookie only",
};
// Write handlers with no audit row, with the reason.
const NO_AUDIT: Record<string, string> = {
  "admin/login POST": "sign-in (failures are rate limited, not audited)",
  "admin/logout POST": "sign-out",
  "admin/athletes/import/parse POST": "parses an uploaded file in memory; writes nothing",
};
// The gate must be the handler's first statement, except where noted.
const GATE_NOT_FIRST: Record<string, string> = {
  "admin/demo/launch GET": "the public persona is a plain redirect to the public campaign page (no admin data)",
};
const GATE = /const access = await getAdminAccess\(\);\n\s*if \(!access\) (?:return adminUnauthorized\(\);|\{)/;

test("inventory found the legacy admin API", () => {
  assert.ok(admin.length >= 75, `only ${admin.length} handlers`);
});

test("every /api/admin handler is gated by getAdminAccess() (or listed with a reason)", () => {
  const missing = admin.filter(h => !NO_GATE[key(h)] && !GATE.test(h.body)).map(key);
  assert.deepEqual(missing, []);
  for (const k of Object.keys(NO_GATE)) assert.ok(admin.some(h => key(h) === k), `stale NO_GATE entry ${k}`);
});

test("the gate is the first thing each handler does (nothing runs before authorization)", () => {
  const late = admin.filter(h => !NO_GATE[key(h)] && !GATE_NOT_FIRST[key(h)]).filter(h => {
    const afterSignature = h.body.slice(h.body.indexOf(") {") + 3).trimStart();
    return !afterSignature.startsWith("const access = await getAdminAccess();");
  }).map(key);
  assert.deepEqual(late, []);
});

test("no /api/admin route checks the shared password itself any more", () => {
  const files = new Set(admin.filter(h => !NO_GATE[key(h)]).map(h => h.route));
  const direct = [...files].filter(r => {
    const src = admin.find(h => h.route === r)!.file;
    return /verifyToken|store\.get\("elf_admin"\)/.test(src);
  });
  assert.deepEqual(direct, []);
});

test("every admin write is audited with the authorized actor (never a request-supplied identity)", () => {
  const writes = admin.filter(h => h.method !== "GET" && !NO_AUDIT[key(h)]);
  const unaudited = writes.filter(h => !/logAudit(Event)?\(\{[\s\S]*?actor:\s*adminAuditActor\(access\)/.test(h.body)).map(key);
  assert.deepEqual(unaudited, []);
  const anyOtherActor = admin.filter(h => /ADMIN_TOOL_ACTOR|adminAuditActor\((?!access\))|actor:\s*(body|req|payload|input)\b/.test(h.body)).map(key);
  assert.deepEqual(anyOtherActor, []);
  for (const k of Object.keys(NO_AUDIT)) assert.ok(admin.some(h => key(h) === k), `stale NO_AUDIT entry ${k}`);
});

test("the shared password never authorizes a Platform-Admin-only surface", () => {
  const platform = handlers(join(API, "platform-admin"));
  const viaShared = platform.filter(h => /from "@\/lib\/(adminAuth|adminAccess)"|getAdminAccess\(|verifyToken\(/.test(h.file)).map(key);
  assert.deepEqual(viaShared, []);
  const noSession = platform.filter(h => !/getPlatformAdminSession\(\)/.test(h.body)).map(key);
  assert.deepEqual(noSession, [], "every platform-admin handler checks the account session itself");
  const layout = readFileSync(join(ROOT, "src/app/platform-admin/layout.tsx"), "utf8");
  assert.doesNotMatch(layout, /adminAuth|adminAccess|elf_admin/);
  const partners = readFileSync(join(ROOT, "src/app/admin/community-partners/page.tsx"), "utf8");
  assert.match(partners, /getPlatformAdminSession\(\)/, "Community Partners still requires a Platform Admin account inside /admin");
});

// ── Part 2: behavior ──────────────────────────────────────────────────────

type Row = Record<string, unknown>;
// The Organization Center edits one explicit school (School Linking Phase A).
const ORG = "00000000-0000-4000-8000-0000000000a1";
function world() {
  const db: Record<string, Row[]> = {
    elf_accounts: [
      { id: "acct-pa", email: "pa@elf.test", name: "Pat Admin", salt: "s-pa", profile_photo_url: null },
      { id: "acct-coach", email: "coach@elf.test", name: "Casey Coach", salt: "s-coach", profile_photo_url: null },
    ],
    platform_admins: [{ id: "pa-1", account_id: "acct-pa", role: "platform_admin" }],
    organizations: [{ id: ORG, slug: "default" }],
    communication_templates: [],
    sponsor_packages: [{ id: "pkg-1", organization_id: ORG, name: "Gold" }],
    audit_logs: [],
  };
  const writes: { method: string; table: string; body: Row | null }[] = [];
  async function fetchImpl(url: string, init?: RequestInit): Promise<Response> {
    const path = url.replace(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, "");
    const [table, q] = path.split("?");
    const p = new URLSearchParams(q ?? "");
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Row : null;
    if (method !== "GET") writes.push({ method, table, body });
    const rows = (db[table] ??= []);
    if (method === "GET") {
      let out = rows;
      for (const [k, v] of p.entries()) if (v.startsWith("eq.")) out = out.filter(r => String(r[k]) === v.slice(3));
      return new Response(JSON.stringify(p.get("limit") ? out.slice(0, +p.get("limit")!) : out), { status: 200 });
    }
    if (method === "POST") { rows.push({ ...body }); return new Response(JSON.stringify([{ id: "new-1", ...body }]), { status: 201 }); }
    // PATCH / DELETE: the matching rows (return=representation).
    const hit = rows.filter(r => [...p.entries()].every(([k, v]) => !v.startsWith("eq.") || String(r[k]) === v.slice(3)));
    if (method === "DELETE") db[table] = rows.filter(r => !hit.includes(r));
    return new Response(JSON.stringify(hit), { status: 200 });
  }
  return { db, writes, fetchImpl };
}

async function as(who: "platform" | "coach" | "shared" | "platform+shared" | "nobody", run: (w: ReturnType<typeof world>) => Promise<void>) {
  const w = world();
  const real = globalThis.fetch;
  globalThis.fetch = w.fetchImpl as typeof fetch;
  __setTestCookie("elf_session", undefined);
  __setTestCookie("elf_admin", undefined);
  if (who === "platform" || who === "platform+shared") __setTestCookie("elf_session", makeAccountCookie("acct-pa", "s-pa"));
  if (who === "coach") __setTestCookie("elf_session", makeAccountCookie("acct-coach", "s-coach"));
  if (who === "shared" || who === "platform+shared") __setTestCookie("elf_admin", getAdminToken()!);
  try { await run(w); } finally { globalThis.fetch = real; __setTestCookie("elf_session", undefined); __setTestCookie("elf_admin", undefined); }
}
const req = (path: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://test.local${path}`, { method, headers: { "content-type": "application/json", "user-agent": "qa-agent" }, body: body === undefined ? undefined : JSON.stringify(body) }) as never;
const audits = (w: ReturnType<typeof world>) => w.writes.filter(x => x.table === "audit_logs").map(x => x.body!);

test("getAdminAccess: Platform Admin account, shared password, both (account wins), neither, ordinary account", async () => {
  await as("platform", async () => {
    const a = await getAdminAccess();
    assert.equal(a?.via, "platform_admin");
    assert.deepEqual(adminAuditActor(a!), { type: "platform_admin", id: "pa-1", email: "pa@elf.test", name: "Pat Admin" });
  });
  await as("shared", async () => {
    const a = await getAdminAccess();
    assert.equal(a?.via, "shared_password");
    assert.deepEqual(adminAuditActor(a!), { type: "admin_tool" });
  });
  await as("platform+shared", async () => assert.equal((await getAdminAccess())?.via, "platform_admin"));
  await as("nobody", async () => assert.equal(await getAdminAccess(), null));
  await as("coach", async () => assert.equal(await getAdminAccess(), null, "a coach/parent/athlete/booster account is not an admin"));
});

test("a forged elf_admin cookie or a tampered account cookie is refused", async () => {
  await as("nobody", async () => {
    __setTestCookie("elf_admin", "0".repeat(64));
    assert.equal(await getAdminAccess(), null);
    __setTestCookie("elf_admin", undefined);
    __setTestCookie("elf_session", makeAccountCookie("acct-pa", "wrong-salt"));
    assert.equal(await getAdminAccess(), null);
  });
});

const templates = () => import("../app/api/admin/organization/templates/route.ts");
const pkg = () => import("../app/api/admin/organization/sponsor-packages/[id]/route.ts");

test("legacy admin APIs: coach and anonymous refused before any write; Platform Admin and shared password allowed", async () => {
  for (const who of ["nobody", "coach"] as const) {
    await as(who, async w => {
      assert.equal((await (await templates()).GET(req(`/x?organizationId=${ORG}`))).status, 401);
      assert.equal((await (await templates()).PUT(req("/x", "PUT", { organizationId: ORG, type: "welcome", subject: "s", body_text: "b" }))).status, 401);
      assert.equal(w.writes.length, 0, who);
    });
  }
  for (const who of ["platform", "shared"] as const) {
    await as(who, async () => assert.equal((await (await templates()).GET(req(`/x?organizationId=${ORG}`))).status, 200, who));
  }
});

test("admin writes are attributed: the individual Platform Admin, or admin_tool for the shared password; body identity ignored", async () => {
  await as("platform", async w => {
    const res = await (await templates()).PUT(req("/x", "PUT", { organizationId: ORG, type: "welcome", subject: "s", body_text: "b", actor: { type: "platform_admin", id: "pa-forged" }, admin_identifier: "someone" }));
    assert.equal(res.status, 200);
    const [a] = audits(w);
    assert.equal(a.action, "communication_template.updated");
    assert.equal(a.actor_type, "platform_admin");
    assert.equal(a.actor_id, "pa-1");
    assert.equal(a.actor_email, "pa@elf.test");
    assert.equal(a.admin_identifier, "pa@elf.test");
    assert.equal(a.user_agent, "qa-agent");
    assert.equal((a.new_value as Row).organization_id, ORG, "audit names the school");
  });
  await as("shared", async w => {
    const res = await (await pkg()).DELETE(req(`/x?organizationId=${ORG}`, "DELETE"), { params: Promise.resolve({ id: "pkg-1" }) });
    assert.equal(res.status, 200);
    const [a] = audits(w);
    assert.equal(a.action, "sponsor_package.deleted");
    assert.equal(a.actor_type, "admin_tool");
    assert.equal(a.actor_id, null);
    assert.equal(a.admin_identifier, "admin");
    assert.equal((a.new_value as Row).organization_id, ORG, "audit names the school");
  });
});

test("legacy admin APIs keep School Linking scoping: no school or another school is refused, without a write or audit", async () => {
  await as("platform", async w => {
    assert.equal((await (await templates()).GET(req("/x"))).status, 400);
    assert.equal((await (await templates()).PUT(req("/x", "PUT", { type: "welcome", subject: "s", body_text: "b" }))).status, 400);
    const other = "00000000-0000-4000-8000-0000000000b2";
    assert.equal((await (await pkg()).DELETE(req(`/x?organizationId=${other}`, "DELETE"), { params: Promise.resolve({ id: "pkg-1" }) })).status, 404);
    assert.equal(w.db.sponsor_packages.length, 1, "another school's package id cannot be deleted");
    assert.equal(audits(w).length, 0);
  });
});

test("demo launcher never mints the anonymous shared-password cookie for a Platform Admin", async () => {
  const launch = await import("../app/api/admin/demo/launch/route.ts");
  await as("platform", async () => {
    const res = await launch.GET(req("/api/admin/demo/launch?persona=admin"));
    assert.ok([302, 307].includes(res.status));
    assert.match(String(res.headers.get("location")), /\/admin\/dashboard$/);
    assert.doesNotMatch(String(res.headers.get("set-cookie") ?? ""), /elf_admin=/);
  });
  await as("nobody", async () => {
    const res = await launch.GET(req("/api/admin/demo/launch?persona=admin"));
    assert.match(String(res.headers.get("location")), /\/admin$/);
  });
});
