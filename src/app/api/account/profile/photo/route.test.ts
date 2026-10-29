// /api/account/profile/photo — the account photo is copied onto the athlete
// row only for the athlete themself, never onto a parent's linked child
// (that row's photo is what the public athlete fundraising page shows).
// Real handlers + account cookies, fetch-mocked PostgREST + Storage.
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
const { POST, DELETE } = await import("./route.ts");

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
type Row = Record<string, unknown>;
const ACCOUNTS = { parent: { id: "acct-parent", salt: "s1" }, ath: { id: "acct-ath", salt: "s2" } } as const;

function makeWorld() {
  const db: Record<string, Row[]> = {
    elf_accounts: Object.values(ACCOUNTS).map(a => ({ id: a.id, name: a.id, email: `${a.id}@example.test`, salt: a.salt, profile_photo_url: null })),
    team_members: [
      { id: "m1", account_id: "acct-parent", campaign_slug: "lions", role: "parent", athlete_id: "kid" },
      { id: "m2", account_id: "acct-ath", campaign_slug: "lions", role: "athlete", athlete_id: "self" },
    ],
    athletes: [
      { id: "kid", campaign_slug: "lions", profile_photo: "KID-ORIGINAL" },
      { id: "self", campaign_slug: "lions", profile_photo: null },
    ],
  };
  const athletePatches: { query: string; body: Row }[] = [];
  async function fetchImpl(url: string, init?: RequestInit): Promise<Response> {
    const method = init?.method ?? "GET";
    if (url.startsWith(`${SB}/storage/v1/object/`)) return new Response("{}", { status: 200 });
    const [table, query = ""] = url.replace(`${SB}/rest/v1/`, "").split("?");
    const filters = [...new URLSearchParams(query).entries()].filter(([k]) => !["select", "limit", "order"].includes(k));
    const match = (r: Row) => filters.every(([k, v]) =>
      v === "not.is.null" ? r[k] != null : !v.startsWith("eq.") || String(r[k]) === v.slice(3));
    const rows = (db[table] ?? []).filter(match);
    if (method === "GET") return new Response(JSON.stringify(rows), { status: 200 });
    const body = JSON.parse(String(init?.body)) as Row;
    if (table === "athletes") athletePatches.push({ query, body });
    for (const r of rows) Object.assign(r, body);
    return new Response(null, { status: 204 });
  }
  return { db, athletePatches, fetchImpl };
}

async function as(who: keyof typeof ACCOUNTS, run: (w: ReturnType<typeof makeWorld>) => Promise<void>) {
  const w = makeWorld();
  const real = globalThis.fetch;
  globalThis.fetch = w.fetchImpl as typeof fetch;
  __setTestCookie("elf_session", makeAccountCookie(ACCOUNTS[who].id, ACCOUNTS[who].salt));
  try {
    await run(w);
    await new Promise(r => setTimeout(r, 30)); // the copy step is fire-and-forget
  } finally {
    globalThis.fetch = real;
    __setTestCookie("elf_session", undefined);
  }
  return w;
}

async function upload() {
  const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#336699" } }).png().toBuffer();
  const form = new FormData();
  form.append("photo", new File([png], "me.png", { type: "image/png" }));
  return POST(new Request("http://test.local/api/account/profile/photo", { method: "POST", body: form }));
}

test("a parent's new profile photo is NOT copied onto their child's athlete row", async () => {
  const w = await as("parent", async () => {
    const res = await upload();
    assert.equal(res.status, 200);
  });
  assert.deepEqual(w.athletePatches, []);
  assert.equal(w.db.athletes.find(a => a.id === "kid")!.profile_photo, "KID-ORIGINAL");
  assert.match(String(w.db.elf_accounts.find(a => a.id === "acct-parent")!.profile_photo_url), /profile-photos\/acct-parent\//, "the parent's own account photo still saves");
});

test("an athlete's new profile photo is still copied onto their own athlete row", async () => {
  const w = await as("ath", async () => {
    assert.equal((await upload()).status, 200);
  });
  assert.equal(w.athletePatches.length, 1);
  assert.equal(w.athletePatches[0].query, "id=eq.self");
  assert.match(String(w.db.athletes.find(a => a.id === "self")!.profile_photo), /\/profile-photos\/acct-ath\//);
});

test("removing a photo: the parent's removal leaves the child's photo; the athlete's clears their own", async () => {
  const p = await as("parent", async () => { assert.equal((await DELETE()).status, 200); });
  assert.deepEqual(p.athletePatches, []);
  const a = await as("ath", async () => { assert.equal((await DELETE()).status, 200); });
  assert.deepEqual(a.athletePatches, [{ query: "id=eq.self", body: { profile_photo: null } }]);
});
