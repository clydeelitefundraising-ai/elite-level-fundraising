// Personalized athlete fundraising page — GET /api/campaign-photo/<slug>/<athleteId>.
// Real route handler, fetch-mocked PostgREST + Storage (same technique as
// team/[slug]/overview/route.test.ts). Which stored photo may be shown on the
// PUBLIC page, and that nothing else (storage path, other teams, parents'
// photos, foreign URLs, non-images) ever comes back.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

register(new URL("../../../../../lib/testSupport/nextStubLoader.mjs", import.meta.url).href, import.meta.url);

const { GET } = await import("./route.ts");
const { parseOwnStoragePhoto } = await import("@/lib/athletePublicPhoto.server");

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUB = `${SB}/storage/v1/object/public`;
type Row = Record<string, unknown>;

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ACC_ATH = U(901), ACC_PARENT = U(902), ACC_HAWK = U(903);
const A = {
  own: U(1), parentPhoto: U(2), roster: U(3), rosterOtherTeam: U(4), none: U(5),
  foreign: U(6), traversal: U(7), hawk: U(8), ended: U(9), off: U(10), htmlObject: U(11),
  hidden: U(12), noSetting: U(13), settingFalse: U(14), legacyNoColumn: U(15),
};

function makeWorld() {
  const db: Record<string, Row[]> = {
    campaign_settings: [
      { campaign_slug: "lions", archived: false, fundraising_enabled: true, public_athlete_photos: true },
      { campaign_slug: "hawks", archived: false, fundraising_enabled: true, public_athlete_photos: true },
      { campaign_slug: "ended", archived: true, fundraising_enabled: true, public_athlete_photos: true },
      { campaign_slug: "off", archived: false, fundraising_enabled: false, public_athlete_photos: true },
      // Public Athlete Photos never turned on (the default), explicitly off,
      // and a row read before the Phase T7 migration (no column at all).
      { campaign_slug: "default-off", archived: false, fundraising_enabled: true, public_athlete_photos: false },
      { campaign_slug: "turned-off", archived: false, fundraising_enabled: true, public_athlete_photos: false },
      { campaign_slug: "pre-migration", archived: false, fundraising_enabled: true },
    ],
    athletes: [
      { id: A.own, campaign_slug: "lions", profile_photo: `${PUB}/profile-photos/${ACC_ATH}/1-own.jpg` },
      { id: A.parentPhoto, campaign_slug: "lions", profile_photo: `${PUB}/profile-photos/${ACC_PARENT}/2-parent.jpg` },
      { id: A.roster, campaign_slug: "lions", profile_photo: `${PUB}/athlete-photos/lions/3-roster.jpg` },
      { id: A.rosterOtherTeam, campaign_slug: "lions", profile_photo: `${PUB}/athlete-photos/hawks/4-roster.jpg` },
      { id: A.none, campaign_slug: "lions", profile_photo: null },
      { id: A.foreign, campaign_slug: "lions", profile_photo: "https://evil.example/storage/v1/object/public/profile-photos/x/y.jpg" },
      { id: A.traversal, campaign_slug: "lions", profile_photo: `${PUB}/profile-photos/${ACC_ATH}/../secret.jpg` },
      { id: A.hawk, campaign_slug: "hawks", profile_photo: `${PUB}/profile-photos/${ACC_HAWK}/8-hawk.jpg` },
      { id: A.ended, campaign_slug: "ended", profile_photo: `${PUB}/athlete-photos/ended/9.jpg` },
      { id: A.off, campaign_slug: "off", profile_photo: `${PUB}/athlete-photos/off/10.jpg` },
      { id: A.htmlObject, campaign_slug: "lions", profile_photo: `${PUB}/athlete-photos/lions/11-not-an-image.jpg` },
      { id: A.hidden, campaign_slug: "lions", profile_photo: `${PUB}/athlete-photos/lions/12-hidden.jpg`, public_photo_excluded: true },
      { id: A.noSetting, campaign_slug: "default-off", profile_photo: `${PUB}/athlete-photos/default-off/13.jpg` },
      { id: A.settingFalse, campaign_slug: "turned-off", profile_photo: `${PUB}/athlete-photos/turned-off/14.jpg` },
      { id: A.legacyNoColumn, campaign_slug: "pre-migration", profile_photo: `${PUB}/athlete-photos/pre-migration/15.jpg` },
    ],
    team_members: [
      { id: "m1", campaign_slug: "lions", role: "athlete", athlete_id: A.own, account_id: ACC_ATH },
      // The parent is linked to the athlete whose row holds the parent's photo
      // (the pre-fix propagation bug) — must NOT count as the athlete's own.
      { id: "m2", campaign_slug: "lions", role: "parent", athlete_id: A.parentPhoto, account_id: ACC_PARENT },
      { id: "m3", campaign_slug: "hawks", role: "athlete", athlete_id: A.hawk, account_id: ACC_HAWK },
    ],
  };
  const storageGets: string[] = [];
  async function fetchImpl(url: string, init?: RequestInit): Promise<Response> {
    const method = init?.method ?? "GET";
    if (url.startsWith(`${PUB}/`)) {
      storageGets.push(url.slice(PUB.length + 1));
      if (url.includes("not-an-image")) return new Response("<html>", { status: 200, headers: { "content-type": "text/html" } });
      return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), { status: 200, headers: { "content-type": "image/jpeg" } });
    }
    assert.equal(method, "GET", "the photo route never writes");
    const [table, query = ""] = url.replace(`${SB}/rest/v1/`, "").split("?");
    const filters = [...new URLSearchParams(query).entries()].filter(([k]) => !["select", "limit", "order"].includes(k));
    const rows = (db[table] ?? []).filter(r => filters.every(([k, v]) => !v.startsWith("eq.") || String(r[k]) === v.slice(3)));
    return new Response(JSON.stringify(rows), { status: 200 });
  }
  return { storageGets, fetchImpl };
}

async function get(slug: string, athleteId: string) {
  const w = makeWorld();
  const real = globalThis.fetch;
  globalThis.fetch = w.fetchImpl as typeof fetch;
  try {
    const res = await GET(new Request(`http://test.local/api/campaign-photo/${slug}/${athleteId}`) as never, { params: Promise.resolve({ slug, athleteId }) });
    const bytes = res.status === 200 ? new Uint8Array(await res.arrayBuffer()) : null;
    return { res, bytes, storageGets: w.storageGets };
  } finally {
    globalThis.fetch = real;
  }
}

test("athlete's own account photo → streamed image, no storage URL or account id in the response", async () => {
  const { res, bytes, storageGets } = await get("lions", A.own);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/jpeg");
  assert.equal(res.headers.get("cache-control"), "no-store, max-age=0", "never cached — revocation is immediate");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual([...bytes!], [0xff, 0xd8, 0xff, 0xd9]);
  assert.deepEqual(storageGets, [`profile-photos/${ACC_ATH}/1-own.jpg`]);
  const headerText = JSON.stringify([...res.headers.entries()]);
  assert.ok(!headerText.includes(ACC_ATH) && !headerText.includes("storage"), "no path or account id leaks via headers");
});

test("coach roster photo for this team's athlete → shown", async () => {
  const { res, storageGets } = await get("lions", A.roster);
  assert.equal(res.status, 200);
  assert.deepEqual(storageGets, ["athlete-photos/lions/3-roster.jpg"]);
});

for (const [why, slug, id] of [
  ["a parent's account photo stored on the athlete row", "lions", A.parentPhoto],
  ["a roster photo stored under another team", "lions", A.rosterOtherTeam],
  ["no photo", "lions", A.none],
  ["a URL outside ELF's own storage", "lions", A.foreign],
  ["a path-traversal URL", "lions", A.traversal],
  ["another team's athlete requested through this team", "lions", A.hawk],
  ["this team's athlete requested through another team", "hawks", A.own],
  ["an archived campaign", "ended", A.ended],
  ["a campaign with fundraising off", "off", A.off],
  ["a storage object that isn't an image", "lions", A.htmlObject],
  ["an unknown athlete id", "lions", U(999)],
  ["a malformed athlete id", "lions", "not-a-uuid"],
  ["a team that never turned on Public Athlete Photos (default off)", "default-off", A.noSetting],
  ["a team that turned Public Athlete Photos off", "turned-off", A.settingFalse],
  ["a team read before the migration (setting absent) — fails closed", "pre-migration", A.legacyNoColumn],
  ["an athlete the Head Coach hid, while the team setting is on", "lions", A.hidden],
  ["an unknown campaign", "nope", A.own],
] as const) {
  test(`404 (team logo shown instead) for ${why}`, async () => {
    const { res, storageGets } = await get(slug, id);
    assert.equal(res.status, 404);
    assert.equal(await res.text(), "", "a bare 404 — nothing to tell ids apart");
    assert.equal(res.headers.get("cache-control"), "no-store, max-age=0");
    if (why !== "a storage object that isn't an image") assert.deepEqual(storageGets, [], "storage is never touched");
  });
}

test("parseOwnStoragePhoto accepts only ELF's two photo buckets on this project, one folder deep", () => {
  assert.deepEqual(parseOwnStoragePhoto(`${PUB}/profile-photos/abc/1.jpg`, SB), { bucket: "profile-photos", path: "abc/1.jpg" });
  assert.deepEqual(parseOwnStoragePhoto(`${PUB}/athlete-photos/lions/1.jpg`, `${SB}/`), { bucket: "athlete-photos", path: "lions/1.jpg" });
  for (const bad of [
    `${PUB}/team-files/lions/1.pdf`, `${PUB}/message-attachments/x/y.jpg`, `${SB}/storage/v1/object/profile-photos/a/b.jpg`,
    `${PUB}/profile-photos/a/b/c.jpg`, `${PUB}/profile-photos/a/b.jpg?download=1`, `${PUB}/profile-photos/../b.jpg`,
    `${PUB}/profile-photos/a%2F..%2Fb.jpg`, "https://other.supabase.co/storage/v1/object/public/profile-photos/a/b.jpg", "", null,
  ]) {
    assert.equal(parseOwnStoragePhoto(bad, SB), null, String(bad));
  }
});
