// Static wiring guards for Phase 2A (same no-jsdom/no-route-harness constraint
// as the other *Wiring tests): the nine push call sites moved to the shared
// dispatcher, APNs is untouched and still iOS-only, and FCM stays server-only
// with no new dependency.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}
const rel = (p: string) => relative(ROOT, p).replace(/\\/g, "/");
const read = (p: string) => readFileSync(p, "utf8");
const allFiles = walk(SRC);

const EXPECTED_ROUTES = [
  "src/app/api/auth/join-request/route.ts",
  "src/app/api/auth/join/route.ts",
  "src/app/api/team/[slug]/parent-access-requests/[id]/route.ts",
  "src/app/api/team/[slug]/announcements/route.ts",
  "src/app/api/team/[slug]/messages/threads/route.ts",
  "src/app/api/team/[slug]/messages/threads/[threadId]/messages/route.ts",
  "src/app/api/team/[slug]/members/me/route.ts",
  "src/app/api/team/[slug]/events/route.ts",
  "src/app/api/team/[slug]/events/[id]/route.ts",
];

test("exactly the nine expected routes import dispatchPush from the shared dispatcher", () => {
  const importing = allFiles
    .filter(f => /from "@\/lib\/pushDispatch"/.test(read(f)))
    .map(rel)
    .sort();
  assert.deepEqual(importing, [...EXPECTED_ROUTES].sort());
});

test("each of the nine routes calls dispatchPush( and no longer references dispatchApnsPush", () => {
  for (const route of EXPECTED_ROUTES) {
    const source = read(join(ROOT, route));
    assert.match(source, /import \{ dispatchPush \} from "@\/lib\/pushDispatch";/, route);
    assert.match(source, /dispatchPush\(\{/, `${route} must call dispatchPush({`);
    assert.doesNotMatch(source, /dispatchApnsPush/, route);
    assert.doesNotMatch(source, /from "@\/lib\/apns"/, route);
  }
});

test("dispatchApnsPush is referenced only by apns.ts and the shared dispatcher (docs/comments aside)", () => {
  const users = allFiles
    .filter(f => !f.endsWith(".test.ts") && /dispatchApnsPush/.test(read(f)))
    .map(rel)
    .sort();
  assert.deepEqual(users, ["src/lib/apns.ts", "src/lib/fcm.ts", "src/lib/pushDispatch.ts"]);
  // fcm.ts only mentions it in a doc comment -- it must not import or call it.
  assert.doesNotMatch(read(join(SRC, "lib/fcm.ts")).replace(/\/\*\*[\s\S]*?\*\//g, ""), /dispatchApnsPush/);
});

test("APNs is preserved: still exports dispatchApnsPush and still filters to iOS devices only", () => {
  const apns = read(join(SRC, "lib/apns.ts"));
  assert.match(apns, /export async function dispatchApnsPush\(input: ApnsDispatchInput\): Promise<void>/);
  assert.match(apns, /devices\.filter\(d => d\.platform === "ios"\)/);
  assert.doesNotMatch(apns, /fcm/i);
});

test("FCM sends only to android devices", () => {
  const fcm = read(join(SRC, "lib/fcm.ts"));
  assert.match(fcm, /x\.platform === "android"/);
  assert.doesNotMatch(fcm, /platform === "ios"/);
});

test("fcm.ts imports only node:* builtins and local modules (no new dependency, no Firebase Admin SDK)", () => {
  const specifiers = [...read(join(SRC, "lib/fcm.ts")).matchAll(/from "([^"]+)"/g)].map(m => m[1]);
  assert.ok(specifiers.length > 0);
  for (const s of specifiers) assert.ok(s.startsWith("node:") || s.startsWith("./"), `unexpected import: ${s}`);
  const pkg = read(join(ROOT, "package.json"));
  assert.doesNotMatch(pkg, /firebase|google-auth-library|googleapis/i);
});

test("pushDispatch.ts imports only local modules", () => {
  const specifiers = [...read(join(SRC, "lib/pushDispatch.ts")).matchAll(/from "([^"]+)"/g)].map(m => m[1]);
  for (const s of specifiers) assert.ok(s.startsWith("./"), `unexpected import: ${s}`);
});

test("fcm.ts and pushDispatch.ts are never imported from a client component", () => {
  for (const f of allFiles) {
    const source = read(f);
    if (!/^\s*["']use client["']/.test(source)) continue;
    assert.doesNotMatch(source, /lib\/(fcm|pushDispatch)(\.ts)?["']/, `${rel(f)} is a client file`);
  }
});

test("FCM credentials are read only from server-only, non-NEXT_PUBLIC variables", () => {
  const fcm = read(join(SRC, "lib/fcm.ts"));
  assert.match(fcm, /env\.FCM_PROJECT_ID/);
  assert.match(fcm, /env\.FCM_CLIENT_EMAIL/);
  assert.match(fcm, /env\.FCM_PRIVATE_KEY/);
  assert.doesNotMatch(fcm, /NEXT_PUBLIC_FCM/);
  for (const f of allFiles) {
    if (rel(f) === "src/lib/fcm.ts" || rel(f).endsWith(".test.ts")) continue;
    assert.doesNotMatch(read(f), /FCM_PRIVATE_KEY|FCM_CLIENT_EMAIL/, `${rel(f)} must not read FCM credentials`);
  }
});

test(".env.example documents the FCM variable names with empty values only", () => {
  const env = read(join(ROOT, ".env.example"));
  for (const name of ["FCM_PROJECT_ID", "FCM_CLIENT_EMAIL", "FCM_PRIVATE_KEY"]) {
    assert.match(env, new RegExp(`^${name}=$`, "m"), name);
  }
  assert.doesNotMatch(env, /BEGIN PRIVATE KEY-----\\n[A-Za-z0-9+/]{20,}/);
});

test("Android client registration is enabled by Phase 2C through the shared native-platform gate (iOS unchanged)", () => {
  const registrar = read(join(SRC, "app/team/[slug]/_components/NativePushRegistrar.tsx"));
  assert.match(registrar, /getNativePlatform\(\)/);
  assert.doesNotMatch(registrar, /isNativeIosApp\(\)/);
});
