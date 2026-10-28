// Phase T7 — Public Athlete Photos: /api/team/[slug]/settings/public-athlete-photos
// (GET, PATCH) and .../athletes (PATCH), plus the public photo route reading
// the same rows. Real handlers, real account cookies, fetch-mocked PostgREST
// + Storage (same technique as team/[slug]/overview/route.test.ts).
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
const { PUBLIC_PHOTO_CONFIRMATION_VERSION, PUBLIC_PHOTO_CONFIRMATION_TEXT } = await import("@/lib/publicAthletePhotos");

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUB = `${SB}/storage/v1/object/public`;
type Row = Record<string, unknown>;
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const ACCOUNTS = {
  head:   { id: U(901), salt: "s1" },
  asst:   { id: U(902), salt: "s2" },
  parent: { id: U(903), salt: "s3" },
  ath:    { id: U(904), salt: "s4" },
  admin:  { id: U(905), salt: "s5" },
  other:  { id: U(906), salt: "s6" },
} as const;
const JO = U(1), KID = U(2), ROSTER = U(3), HAWK = U(4);

function makeWorld(opts: { completed?: boolean; preMigration?: boolean } = {}) {
  const lions: Row = { campaign_slug: "lions", school_name: "QA Lions", archived: false, fundraising_enabled: true,
    season_completed_at: opts.completed ? "2026-10-01T00:00:00Z" : null, successor_campaign_slug: null };
  if (!opts.preMigration) Object.assign(lions, { public_athlete_photos: false, public_athlete_photos_changed_at: null, public_athlete_photos_changed_by: null });
  const db: Record<string, Row[]> = {
    elf_accounts: Object.values(ACCOUNTS).map(a => ({ id: a.id, name: a.id, email: `${a.id}@example.test`, salt: a.salt, profile_photo_url: null })),
    team_coaches: [
      { id: "c1", account_id: ACCOUNTS.head.id, campaign_slug: "lions", role: "head_coach", name: "Hana Head" },
      { id: "c2", account_id: ACCOUNTS.asst.id, campaign_slug: "lions", role: "assistant_coach", name: "Ann Asst" },
      { id: "c3", account_id: ACCOUNTS.other.id, campaign_slug: "hawks", role: "head_coach", name: "Hal Hawk" },
    ],
    team_members: [
      { id: "m1", account_id: ACCOUNTS.parent.id, campaign_slug: "lions", role: "parent", name: "Pat Parent", athlete_id: KID },
      { id: "m2", account_id: ACCOUNTS.ath.id, campaign_slug: "lions", role: "athlete", name: "Jo Junior", athlete_id: JO },
    ],
    platform_admins: [{ id: "pa1", account_id: ACCOUNTS.admin.id, role: "admin" }],
    campaign_settings: [lions, { campaign_slug: "hawks", school_name: "QA Hawks", archived: false, fundraising_enabled: true, public_athlete_photos: true, season_completed_at: null }],
    athletes: [
      { id: JO, campaign_slug: "lions", name: "Jo Junior", profile_photo: `${PUB}/profile-photos/${ACCOUNTS.ath.id}/own.jpg`, public_photo_excluded: false, previous_season_athlete_id: null },
      { id: KID, campaign_slug: "lions", name: "Kid Parentphoto", profile_photo: `${PUB}/profile-photos/${ACCOUNTS.parent.id}/p.jpg`, public_photo_excluded: false, previous_season_athlete_id: null },
      { id: ROSTER, campaign_slug: "lions", name: "Ray Roster", profile_photo: `${PUB}/athlete-photos/lions/r.jpg`, public_photo_excluded: false, previous_season_athlete_id: null },
      { id: HAWK, campaign_slug: "hawks", name: "Hawk Kid", profile_photo: `${PUB}/athlete-photos/hawks/h.jpg`, public_photo_excluded: false, previous_season_athlete_id: null },
    ],
    audit_logs: [],
  };
  if (opts.preMigration) for (const a of db.athletes) delete a.public_photo_excluded;
  const writes: { table: string; method: string; query: string; body: Row }[] = [];

  async function fetchImpl(url: string, init?: RequestInit): Promise<Response> {
    const method = init?.method ?? "GET";
    if (url.startsWith(`${PUB}/`)) return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/jpeg" } });
    const [table, query = ""] = url.replace(`${SB}/rest/v1/`, "").split("?");
    const params = new URLSearchParams(query);
    const filters = [...params.entries()].filter(([k]) => !["select", "limit", "order"].includes(k));
    const match = (r: Row) => filters.every(([k, v]) =>
      v === "not.is.null" ? r[k] != null : !v.startsWith("eq.") || String(r[k]) === v.slice(3));
    const rows = (db[table] ?? []).filter(match);
    const select = params.get("select");
    if (method === "GET") {
      // PostgREST rejects a select of a column that doesn't exist (pre-migration).
      if (select && select !== "*" && select.split(",").some(c => /^[a-z_]+$/.test(c) && rows.length && !(c in rows[0]))) {
        return new Response(JSON.stringify({ code: "42703" }), { status: 400 });
      }
      return new Response(JSON.stringify(rows), { status: 200 });
    }
    const body = init?.body ? JSON.parse(String(init.body)) as Row : {};
    writes.push({ table, method, query, body });
    if (method === "PATCH") { for (const r of rows) Object.assign(r, body); return new Response(null, { status: 204 }); }
    if (method === "POST") { (db[table] ??= []).push({ ...body }); return new Response(null, { status: 201 }); }
    return new Response("not implemented", { status: 500 });
  }
  return { db, writes, fetchImpl };
}

type World = ReturnType<typeof makeWorld>;
async function inWorld(opts: Parameters<typeof makeWorld>[0], run: (w: World, as: (who: keyof typeof ACCOUNTS | null) => void) => Promise<void>) {
  const w = makeWorld(opts);
  const real = globalThis.fetch;
  globalThis.fetch = w.fetchImpl as typeof fetch;
  const as = (who: keyof typeof ACCOUNTS | null) =>
    __setTestCookie("elf_session", who ? makeAccountCookie(ACCOUNTS[who].id, ACCOUNTS[who].salt) : undefined);
  try { await run(w, as); await new Promise(r => setTimeout(r, 20)); } finally { globalThis.fetch = real; __setTestCookie("elf_session", undefined); }
}

const ctx = (slug = "lions") => ({ params: Promise.resolve({ slug }) });
const json = (body: unknown) => new Request("http://test.local/x", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) as never;
const getSettings = (slug = "lions") => settingsRoute.GET(new Request("http://test.local/x") as never, ctx(slug));
const patchSettings = (body: unknown, slug = "lions") => settingsRoute.PATCH(json(body), ctx(slug));
const patchAthlete = (body: unknown, slug = "lions") => athletesRoute.PATCH(json(body), ctx(slug));
const photo = async (id: string, slug = "lions") =>
  (await photoRoute.GET(new Request("http://test.local/p") as never, { params: Promise.resolve({ slug, athleteId: id }) })).status;
const ENABLE = { enabled: true, confirm: true, confirmation_version: PUBLIC_PHOTO_CONFIRMATION_VERSION };
const lions = (w: World) => w.db.campaign_settings.find(r => r.campaign_slug === "lions")!;

test("default OFF: the Head Coach sees the setting off, with the roster and which athletes have a usable photo", async () => {
  await inWorld({}, async (_w, as) => {
    as("head");
    const res = await getSettings();
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.enabled, false);
    assert.equal(data.available, true);
    assert.equal(data.confirmation_version, PUBLIC_PHOTO_CONFIRMATION_VERSION);
    assert.deepEqual(data.athletes.map((a: Row) => [a.name, a.has_photo, a.excluded]), [
      ["Jo Junior", true, false], ["Kid Parentphoto", false, false], ["Ray Roster", true, false],
    ], "a parent-uploaded photo doesn't count; only this team's athletes");
    assert.equal(await photo(JO), 404, "off → never a photo");
  });
});

test("before the migration: setting reported unavailable, photos stay off", async () => {
  await inWorld({ preMigration: true }, async (_w, as) => {
    as("head");
    const data = await (await getSettings()).json();
    assert.equal(data.available, false);
    assert.equal(data.enabled, false);
    assert.equal(await photo(ROSTER), 404);
  });
});

for (const who of ["asst", "parent", "ath", "other", null] as const) {
  test(`${who ?? "signed out"}: cannot read or change the setting or exclusions (403), nothing written`, async () => {
    await inWorld({}, async (w, as) => {
      as(who);
      assert.equal((await getSettings()).status, 403);
      assert.equal((await patchSettings(ENABLE)).status, 403);
      assert.equal((await patchAthlete({ athlete_id: JO, excluded: true })).status, 403);
      assert.deepEqual(w.writes, []);
      assert.equal(lions(w).public_athlete_photos, false);
    });
  });
}

test("turning ON requires the media-permission confirmation and the current wording version", async () => {
  await inWorld({}, async (w, as) => {
    as("head");
    for (const body of [{ enabled: true }, { enabled: true, confirm: true }, { enabled: true, confirm: false, confirmation_version: PUBLIC_PHOTO_CONFIRMATION_VERSION },
      { enabled: true, confirm: true, confirmation_version: "1999-01-01" }, { enabled: "yes" }, {}]) {
      assert.equal((await patchSettings(body)).status, 400, JSON.stringify(body));
    }
    assert.deepEqual(w.writes, []);
    assert.equal(lions(w).public_athlete_photos, false);
  });
});

test("Head Coach turns it on: who/when recorded on the row and in the audit log with the confirmation wording", async () => {
  await inWorld({}, async (w, as) => {
    as("head");
    const res = await patchSettings(ENABLE);
    assert.equal(res.status, 200);
    const row = lions(w);
    assert.equal(row.public_athlete_photos, true);
    assert.equal(row.public_athlete_photos_changed_by, "Hana Head (Head Coach)");
    assert.ok(Date.now() - Date.parse(String(row.public_athlete_photos_changed_at)) < 5000);
    const audit = w.db.audit_logs.at(-1)!;
    assert.equal(audit.action, "team_settings.public_athlete_photos_enabled");
    assert.equal(audit.campaign_slug, "lions");
    assert.deepEqual(audit.new_value, { public_athlete_photos: true, confirmation_version: PUBLIC_PHOTO_CONFIRMATION_VERSION, confirmation_text: PUBLIC_PHOTO_CONFIRMATION_TEXT });
    assert.equal(w.writes.filter(x => x.table === "campaign_settings").length, 1);
    assert.match(w.writes[0].query, /campaign_slug=eq\.lions/, "only this team's row");
  });
});

test("turning it OFF needs no confirmation and is recorded too", async () => {
  await inWorld({}, async (w, as) => {
    as("head");
    await patchSettings(ENABLE);
    const res = await patchSettings({ enabled: false });
    assert.equal(res.status, 200);
    assert.equal(lions(w).public_athlete_photos, false);
    assert.equal(w.db.audit_logs.at(-1)!.action, "team_settings.public_athlete_photos_disabled");
  });
});

test("platform admin may change it (recorded as ELF Platform Admin)", async () => {
  await inWorld({}, async (w, as) => {
    as("admin");
    assert.equal((await patchSettings(ENABLE)).status, 200);
    assert.match(String(lions(w).public_athlete_photos_changed_by), /\(ELF Platform Admin\)$/);
  });
});

test("completed season: setting and exclusions are read-only (409)", async () => {
  await inWorld({ completed: true }, async (w, as) => {
    as("head");
    assert.equal((await patchSettings(ENABLE)).status, 409);
    assert.equal((await patchAthlete({ athlete_id: JO, excluded: true })).status, 409);
    assert.deepEqual(w.writes, []);
  });
});

test("per-athlete hide: only an athlete on THIS team, audit-logged", async () => {
  await inWorld({}, async (w, as) => {
    as("head");
    assert.equal((await patchAthlete({ athlete_id: JO, excluded: true })).status, 200);
    assert.equal(w.db.athletes.find(a => a.id === JO)!.public_photo_excluded, true);
    assert.equal(w.db.audit_logs.at(-1)!.action, "team_settings.public_athlete_photo_hidden");
    assert.equal((await patchAthlete({ athlete_id: HAWK, excluded: true })).status, 404, "another team's athlete");
    assert.equal(w.db.athletes.find(a => a.id === HAWK)!.public_photo_excluded, false);
    assert.equal((await patchAthlete({ athlete_id: "not-a-uuid", excluded: true })).status, 400);
    assert.equal((await patchAthlete({ athlete_id: JO })).status, 400);
    assert.ok(w.writes.every(x => x.table !== "athletes" || /id=eq\.0+-0000-4000-8000-000000000001&campaign_slug=eq\.lions/.test(x.query)));
  });
});

test("end to end: on → photos shown; hide → gone on the next request; off → all gone; parent photo never", async () => {
  await inWorld({}, async (_w, as) => {
    as("head");
    assert.equal(await photo(JO), 404, "default off");
    await patchSettings(ENABLE);
    assert.equal(await photo(JO), 200, "athlete's own photo");
    assert.equal(await photo(ROSTER), 200, "coach roster photo");
    assert.equal(await photo(KID), 404, "parent-uploaded photo, even with the setting on");
    assert.equal(await photo(HAWK, "lions"), 404, "another team's athlete through this team");
    await patchAthlete({ athlete_id: JO, excluded: true });
    assert.equal(await photo(JO), 404, "hidden athlete");
    assert.equal(await photo(ROSTER), 200, "others unaffected");
    await patchAthlete({ athlete_id: JO, excluded: false });
    assert.equal(await photo(JO), 200, "shown again");
    await patchSettings({ enabled: false });
    assert.equal(await photo(JO), 404);
    assert.equal(await photo(ROSTER), 404);
  });
});

test("one team's setting never affects another team", async () => {
  await inWorld({}, async (_w, as) => {
    as("head");
    assert.equal(await photo(HAWK, "hawks"), 200, "hawks has it on");
    assert.equal(await photo(ROSTER), 404, "lions still off");
    as("other");
    assert.equal((await patchSettings({ enabled: false }, "lions")).status, 403, "hawks' head coach can't change lions");
  });
});
