// Complete Season Phase 2 — personal-data removal (account deletion) and
// moderation removals carry the x-elf-write-purpose header, so the database
// guard lets them reach a completed season; nothing else sends it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

type Call = { url: string; method: string; headers: Record<string, string> };
const calls: Call[] = [];
globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
  calls.push({ url: String(url), method: init?.method ?? "GET", headers: Object.fromEntries(new Headers(init?.headers).entries()) });
  return new Response("[]", { status: 200 });
}) as typeof fetch;

const { restUpdate, restDelete } = await import("./platform/_client.ts");
const { purgePersonalUgc } = await import("./accountDeletionPurge.ts");
const { WRITE_PURPOSE_HEADER, writePurposeHeaders } = await import("./writePurpose.ts");

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");

test("the REST helpers pass extra headers through, and send none by default", async () => {
  calls.length = 0;
  await restUpdate("athletes?id=eq.x", { name: "y" });
  await restDelete("athletes?id=eq.x");
  assert.ok(calls.every(c => !(WRITE_PURPOSE_HEADER in c.headers)), "ordinary writes carry no purpose");
  calls.length = 0;
  await restUpdate("messages?id=eq.x", { body: "" }, writePurposeHeaders("moderation"));
  await restDelete("post_likes?id=eq.x", writePurposeHeaders("account_deletion"));
  assert.deepEqual(calls.map(c => c.headers[WRITE_PURPOSE_HEADER]), ["moderation", "account_deletion"]);
  assert.equal(calls[0].headers.prefer, "return=representation", "existing headers kept");
});

test("every write the account-deletion purge makes is marked account_deletion", async () => {
  calls.length = 0;
  await purgePersonalUgc("acct-1", [
    { kind: "member", id: "m-1", campaign_slug: "lions-2027" },
    { kind: "coach", id: "c-1", campaign_slug: "lions-2027" },
  ] as never);
  const writes = calls.filter(c => c.url.includes("/rest/v1/") && c.method !== "GET");
  assert.ok(writes.length >= 6, `expected the purge's deletes/updates, saw ${writes.length}`);
  for (const w of writes) assert.equal(w.headers[WRITE_PURPOSE_HEADER], "account_deletion", `${w.method} ${w.url}`);
});

test("purge and moderation code route every write through the purpose-marked helpers", () => {
  const purge = read("src/lib/accountDeletionPurge.ts");
  const afterWrappers = purge.slice(purge.indexOf("const purgeUpdate"));
  assert.doesNotMatch(afterWrappers.split("\n").slice(1).join("\n"), /\brest(Delete|Update)[<(]/);
  const mod = read("src/lib/moderation/messageModeration.ts");
  assert.match(mod, /restUpdate<T>\(path, body, writePurposeHeaders\("moderation"\)\)/);
  assert.doesNotMatch(mod.slice(mod.indexOf("const moderationUpdate")).split("\n").slice(1).join("\n"), /\brestUpdate\(/);
});

test("no other app code sends the purpose header", () => {
  const offenders: string[] = [];
  (function walk(dir: string) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== "node_modules") walk(p); continue; }
      if (!/\.(ts|tsx)$/.test(e.name) || /\.test\.ts$/.test(e.name)) continue;
      const s = readFileSync(p, "utf8");
      if (/writePurposeHeaders\(|x-elf-write-purpose/.test(s)) offenders.push(p.replace(/\\/g, "/").replace(/.*\/src\//, "src/"));
    }
  })(join(process.cwd(), "src"));
  assert.deepEqual(offenders.sort(), ["src/lib/accountDeletionPurge.ts", "src/lib/moderation/messageModeration.ts", "src/lib/writePurpose.ts"]);
});
