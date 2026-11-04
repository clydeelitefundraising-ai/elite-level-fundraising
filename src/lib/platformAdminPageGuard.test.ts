// Security hotfix — every /platform-admin page checks the Platform Admin
// account itself, before reading any data, because a redirect thrown by the
// layout alone still let pages render into the signed-out response.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.ELF_ACCOUNT_PEPPER        = "fake-account-pepper";
process.env.ADMIN_PASSWORD            = "fake-shared-password";
process.env.ADMIN_PEPPER              = "fake-admin-pepper";

register(new URL("./testSupport/nextStubLoader.mjs", import.meta.url).href, import.meta.url);

const { __setTestCookie } = await import("./testSupport/nextHeadersStub.mjs");
const { makeAccountCookie } = await import("@/lib/accountAuth");
const { getAdminToken } = await import("@/lib/adminAuth");
const { requirePlatformAdminPage } = await import("./platformAdminPageGuard.ts");

const ROOT = process.cwd();
const PA = join(ROOT, "src/app/platform-admin");
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const rel = (p: string) => relative(ROOT, p).split(sep).join("/");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// ── Behaviour: who gets through ─────────────────────────────────────────────

type Row = Record<string, unknown>;
function fakeDb(seed: (db: Record<string, Row[]>) => void) {
  const db: Record<string, Row[]> = { elf_accounts: [], platform_admins: [] };
  seed(db);
  const requested: string[] = [];
  const fetchImpl = async (url: string) => {
    const [table, query] = url.replace(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, "").split("?");
    requested.push(table);
    const params = new URLSearchParams(query ?? "");
    let rows = db[table] ?? [];
    for (const [k, v] of params) if (!["select", "limit", "order"].includes(k) && v.startsWith("eq.")) rows = rows.filter(r => String(r[k]) === v.slice(3));
    return new Response(JSON.stringify(rows), { status: 200 });
  };
  return { requested, fetchImpl };
}

async function attempt(seed: (db: Record<string, Row[]>) => void, cookies: { session?: string; admin?: string }) {
  const { requested, fetchImpl } = fakeDb(seed);
  __setTestCookie("elf_session", cookies.session);
  __setTestCookie("elf_admin", cookies.admin);
  const realFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl as typeof fetch;
  try {
    const admin = await requirePlatformAdminPage();
    return { admin, redirectTo: null as string | null, requested };
  } catch (err) {
    const to = (err as { redirectTo?: string }).redirectTo;
    if (!to) throw err;
    return { admin: null, redirectTo: to, requested };
  } finally {
    globalThis.fetch = realFetch;
    __setTestCookie("elf_session", undefined);
    __setTestCookie("elf_admin", undefined);
  }
}

const ADMIN = { id: "acct-admin", salt: "s-admin" };
const COACH = { id: "acct-coach", salt: "s-coach" };
const seedBoth = (db: Record<string, Row[]>) => {
  db.elf_accounts.push({ id: ADMIN.id, email: "pa@example.test", name: "PA One", salt: ADMIN.salt, profile_photo_url: null });
  db.elf_accounts.push({ id: COACH.id, email: "coach@example.test", name: "Coach Two", salt: COACH.salt, profile_photo_url: null });
  db.platform_admins.push({ id: "pa-1", account_id: ADMIN.id, role: "platform_admin" });
};

test("signed out: redirected to /login without reading anything beyond the session", async () => {
  const r = await attempt(seedBoth, {});
  assert.equal(r.redirectTo, "/login");
  assert.deepEqual(r.requested.filter(t => !["elf_accounts", "platform_admins"].includes(t)), []);
});

test("the shared /admin password never opens Platform Admin", async () => {
  const token = getAdminToken();
  assert.ok(token, "test token");
  const r = await attempt(seedBoth, { admin: token! });
  assert.equal(r.redirectTo, "/login");
  const src = read(join(ROOT, "src/lib/platformAdminPageGuard.ts"));
  assert.doesNotMatch(src.replace(/^\s*\/\/.*$/gm, ""), /adminAuth|adminAccess|elf_admin|verifyToken|getAdminAccess/);
});

test("a signed-in account that isn't a Platform Admin is sent to /teams", async () => {
  const r = await attempt(seedBoth, { session: makeAccountCookie(COACH.id, COACH.salt) });
  assert.equal(r.redirectTo, "/teams");
});

test("a removed Platform Admin row takes effect on the next request", async () => {
  const r = await attempt(db => { seedBoth(db); db.platform_admins.length = 0; }, { session: makeAccountCookie(ADMIN.id, ADMIN.salt) });
  assert.equal(r.redirectTo, "/teams");
});

test("a forged or stale session cookie is treated as signed out", async () => {
  const r = await attempt(seedBoth, { session: makeAccountCookie(ADMIN.id, "wrong-salt") });
  assert.equal(r.redirectTo, "/login");
});

test("a Platform Admin passes and gets their identity", async () => {
  const r = await attempt(seedBoth, { session: makeAccountCookie(ADMIN.id, ADMIN.salt), admin: getAdminToken()! });
  assert.equal(r.redirectTo, null);
  assert.equal(r.admin?.accountId, ADMIN.id);
  assert.equal(r.admin?.platformAdminId, "pa-1");
});

// ── Every page and entry point under /platform-admin ────────────────────────

const pages = walk(PA).filter(p => p.endsWith(`${sep}page.tsx`));

test("inventory: the protected pages this hotfix covers", () => {
  assert.deepEqual(pages.map(rel).sort(), [
    "src/app/platform-admin/analytics/page.tsx",
    "src/app/platform-admin/fundraising-inquiries/page.tsx",
    "src/app/platform-admin/fundraising/page.tsx",
    "src/app/platform-admin/moderation/page.tsx",
    "src/app/platform-admin/my-teams/page.tsx",
    "src/app/platform-admin/page.tsx",
    "src/app/platform-admin/partners/page.tsx",
    "src/app/platform-admin/people/page.tsx",
    "src/app/platform-admin/reports/page.tsx",
    "src/app/platform-admin/sales/page.tsx",
    "src/app/platform-admin/school-links/[slug]/page.tsx",
    "src/app/platform-admin/school-links/page.tsx",
    "src/app/platform-admin/schools/[schoolId]/page.tsx",
    "src/app/platform-admin/schools/page.tsx",
    "src/app/platform-admin/settings/page.tsx",
    "src/app/platform-admin/teams/page.tsx",
  ].sort(), "a new page must be added here deliberately — and must start with the check below");
});

/** The statements of the default export's body, comments removed. */
function defaultExportBody(src: string, file: string): string {
  const e = src.indexOf("export default async function");
  assert.ok(e >= 0, `${file}: default export must be an async function`);
  const open = src.indexOf(") {\n", e);
  assert.ok(open > e, `${file}: default export body`);
  return src.slice(open + 4).replace(/^\s*\/\/.*\n/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

test("every page runs requirePlatformAdminPage() as its FIRST statement — before params, data or rendering", () => {
  for (const p of pages) {
    const src = read(p);
    const body = defaultExportBody(src, rel(p)).trimStart();
    assert.match(body, /^(const admin = )?await requirePlatformAdminPage\(\);\n/, `${rel(p)} must start with the Platform Admin check`);
    assert.match(src, /^import \{ requirePlatformAdminPage \} from "@\/lib\/platformAdminPageGuard";$/m, rel(p));
    // Nothing runs at module load that could read data for an unchecked request.
    assert.doesNotMatch(src.slice(0, src.indexOf("export default")), /\bawait\b/, `${rel(p)}: no top-level await`);
    assert.doesNotMatch(src, /getPlatformAdminSession\(\)/, `${rel(p)}: use the shared check, not a second ad-hoc one`);
  }
});

test("the layout keeps the same check (defense in depth), before its own query", () => {
  const layout = read(join(PA, "layout.tsx"));
  const guard = layout.indexOf("await requirePlatformAdminPage()");
  assert.ok(guard > 0);
  assert.ok(guard < layout.indexOf("countNewFundraisingInquiries()"), "the check precedes the inquiry count");
  assert.doesNotMatch(layout, /adminAuth|adminAccess|elf_admin/);
});

test("no other entry points under /platform-admin that could bypass the page check", () => {
  const files = walk(PA).filter(p => !p.includes(".test."));
  const names = files.map(p => p.split(sep).pop()!);
  for (const special of ["route.ts", "route.tsx", "loading.tsx", "template.tsx", "default.tsx", "error.tsx", "not-found.tsx", "head.tsx"]) {
    assert.ok(!names.includes(special), `${special} under /platform-admin needs its own review`);
  }
  for (const f of files) {
    const src = read(f);
    assert.doesNotMatch(src, /generateMetadata|generateStaticParams|"use server"/, `${rel(f)}: metadata, static params and server actions bypass the page check`);
  }
});

test("Platform Admin API routes check the account in every handler", () => {
  const routes = walk(join(ROOT, "src/app/api/platform-admin")).filter(p => p.endsWith(`${sep}route.ts`));
  assert.ok(routes.length > 0);
  for (const r of routes) {
    const src = read(r);
    const handlers = [...src.matchAll(/export async function (GET|POST|PATCH|PUT|DELETE)\b/g)].length;
    const checks = [...src.matchAll(/await getPlatformAdminSession\(\)/g)].length;
    assert.ok(handlers > 0 && checks >= handlers, `${rel(r)}: ${checks} checks for ${handlers} handlers`);
    assert.doesNotMatch(src, /getAdminAccess|elf_admin/, `${rel(r)}: the shared password never reaches Platform Admin APIs`);
  }
  assert.ok(existsSync(join(ROOT, "src/lib/platformAdminPageGuard.ts")));
});
