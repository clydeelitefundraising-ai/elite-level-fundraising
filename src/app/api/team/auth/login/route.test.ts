// Legacy coach login across several teams / seasons (Complete Season
// Phase 2). Real route + real password hashing, against a fetch-mocked
// team_coaches table.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.TEAM_COACH_PEPPER         = "test-pepper";
register(new URL("../../../../../lib/testSupport/nextStubLoader.mjs", import.meta.url).href, import.meta.url);

const { NextRequest } = await import("../../../../../lib/testSupport/nextServerStub.mjs");
const { hashPassword } = await import("../../../../../lib/teamAuth.ts");

type Row = { id: string; name: string; role: string; campaign_slug: string; email: string; password_hash: string; salt: string; created_at: string };
let rows: Row[] = [];
const queries: string[] = [];
globalThis.fetch = (async (url: string | URL) => {
  const u = String(url);
  queries.push(u);
  if (!u.includes("/rest/v1/team_coaches?")) return new Response("[]", { status: 200 });
  const q = new URL(u).searchParams;
  const email = q.get("email")?.replace(/^eq\./, "");
  const slug = q.get("campaign_slug")?.replace(/^eq\./, "");
  const hit = rows.filter(r => r.email === email && (!slug || r.campaign_slug === slug));
  return new Response(JSON.stringify(hit), { status: 200 });
}) as typeof fetch;

const { POST } = await import("./route.ts");

const coach = (id: string, slug: string, password: string | null, created: string): Row => ({
  id, name: `Coach ${id}`, role: "head_coach", campaign_slug: slug, email: "coach@example.test",
  salt: `salt-${id}`, password_hash: password === null ? "unused" : hashPassword(password, `salt-${id}`), created_at: created,
});
const login = (body: Record<string, unknown>) => POST(new NextRequest("https://app.test/api/team/auth/login", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
}) as never);

test("one team: signs in as before (cookie set, team returned)", async () => {
  rows = [coach("c1", "lions-2027", "pw-1", "2026-08-01")];
  const res = await login({ email: "Coach@Example.test ", password: "pw-1" });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.coach.campaign_slug, "lions-2027");
  assert.match(res.headers.get("set-cookie") ?? "", /team_coach=c1:/);
});

test("every row for the email is checked (no arbitrary limit=1)", async () => {
  queries.length = 0;
  rows = [coach("c1", "lions-2027", "pw-1", "2026-08-01")];
  await login({ email: "coach@example.test", password: "pw-1" });
  const q = queries.find(x => x.includes("team_coaches?"))!;
  assert.ok(q.includes("limit=100") && !q.includes("limit=1&") && !q.endsWith("limit=1"));
  assert.ok(q.includes("select=id,name,role,campaign_slug,password_hash,salt"));
});

test("a coach on two seasons: the account-linked successor row never captures the legacy login", async () => {
  rows = [coach("new", "lions-2028", null, "2027-06-01"), coach("old", "lions-2027", "pw-1", "2026-08-01")];
  const res = await login({ email: "coach@example.test", password: "pw-1" });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).coach.id, "old");
});

test("two teams, different passwords: signs into the team whose password matches", async () => {
  rows = [coach("a", "lions-2027", "pw-a", "2026-08-01"), coach("b", "bears-2027", "pw-b", "2026-09-01")];
  assert.equal((await (await login({ email: "coach@example.test", password: "pw-b" })).json()).coach.campaign_slug, "bears-2027");
  assert.equal((await (await login({ email: "coach@example.test", password: "pw-a" })).json()).coach.campaign_slug, "lions-2027");
});

test("same password on two teams: nothing is signed in until the coach chooses; choosing signs into exactly that team", async () => {
  rows = [coach("a", "lions-2027", "same", "2026-08-01"), coach("b", "bears-2027", "same", "2026-09-01")];
  const res = await login({ email: "coach@example.test", password: "same" });
  assert.equal(res.status, 409);
  assert.equal(res.headers.get("set-cookie"), null, "no session");
  const body = await res.json();
  assert.equal(body.code, "team_selection_required");
  assert.deepEqual(body.teams, ["bears-2027", "lions-2027"]);

  const chosen = await login({ email: "coach@example.test", password: "same", campaign_slug: "lions-2027" });
  assert.equal(chosen.status, 200);
  assert.equal((await chosen.json()).coach.id, "a");
});

test("wrong password or unknown email: 401, never a team list", async () => {
  rows = [coach("a", "lions-2027", "same", "2026-08-01"), coach("b", "bears-2027", "same", "2026-09-01")];
  const bad = await login({ email: "coach@example.test", password: "wrong" });
  assert.equal(bad.status, 401);
  assert.equal((await bad.json()).teams, undefined);
  rows = [];
  assert.equal((await login({ email: "nobody@example.test", password: "x" })).status, 401);
  assert.equal((await login({ email: "", password: "x" })).status, 400);
});
