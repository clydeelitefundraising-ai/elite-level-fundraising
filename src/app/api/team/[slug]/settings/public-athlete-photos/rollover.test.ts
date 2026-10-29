// Phase T7 — season rollover safeguard for Public Athlete Photos: the first
// time a Head Coach turns photos on in a new season, athletes hidden in an
// earlier season start hidden again, written BEFORE the setting is turned on
// (fail closed). Real handlers + account cookies, fetch-mocked PostgREST.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.ELF_ACCOUNT_PEPPER        = "fake-account-pepper";

register(new URL("../../../../../../lib/testSupport/nextStubLoader.mjs", import.meta.url).href, import.meta.url);

const { __setTestCookie } = await import("../../../../../../lib/testSupport/nextHeadersStub.mjs");
const { makeAccountCookie } = await import("@/lib/accountAuth");
const settingsRoute = await import("./route.ts");
const athletesRoute = await import("./athletes/route.ts");
const photoRoute = await import("../../../../campaign-photo/[slug]/[athleteId]/route.ts");
const { PUBLIC_PHOTO_CONFIRMATION_VERSION } = await import("@/lib/publicAthletePhotos");

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUB = `${SB}/storage/v1/object/public`;
type Row = Record<string, unknown>;
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const HEAD = { id: U(900), salt: "s1" };
const SLUG = "lions-2027";

// Earlier seasons: 2025 had the setting configured (its choices are decisions),
// 2026 never did (no decisions made there).
const A25 = U(101), B25 = U(102), C25 = U(103), H25 = U(108);
const C26 = U(203), H26 = U(208);
// Current season (2027).
const CUR = { A: U(301), B: U(302), C: U(303), E: U(305), F: U(306), H: U(308), X: U(309) };

function athlete(id: string, slug: string, prev: string | null, excluded: boolean, name: string): Row {
  return { id, campaign_slug: slug, name, previous_season_athlete_id: prev, public_photo_excluded: excluded,
    profile_photo: `${PUB}/athlete-photos/${slug}/${id}.jpg` };
}

function makeWorld() {
  const db: Record<string, Row[]> = {
    elf_accounts: [{ id: HEAD.id, name: "Hana Head", email: "h@example.test", salt: HEAD.salt, profile_photo_url: null }],
    team_coaches: [{ id: "c1", account_id: HEAD.id, campaign_slug: SLUG, role: "head_coach", name: "Hana Head" }],
    team_members: [],
    platform_admins: [],
    campaign_settings: [
      { campaign_slug: "lions-2025", public_athlete_photos: false, public_athlete_photos_changed_at: "2025-03-01T00:00:00Z", archived: true, fundraising_enabled: true, season_completed_at: "2025-06-01T00:00:00Z" },
      { campaign_slug: "lions-2026", public_athlete_photos: false, public_athlete_photos_changed_at: null, archived: true, fundraising_enabled: true, season_completed_at: "2026-06-01T00:00:00Z" },
      { campaign_slug: SLUG, public_athlete_photos: false, public_athlete_photos_changed_at: null, public_athlete_photos_changed_by: null,
        archived: false, fundraising_enabled: true, season_completed_at: null, successor_campaign_slug: null, school_name: "Lions" },
    ],
    athletes: [
      athlete(A25, "lions-2025", null, true, "Ava"),   // hidden in a configured season
      athlete(B25, "lions-2025", null, false, "Ben"),  // shown by choice in a configured season
      athlete(C25, "lions-2025", null, true, "Cy"),    // hidden two seasons back...
      athlete(C26, "lions-2026", C25, false, "Cy"),    // ...through a season that never configured it
      athlete(H25, "lions-2025", null, false, "Hal"),
      athlete(H26, "lions-2026", H25, false, "Hal"),
      athlete(CUR.A, SLUG, A25, false, "Ava"),
      athlete(CUR.B, SLUG, B25, false, "Ben"),
      athlete(CUR.C, SLUG, C26, false, "Cy"),
      athlete(CUR.E, SLUG, U(999), false, "Eve"),      // broken link
      athlete(CUR.F, SLUG, null, false, "Fay"),        // new this season
      athlete(CUR.H, SLUG, H26, false, "Hal"),
      athlete(CUR.X, SLUG, B25, true, "Xia"),          // already hidden this season
    ],
    audit_logs: [],
  };
  const writes: { table: string; method: string; query: string }[] = [];
  const control: { fail?: (method: string, table: string, query: string) => boolean } = {};

  async function fetchImpl(url: string, init?: RequestInit): Promise<Response> {
    const method = init?.method ?? "GET";
    if (url.startsWith(`${PUB}/`)) return new Response(new Uint8Array([1]), { status: 200, headers: { "content-type": "image/jpeg" } });
    const [table, query = ""] = url.replace(`${SB}/rest/v1/`, "").split("?");
    if (control.fail?.(method, table, decodeURIComponent(query))) return new Response("boom", { status: 500 });
    const filters = [...new URLSearchParams(query).entries()].filter(([k]) => !["select", "limit", "order"].includes(k));
    const match = (r: Row) => filters.every(([k, v]) =>
      v === "not.is.null" ? r[k] != null
        : v.startsWith("in.(") ? v.slice(4, -1).split(",").includes(String(r[k]))
        : !v.startsWith("eq.") || String(r[k]) === v.slice(3));
    const rows = (db[table] ?? []).filter(match);
    if (method === "GET") return new Response(JSON.stringify(rows), { status: 200 });
    writes.push({ table, method, query: decodeURIComponent(query) });
    const body = init?.body ? JSON.parse(String(init.body)) as Row : {};
    if (method === "PATCH") { for (const r of rows) Object.assign(r, body); return new Response(null, { status: 204 }); }
    if (method === "POST") { (db[table] ??= []).push({ ...body }); return new Response(null, { status: 201 }); }
    return new Response("not implemented", { status: 500 });
  }
  return { db, writes, control, fetchImpl };
}

type World = ReturnType<typeof makeWorld>;
async function inWorld(run: (w: World) => Promise<void>) {
  const w = makeWorld();
  const real = globalThis.fetch;
  globalThis.fetch = w.fetchImpl as typeof fetch;
  __setTestCookie("elf_session", makeAccountCookie(HEAD.id, HEAD.salt));
  try { await run(w); await new Promise(r => setTimeout(r, 20)); } finally { globalThis.fetch = real; __setTestCookie("elf_session", undefined); }
}

const ctx = { params: Promise.resolve({ slug: SLUG }) };
const req = (body: unknown) => new Request("http://test.local/x", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) as never;
const enable = () => settingsRoute.PATCH(req({ enabled: true, confirm: true, confirmation_version: PUBLIC_PHOTO_CONFIRMATION_VERSION }), ctx);
const disable = () => settingsRoute.PATCH(req({ enabled: false }), ctx);
const setHidden = (id: string, excluded: boolean) => athletesRoute.PATCH(req({ athlete_id: id, excluded }), ctx);
const hidden = (w: World, id: string) => w.db.athletes.find(a => a.id === id)!.public_photo_excluded;
const settingOn = (w: World) => w.db.campaign_settings.find(c => c.campaign_slug === SLUG)!.public_athlete_photos;
const photo = async (id: string) =>
  (await photoRoute.GET(new Request("http://test.local/p") as never, { params: Promise.resolve({ slug: SLUG, athleteId: id }) })).status;

test("first enable this season: earlier-season exclusions are re-applied BEFORE photos turn on", async () => {
  await inWorld(async w => {
    const res = await enable();
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.deepEqual([...data.carried_over].sort(), [CUR.A, CUR.C].sort());
    assert.equal(hidden(w, CUR.A), true, "hidden last configured season");
    assert.equal(hidden(w, CUR.C), true, "hidden two seasons back, through a season that never configured it");
    assert.equal(hidden(w, CUR.B), false, "shown by choice in a configured season — not hidden");
    assert.equal(hidden(w, CUR.H), false, "chain ends at a configured season that showed them");
    assert.equal(hidden(w, CUR.E), false, "broken link carries nothing");
    assert.equal(hidden(w, CUR.F), false, "new athlete");
    assert.equal(hidden(w, CUR.X), true, "already hidden this season stays hidden");
    const athletesWrite = w.writes.findIndex(x => x.table === "athletes");
    const settingWrite = w.writes.findIndex(x => x.table === "campaign_settings");
    assert.ok(athletesWrite >= 0 && athletesWrite < settingWrite, "exclusions written before the setting is turned on");
    assert.ok(w.writes.filter(x => x.table === "athletes").every(x => x.query.includes(`campaign_slug=eq.${SLUG}`)), "only this season's rows");
    assert.equal(hidden(w, A25), true, "earlier season untouched");
    const audit = w.db.audit_logs.find(a => a.action === "team_settings.public_athlete_photos_exclusions_carried_over")!;
    assert.deepEqual([...(audit.new_value as { athlete_ids: string[] }).athlete_ids].sort(), [CUR.A, CUR.C].sort());
    assert.equal(await photo(CUR.A), 404);
    assert.equal(await photo(CUR.C), 404);
    assert.equal(await photo(CUR.B), 200);
  });
});

test("settings list marks carried-over exclusions", async () => {
  await inWorld(async () => {
    await enable();
    const data = await (await settingsRoute.GET(new Request("http://test.local/x") as never, ctx)).json();
    const row = (id: string) => data.athletes.find((a: Row) => a.id === id);
    assert.equal(row(CUR.A).inherited, true);
    assert.equal(row(CUR.C).inherited, true);
    assert.equal(row(CUR.X).inherited, false, "hidden this season by the coach, not carried over");
    assert.equal(row(CUR.B).inherited, false);
  });
});

test("fail closed: if the carry-over write fails, photos stay OFF and nothing is published", async () => {
  await inWorld(async w => {
    w.control.fail = (method, table) => method === "PATCH" && table === "athletes";
    const res = await enable();
    assert.equal(res.status, 500);
    assert.equal(settingOn(w), false);
    assert.ok(!w.writes.some(x => x.table === "campaign_settings"));
    assert.equal(await photo(CUR.A), 404);
    assert.equal(await photo(CUR.B), 404, "nothing public at all");
  });
});

test("fail closed: if last season's records can't be read, photos stay OFF", async () => {
  await inWorld(async w => {
    w.control.fail = (method, table, query) => method === "GET" && table === "athletes" && query.includes("id=in.(");
    assert.equal((await enable()).status, 500);
    assert.equal(settingOn(w), false);
    assert.deepEqual(w.writes, []);
  });
});

test("Head Coach decisions after the first enable stand; re-enabling never re-hides or un-hides", async () => {
  await inWorld(async w => {
    await enable();
    assert.equal((await setHidden(CUR.A, false)).status, 200, "coach shows Ava this season");
    assert.equal((await setHidden(CUR.F, true)).status, 200, "coach hides Fay");
    await disable();
    const res = await enable();
    assert.deepEqual((await res.json()).carried_over, [], "no second carry-over");
    assert.equal(hidden(w, CUR.A), false, "coach's choice kept");
    assert.equal(hidden(w, CUR.F), true, "coach's choice kept");
    assert.equal(hidden(w, CUR.C), true, "carried exclusion not undone");
    assert.equal(w.db.audit_logs.filter(a => a.action === "team_settings.public_athlete_photos_exclusions_carried_over").length, 1);
  });
});

test("turning OFF while already off changes nothing — the first real enable still carries over", async () => {
  await inWorld(async w => {
    assert.equal((await disable()).status, 200);
    assert.deepEqual(w.writes, [], "no write, season not marked as configured");
    const res = await enable();
    assert.equal((await res.json()).carried_over.length, 2);
  });
});
