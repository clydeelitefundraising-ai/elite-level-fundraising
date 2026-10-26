// Complete Season Phase 2 — the shared app-side "season is writable" guard.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
register(new URL("./testSupport/nextStubLoader.mjs", import.meta.url).href, import.meta.url);

type Handler = (url: string) => Response | Promise<Response>;
let handler: Handler = () => new Response("[]", { status: 200 });
const seen: string[] = [];
globalThis.fetch = (async (url: string | URL) => { seen.push(String(url)); return handler(String(url)); }) as typeof fetch;

const { isSeasonCompleted, seasonWriteBlocked, seasonWriteBlockedFor, SEASON_COMPLETED_CODE } = await import("./seasonWritable.ts");

const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });

test("isSeasonCompleted: either completion marker is enough; nothing else counts", () => {
  assert.equal(isSeasonCompleted({ season_completed_at: "2027-06-01T00:00:00Z" }), true);
  assert.equal(isSeasonCompleted({ successor_campaign_slug: "team-2028" }), true);
  assert.equal(isSeasonCompleted({ season_completed_at: null, successor_campaign_slug: null }), false);
  assert.equal(isSeasonCompleted({}), false);
  assert.equal(isSeasonCompleted(null), false);
  assert.equal(isSeasonCompleted(undefined), false);
});

test("a completed season is refused with 409 season_completed (no-store), whoever is asking", async () => {
  handler = () => json([{ season_completed_at: "2027-06-01T00:00:00Z", successor_campaign_slug: "lions-2028" }]);
  const res = await seasonWriteBlocked("lions-2027");
  assert.ok(res);
  assert.equal(res!.status, 409);
  assert.equal(res!.headers.get("cache-control"), "no-store");
  const body = await res!.json();
  assert.equal(body.code, SEASON_COMPLETED_CODE);
  assert.match(body.error, /completed and is read-only/);
  assert.ok(seen.at(-1)!.includes("campaign_settings?campaign_slug=eq.lions-2027"));
  assert.ok(seen.at(-1)!.includes("select=season_completed_at,successor_campaign_slug"));
});

test("an active season, an unknown team or no slug are not blocked", async () => {
  handler = () => json([{ season_completed_at: null, successor_campaign_slug: null }]);
  assert.equal(await seasonWriteBlocked("lions-2028"), null);
  handler = () => json([]);
  assert.equal(await seasonWriteBlocked("nope"), null);
  const before = seen.length;
  assert.equal(await seasonWriteBlocked(""), null);
  assert.equal(await seasonWriteBlocked(undefined), null);
  assert.equal(seen.length, before, "no lookup without a slug");
});

test("before the migration (columns missing -> 400) or on a network error the check lets the write through; the database guard is the authority", async () => {
  handler = () => json({ code: "42703", message: "column campaign_settings.season_completed_at does not exist" }, 400);
  assert.equal(await seasonWriteBlocked("lions-2027"), null);
  handler = () => { throw new Error("network down"); };
  assert.equal(await seasonWriteBlocked("lions-2027"), null);
});

test("slug values are URL-encoded", async () => {
  handler = () => json([]);
  await seasonWriteBlocked("a&b=c");
  assert.ok(seen.at(-1)!.includes("campaign_slug=eq.a%26b%3Dc"));
});

test("seasonWriteBlockedFor: finds the row's team first, then applies the same rule", async () => {
  handler = (url) => url.includes("/athletes?")
    ? json([{ campaign_slug: "lions-2027" }])
    : json([{ season_completed_at: "2027-06-01T00:00:00Z" }]);
  const res = await seasonWriteBlockedFor("athletes", "00000000-0000-0000-0000-000000000001");
  assert.equal(res?.status, 409);
  assert.ok(seen.some(u => u.includes("athletes?id=eq.00000000-0000-0000-0000-000000000001&select=campaign_slug")));

  handler = (url) => url.includes("/sponsors?") ? json([{ campaign_slug: "lions-2028" }]) : json([{ season_completed_at: null }]);
  assert.equal(await seasonWriteBlockedFor("sponsors", "x"), null);
  handler = () => json([]);
  assert.equal(await seasonWriteBlockedFor("team_coaches", "missing"), null, "unknown id -> the route's own not-found answers");
  assert.equal(await seasonWriteBlockedFor("fund_uses", ""), null);
});
