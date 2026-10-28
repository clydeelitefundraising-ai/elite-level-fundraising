// Phase T6 — /api/team/[slug]/overview (PATCH) and /overview/banner (POST,
// DELETE). Real route handlers, real account cookies (makeAccountCookie),
// fetch-mocked PostgREST + Storage, real sharp on generated images. Same
// technique as account/team-order/route.test.ts.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.ELF_ACCOUNT_PEPPER        = "fake-account-pepper";

register(new URL("../../../../../lib/testSupport/nextStubLoader.mjs", import.meta.url).href, import.meta.url);

const { __setTestCookie } = await import("../../../../../lib/testSupport/nextHeadersStub.mjs");
const { makeAccountCookie } = await import("@/lib/accountAuth");

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLIC = `${SB}/storage/v1/object/public/team-branding-logos/`;
type Row = Record<string, unknown>;

const ACCOUNTS = {
  head:   { id: "acct-head",   salt: "s1" },
  asst:   { id: "acct-asst",   salt: "s2" },
  parent: { id: "acct-parent", salt: "s3" },
  ath:    { id: "acct-ath",    salt: "s4" },
  admin:  { id: "acct-admin",  salt: "s5" },
  other:  { id: "acct-other",  salt: "s6" },
} as const;

function makeWorld(opts: { completed?: boolean; banner?: string | null } = {}) {
  const db: Record<string, Row[]> = {
    elf_accounts: Object.values(ACCOUNTS).map(a => ({ id: a.id, name: a.id, email: `${a.id}@example.test`, salt: a.salt, profile_photo_url: null })),
    team_coaches: [
      { id: "c1", account_id: "acct-head", campaign_slug: "lions", role: "head_coach", name: "Hana Head" },
      { id: "c2", account_id: "acct-asst", campaign_slug: "lions", role: "assistant_coach", name: "Ann Asst" },
      { id: "c3", account_id: "acct-other", campaign_slug: "hawks", role: "head_coach", name: "Other Head" },
    ],
    team_members: [
      { id: "m1", account_id: "acct-parent", campaign_slug: "lions", role: "parent", name: "Pat Parent", athlete_id: "a1" },
      { id: "m2", account_id: "acct-ath", campaign_slug: "lions", role: "athlete", name: "Jo Junior", athlete_id: "a1" },
    ],
    platform_admins: [{ id: "pa1", account_id: "acct-admin", role: "admin" }],
    campaign_settings: [
      { campaign_slug: "lions", school_name: "QA Lions High School", location: "Phoenix, AZ", team_banner_url: opts.banner ?? null,
        season_completed_at: opts.completed ? "2026-10-01T00:00:00Z" : null, successor_campaign_slug: null },
      { campaign_slug: "hawks", school_name: "QA Hawks", location: "Tucson, AZ", team_banner_url: null, season_completed_at: null, successor_campaign_slug: null },
    ],
    audit_logs: [],
  };
  const writes: { table: string; method: string; query: string; body: Row | null }[] = [];
  const storage: { method: string; path: string; type: string | null; bytes: number }[] = [];

  async function fetchImpl(url: string, init?: RequestInit): Promise<Response> {
    const method = init?.method ?? "GET";
    if (url.startsWith(`${SB}/storage/v1/object/`)) {
      const path = url.slice(`${SB}/storage/v1/object/`.length);
      const h = (init?.headers ?? {}) as Record<string, string>;
      const body = init?.body as unknown as Buffer | undefined;
      storage.push({ method, path, type: h["Content-Type"] ?? null, bytes: body?.byteLength ?? 0 });
      return new Response("{}", { status: 200 });
    }
    const path = url.replace(`${SB}/rest/v1/`, "");
    const [table, query = ""] = path.split("?");
    const body = init?.body ? JSON.parse(String(init.body)) as Row : null;
    const rows = db[table] ?? [];
    const filters = [...new URLSearchParams(query).entries()].filter(([k]) => !["select", "limit", "order"].includes(k));
    const match = (r: Row) => filters.every(([k, v]) => !v.startsWith("eq.") || String(r[k]) === v.slice(3));
    if (method === "GET") return new Response(JSON.stringify(rows.filter(match)), { status: 200 });
    writes.push({ table, method, query, body });
    if (method === "PATCH") { for (const r of rows.filter(match)) Object.assign(r, body); return new Response(null, { status: 204 }); }
    if (method === "POST") { rows.push({ ...body }); return new Response(null, { status: 201 }); }
    return new Response("not implemented", { status: 500 });
  }
  return { db, writes, storage, fetchImpl };
}

async function withWorld<T>(opts: Parameters<typeof makeWorld>[0], who: keyof typeof ACCOUNTS | null, run: (w: ReturnType<typeof makeWorld>) => Promise<T>): Promise<T> {
  const w = makeWorld(opts);
  const realFetch = globalThis.fetch;
  globalThis.fetch = w.fetchImpl as typeof fetch;
  if (who) __setTestCookie("elf_session", makeAccountCookie(ACCOUNTS[who].id, ACCOUNTS[who].salt));
  try {
    return await run(w);
  } finally {
    globalThis.fetch = realFetch;
    __setTestCookie("elf_session", undefined);
  }
}

const ctx = (slug = "lions") => ({ params: Promise.resolve({ slug }) });
const patchReq = (body: unknown) => new Request("https://app.example.com/api/team/lions/overview", {
  method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
function bannerReq(file?: File) {
  const form = new FormData();
  if (file) form.append("banner", file);
  return new Request("https://app.example.com/api/team/lions/overview/banner", { method: "POST", body: form });
}
const delReq = () => new Request("https://app.example.com/api/team/lions/overview/banner", { method: "DELETE" });
const campaignWrites = (w: ReturnType<typeof makeWorld>) => w.writes.filter(x => x.table === "campaign_settings");

async function jpeg(width: number, height: number) {
  const buf = await sharp({ create: { width, height, channels: 3, background: { r: 30, g: 60, b: 120 } } }).jpeg().toBuffer();
  return new File([new Uint8Array(buf)], "banner.jpg", { type: "image/jpeg" });
}

const overview = () => import("./route.ts");
const banner = () => import("./banner/route.ts");

// ── Permissions ──────────────────────────────────────────────────────────

for (const who of ["asst", "parent", "ath", "other", null] as const) {
  test(`${who ?? "signed-out"}: cannot edit About, location or banner — 403, nothing written`, async () => {
    await withWorld({}, who, async w => {
      const { PATCH } = await overview();
      const { POST, DELETE } = await banner();
      for (const res of [
        await PATCH(patchReq({ team_about: "Hijack" }) as never, ctx()),
        await PATCH(patchReq({ location: { street: "1 Evil St", city_state: "X, YZ", zip: "" } }) as never, ctx()),
        await POST(bannerReq(await jpeg(1280, 720)) as never, ctx()),
        await DELETE(delReq() as never, ctx()),
      ]) assert.equal(res.status, 403);
      assert.equal(campaignWrites(w).length, 0);
      assert.equal(w.storage.length, 0);
    });
  });
}

test("a Head Coach of another team cannot write this team (team isolation)", async () => {
  await withWorld({}, "other", async w => {
    const { PATCH } = await overview();
    assert.equal((await PATCH(patchReq({ team_about: "x" }) as never, ctx("lions"))).status, 403);
    assert.equal(w.db.campaign_settings[0].team_about, undefined);
  });
});

test("completed season: even the Head Coach gets 409, nothing written", async () => {
  await withWorld({ completed: true }, "head", async w => {
    const { PATCH } = await overview();
    const { POST } = await banner();
    assert.equal((await PATCH(patchReq({ team_about: "x" }) as never, ctx())).status, 409);
    assert.equal((await POST(bannerReq(await jpeg(1280, 720)) as never, ctx())).status, 409);
    assert.equal(campaignWrites(w).length, 0);
  });
});

// ── About / location ─────────────────────────────────────────────────────

test("Head Coach saves About: normalized text, only team_about written, audit-logged", async () => {
  await withWorld({}, "head", async w => {
    const { PATCH } = await overview();
    const res = await PATCH(patchReq({ team_about: "Line one\r\nline two\r\n\r\n\r\nPara two  " }) as never, ctx());
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, team_about: "Line one\nline two\n\nPara two" });
    assert.deepEqual(campaignWrites(w).map(x => x.body), [{ team_about: "Line one\nline two\n\nPara two" }]);
    assert.match(campaignWrites(w)[0].query, /campaign_slug=eq\.lions/);
    assert.equal(w.db.audit_logs.length, 1);
    assert.equal(w.db.audit_logs[0].action, "team_overview.about_updated");
  });
});

test("Platform admin can edit (existing isHeadCoach convention)", async () => {
  await withWorld({}, "admin", async w => {
    const { PATCH } = await overview();
    assert.equal((await PATCH(patchReq({ team_about: "From admin" }) as never, ctx())).status, 200);
    assert.equal(w.db.campaign_settings[0].team_about, "From admin");
  });
});

test("About over the limit, non-text, or both/neither sections -> 400", async () => {
  await withWorld({}, "head", async w => {
    const { PATCH } = await overview();
    for (const body of [{ team_about: "a".repeat(3001) }, { team_about: 5 }, {}, { team_about: "a", location: { street: "", city_state: "", zip: "" } }]) {
      assert.equal((await PATCH(patchReq(body) as never, ctx())).status, 400, JSON.stringify(body).slice(0, 60));
    }
    assert.equal(campaignWrites(w).length, 0);
  });
});

test("Head Coach saves location: only the 3 location columns are written", async () => {
  await withWorld({}, "head", async w => {
    const { PATCH } = await overview();
    const res = await PATCH(patchReq({ location: { street: "800 Lion Drive", city_state: "Phoenix, AZ", zip: "85001" }, school_name: "Hacked" }) as never, ctx());
    assert.equal(res.status, 200);
    assert.deepEqual(campaignWrites(w).map(x => x.body), [{ location_street: "800 Lion Drive", location: "Phoenix, AZ", location_zip: "85001" }]);
    assert.equal(w.db.campaign_settings[0].school_name, "QA Lions High School");
    // invalid location is rejected
    assert.equal((await PATCH(patchReq({ location: { street: "1 Main", city_state: "", zip: "" } }) as never, ctx())).status, 400);
  });
});

// ── Banner ───────────────────────────────────────────────────────────────

test("Head Coach uploads a banner: re-encoded WebP, stored under this team's banner prefix, URL saved", async () => {
  await withWorld({}, "head", async w => {
    const { POST } = await banner();
    const res = await POST(bannerReq(await jpeg(3000, 1688)) as never, ctx());
    assert.equal(res.status, 200);
    const { team_banner_url } = await res.json() as { team_banner_url: string };
    assert.match(team_banner_url, /^https:\/\/fake\.supabase\.co\/storage\/v1\/object\/public\/team-branding-logos\/lions\/banner\/\d+-[a-z0-9]+\.webp$/);
    assert.equal(w.storage.length, 1);
    assert.equal(w.storage[0].method, "POST");
    assert.equal(w.storage[0].type, "image/webp");
    assert.equal(w.db.campaign_settings[0].team_banner_url, team_banner_url);
    assert.deepEqual(campaignWrites(w).map(x => Object.keys(x.body ?? {})), [["team_banner_url"]]);
  });
});

test("replacing a banner deletes only this team's previous banner object", async () => {
  const old = `${PUBLIC}lions/banner/1-old.webp`;
  await withWorld({ banner: old }, "head", async w => {
    const { POST } = await banner();
    assert.equal((await POST(bannerReq(await jpeg(1280, 720)) as never, ctx())).status, 200);
    assert.deepEqual(w.storage.map(s => `${s.method} ${s.path.replace(/\d{13}-[a-z0-9]+\.webp$/, "NEW.webp")}`),
      ["POST team-branding-logos/lions/banner/NEW.webp", "DELETE team-branding-logos/lions/banner/1-old.webp"]);
  });
});

test("removing a banner clears it; an unowned stored URL is never deleted from storage", async () => {
  await withWorld({ banner: `${PUBLIC}lions/banner/1-old.webp` }, "head", async w => {
    const { DELETE } = await banner();
    assert.equal((await DELETE(delReq() as never, ctx())).status, 200);
    assert.equal(w.db.campaign_settings[0].team_banner_url, null);
    assert.deepEqual(w.storage.map(s => `${s.method} ${s.path}`), ["DELETE team-branding-logos/lions/banner/1-old.webp"]);
  });
  await withWorld({ banner: `${PUBLIC}hawks/banner/1-theirs.webp` }, "head", async w => {
    const { DELETE } = await banner();
    assert.equal((await DELETE(delReq() as never, ctx())).status, 200);
    assert.equal(w.storage.length, 0);
  });
});

test("invalid uploads are rejected gracefully: missing, wrong type, too large, too small, not an image", async () => {
  await withWorld({}, "head", async w => {
    const { POST } = await banner();
    const cases: [File | undefined, number][] = [
      [undefined, 400],
      [new File(["<svg/>"], "x.svg", { type: "image/svg+xml" }), 400],
      [new File([new Uint8Array(8 * 1024 * 1024 + 1)], "big.jpg", { type: "image/jpeg" }), 413],
      [await jpeg(400, 300), 422],
      [new File(["definitely not a jpeg"], "fake.jpg", { type: "image/jpeg" }), 422],
    ];
    for (const [file, status] of cases) {
      const res = await POST(bannerReq(file) as never, ctx());
      assert.equal(res.status, status, file?.name ?? "missing");
      assert.ok((await res.json() as { error: string }).error);
    }
    assert.equal(w.storage.length, 0);
    assert.equal(campaignWrites(w).length, 0);
  });
});
