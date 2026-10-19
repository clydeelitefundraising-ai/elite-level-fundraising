// Phase 3C-2 — Linked Members on the staff athlete profile: legacy
// athlete_id links + team_member_athletes links, merged and strict.
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

const { getAthleteLinkedMembers } = await import("./athleteLinkedMembers.ts");

type Row = Record<string, unknown>;
const SLUG = "wolves";

function world() {
  const db: Record<string, Row[]> = {
    team_members: [
      { id: "m-ava",  name: "Ava Account", role: "athlete", athlete_id: "ath-1", campaign_slug: SLUG },
      { id: "m-pat",  name: "Pat Parent",  role: "parent",  athlete_id: "ath-1", campaign_slug: SLUG }, // legacy Ava + link Jake
      { id: "m-sam",  name: "Sam Parent",  role: "parent",  athlete_id: "ath-1", campaign_slug: SLUG }, // legacy Ava + duplicate link Ava
      { id: "m-zoe",  name: "Zoe Parent",  role: "parent",  athlete_id: null,    campaign_slug: SLUG }, // link-only parent of Jake
      { id: "m-jake", name: "Jake Account", role: "athlete", athlete_id: "ath-2", campaign_slug: SLUG },
      { id: "m-hawk", name: "Hal Hawk",    role: "parent",  athlete_id: null,    campaign_slug: "hawks" },
      { id: "m-bo",   name: "Bo Booster",  role: "booster", athlete_id: null,    campaign_slug: SLUG },
    ],
    team_member_athletes: [
      { team_member_id: "m-pat",  athlete_id: "ath-2" },
      { team_member_id: "m-sam",  athlete_id: "ath-1" },
      { team_member_id: "m-zoe",  athlete_id: "ath-2" },
      { team_member_id: "m-hawk", athlete_id: "ath-2" }, // another team's member: never shown here
      { team_member_id: "m-bo",   athlete_id: "ath-2" }, // not a parent: ignored
    ],
  };
  const control = { failPaths: [] as string[], throwPaths: [] as string[], garbagePaths: [] as string[] };
  const requests: string[] = [];
  async function fetchImpl(url: string): Promise<Response> {
    const path = url.replace(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, "");
    requests.push(path);
    if (control.throwPaths.some(p => path.includes(p))) throw new Error("network down");
    if (control.failPaths.some(p => path.includes(p))) return new Response(JSON.stringify({ code: "XX000", message: "boom" }), { status: 500 });
    if (control.garbagePaths.some(p => path.includes(p))) return new Response(JSON.stringify({ oops: true }));
    const [resource, query = ""] = path.split("?");
    let rows = db[resource] ?? [];
    for (const [k, v] of new URLSearchParams(query)) {
      if (k === "select") continue;
      if (v.startsWith("eq.")) rows = rows.filter(r => String(r[k]) === v.slice(3));
      if (v.startsWith("in.(")) rows = rows.filter(r => v.slice(4, -1).split(",").includes(String(r[k])));
    }
    return new Response(JSON.stringify(rows));
  }
  return { db, control, requests, fetchImpl };
}

async function run<T>(fn: (w: ReturnType<typeof world>) => Promise<T>): Promise<T> {
  const w = world();
  const real = globalThis.fetch;
  globalThis.fetch = w.fetchImpl as typeof fetch;
  try { return await fn(w); } finally { globalThis.fetch = real; }
}

const names = (r: Awaited<ReturnType<typeof getAthleteLinkedMembers>>) =>
  r.ok ? r.members.map(m => `${m.role}:${m.name}`) : "FAILED";

test("legacy links: the athlete account and parents linked by athlete_id", async () => {
  await run(async () => {
    assert.deepEqual(names(await getAthleteLinkedMembers(SLUG, "ath-1")), ["athlete:Ava Account", "parent:Pat Parent", "parent:Sam Parent"]);
  });
});

test("second-child links: parents linked only through team_member_athletes are included", async () => {
  await run(async () => {
    // Jake: his own account (legacy), Pat (second child) and Zoe (link only).
    assert.deepEqual(names(await getAthleteLinkedMembers(SLUG, "ath-2")), ["athlete:Jake Account", "parent:Pat Parent", "parent:Zoe Parent"]);
  });
});

test("a member linked both ways appears once", async () => {
  await run(async () => {
    const r = await getAthleteLinkedMembers(SLUG, "ath-1"); // Sam: legacy AND link to Ava
    assert.ok(r.ok);
    assert.equal(r.members.filter(m => m.id === "m-sam").length, 1);
    assert.equal(new Set(r.members.map(m => m.id)).size, r.members.length);
  });
});

test("never another team's member or a non-parent through a link", async () => {
  await run(async w => {
    const r = await getAthleteLinkedMembers(SLUG, "ath-2");
    assert.ok(r.ok && !r.members.some(m => m.id === "m-hawk" || m.id === "m-bo"));
    const extra = w.requests.find(p => p.startsWith("team_members?") && p.includes("id=in."));
    assert.ok(extra?.includes(`campaign_slug=eq.${SLUG}`), "member lookup is scoped to this team");
  });
});

test("an athlete with no linked members: ok and empty (not a failure)", async () => {
  await run(async () => {
    assert.deepEqual(await getAthleteLinkedMembers(SLUG, "ath-3"), { ok: true, members: [] });
  });
});

test("any failed read is a failure, never 'no linked members'", async () => {
  for (const [kind, path] of [
    ["failPaths", "team_members?campaign_slug"],   // legacy links
    ["failPaths", "team_member_athletes?"],        // second-child links
    ["failPaths", "id=in."],                       // members found through links
    ["throwPaths", "team_member_athletes?"],
    ["garbagePaths", "team_members?campaign_slug"],
  ] as const) {
    await run(async w => {
      w.control[kind].push(path);
      assert.deepEqual(await getAthleteLinkedMembers(SLUG, "ath-2"), { ok: false }, `${kind} ${path}`);
    });
  }
});
