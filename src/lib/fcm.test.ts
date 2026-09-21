import test from "node:test";
import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync } from "node:crypto";
import {
  ACCESS_TOKEN_REFRESH_MARGIN_MS,
  FCM_ANDROID_CHANNEL_ID,
  buildFcmEndpoint,
  buildFcmMessage,
  buildServiceAccountJwt,
  classifyFcmError,
  createAccessTokenProvider,
  dispatchFcmPush,
  fcmErrorCode,
  getFcmConfig,
  type FcmConfig,
  type FcmDeps,
  type FcmFetch,
} from "./fcm.ts";
import { buildApnsAlert, type ApnsDispatchInput } from "./apns.ts";
import type { PushDeviceRow, PushPreferences } from "./pushDevices.ts";

// Throwaway key generated at runtime -- no real credential exists in this file.
const { privateKey: privateKeyObj, publicKey: publicKeyObj } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PRIVATE_PEM = privateKeyObj.export({ type: "pkcs8", format: "pem" }).toString();

const CONFIG: FcmConfig = {
  projectId: "test-project",
  clientEmail: "svc-account@test-project.iam.invalid",
  privateKey: PRIVATE_PEM,
};
const FAKE_ACCESS_TOKEN = "FAKE_ACCESS_TOKEN_abc123";
const ANDROID_TOKEN_1 = "fake-android-registration-token-1";
const ANDROID_TOKEN_2 = "fake-android-registration-token-2";
const IOS_TOKEN = "fake-ios-token-0000";
const BODY_MARKER = "PROVIDER-BODY-MARKER-xyz";

const INPUT: ApnsDispatchInput = {
  accountIds: ["acc-1", "acc-2"],
  category: "team_updates",
  kind: "announcement",
  ctx: { actorName: "Coach Smith" },
  url: "/team/monroe/notifications",
};

function envFor(config: FcmConfig | null): Record<string, string | undefined> {
  return config
    ? { FCM_PROJECT_ID: config.projectId, FCM_CLIENT_EMAIL: config.clientEmail, FCM_PRIVATE_KEY: config.privateKey.replace(/\n/g, "\\n") }
    : {};
}

function device(id: string, token: string, platform: "ios" | "android" = "android", account = "acc-1", active = true): PushDeviceRow {
  return { id, account_id: account, platform, device_token: token, active, created_at: "", last_seen_at: "" };
}

type Call = { url: string; init: RequestInit };
type Responder = (token: string) => Response | Promise<Response> | Error;

function makeFetch(responder: Responder = () => new Response("{}", { status: 200 }), tokenStatus = 200) {
  const calls: Call[] = [];
  const fetchFn: FcmFetch = async (url, init) => {
    calls.push({ url, init });
    if (url === "https://oauth2.googleapis.com/token") {
      return tokenStatus === 200
        ? new Response(JSON.stringify({ access_token: FAKE_ACCESS_TOKEN, expires_in: 3600, token_type: "Bearer" }), { status: 200 })
        : new Response(JSON.stringify({ error: "invalid_grant" }), { status: tokenStatus });
    }
    const body = JSON.parse(String(init.body)) as { message: { token: string } };
    const out = responder(body.message.token);
    if (out instanceof Error) throw out;
    return out;
  };
  return { calls, fetchFn, tokenCalls: () => calls.filter(c => c.url.endsWith("/token")).length, sendCalls: () => calls.filter(c => c.url.includes("fcm.googleapis.com")) };
}

function fcmError(status: number, errStatus: string, opts: { errorCode?: string; field?: string; message?: string } = {}): Response {
  const details: unknown[] = [];
  if (opts.errorCode) details.push({ "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode: opts.errorCode });
  if (opts.field) details.push({ "@type": "type.googleapis.com/google.rpc.BadRequest", fieldViolations: [{ field: opts.field, description: "invalid" }] });
  return new Response(JSON.stringify({ error: { code: status, status: errStatus, message: opts.message ?? BODY_MARKER, details } }), { status });
}

function makeDeps(fetchFn: FcmFetch, extra: Partial<FcmDeps> = {}) {
  const deactivated: string[] = [];
  const logs: Array<[string, unknown]> = [];
  const deps: Partial<FcmDeps> = {
    env: envFor(CONFIG),
    fetchFn,
    now: () => 1_000_000_000_000,
    getDevices: async () => [device("row-1", ANDROID_TOKEN_1)],
    getPrefs: async () => null,
    deactivate: async id => { deactivated.push(id); },
    tokenProvider: createAccessTokenProvider(() => 1_000_000_000_000),
    log: (event, detail) => { logs.push([event, detail]); },
    ...extra,
  };
  return { deps, deactivated, logs };
}

// ── Configuration / unconfigured no-op ───────────────────────────────────────

test("getFcmConfig: returns null unless all three variables are present and non-empty", () => {
  assert.equal(getFcmConfig({}), null);
  for (const missing of ["FCM_PROJECT_ID", "FCM_CLIENT_EMAIL", "FCM_PRIVATE_KEY"]) {
    const env = envFor(CONFIG);
    delete env[missing];
    assert.equal(getFcmConfig(env), null, `${missing} missing`);
    env[missing] = "   ";
    assert.equal(getFcmConfig(env), null, `${missing} blank`);
  }
});

test("getFcmConfig: restores literal \\n sequences and strips wrapping quotes from the private key", () => {
  const config = getFcmConfig({ FCM_PROJECT_ID: "p", FCM_CLIENT_EMAIL: "e@x.invalid", FCM_PRIVATE_KEY: `"-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----"` });
  assert.ok(config);
  assert.equal(config.privateKey, "-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----");
});

test("dispatchFcmPush: unconfigured (any variable missing) is a silent no-op -- no network, no device query, no throw", async () => {
  for (const missing of [null, "FCM_PROJECT_ID", "FCM_CLIENT_EMAIL", "FCM_PRIVATE_KEY"]) {
    const env = envFor(CONFIG);
    if (missing) delete env[missing];
    else for (const k of Object.keys(env)) delete env[k];
    const f = makeFetch();
    let deviceQueries = 0;
    const { deps, logs } = makeDeps(f.fetchFn, { env, getDevices: async () => { deviceQueries++; return []; } });
    await dispatchFcmPush(INPUT, deps);
    assert.equal(f.calls.length, 0);
    assert.equal(deviceQueries, 0);
    assert.equal(logs.length, 0);
  }
});

// ── JWT ──────────────────────────────────────────────────────────────────────

test("buildServiceAccountJwt: RS256 header/claims are correct and the signature verifies with the public key", () => {
  const jwt = buildServiceAccountJwt(CONFIG, 1_700_000_000);
  const [h, c, s] = jwt.split(".");
  assert.ok(h && c && s);
  assert.doesNotMatch(jwt, /[+/=]/, "base64url only");
  const dec = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  assert.deepEqual(dec(h), { alg: "RS256", typ: "JWT" });
  assert.deepEqual(dec(c), {
    iss: CONFIG.clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: 1_700_000_000,
    exp: 1_700_003_600,
  });
  const verifier = createVerify("RSA-SHA256").update(`${h}.${c}`);
  assert.equal(verifier.verify(publicKeyObj, Buffer.from(s, "base64url")), true);
});

test("buildServiceAccountJwt: a malformed key throws; the access-token provider swallows it and returns null", async () => {
  const bad = { ...CONFIG, privateKey: "not a key" };
  assert.throws(() => buildServiceAccountJwt(bad, 1));
  const f = makeFetch();
  assert.equal(await createAccessTokenProvider().get(bad, f.fetchFn), null);
  assert.equal(f.calls.length, 0);
});

// ── OAuth exchange + caching ─────────────────────────────────────────────────

test("access token: exchange request shape and response parsing", async () => {
  const f = makeFetch();
  const token = await createAccessTokenProvider(() => 5_000_000).get(CONFIG, f.fetchFn);
  assert.equal(token, FAKE_ACCESS_TOKEN);
  assert.equal(f.calls.length, 1);
  const { url, init } = f.calls[0];
  assert.equal(url, "https://oauth2.googleapis.com/token");
  assert.equal(init.method, "POST");
  assert.equal((init.headers as Record<string, string>)["Content-Type"], "application/x-www-form-urlencoded");
  const params = new URLSearchParams(String(init.body));
  assert.equal(params.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");
  assert.equal(params.get("assertion")?.split(".").length, 3);
});

test("access token: cached within its lifetime, refreshed once inside the expiry margin", async () => {
  let now = 10_000_000;
  const f = makeFetch();
  const provider = createAccessTokenProvider(() => now);
  await provider.get(CONFIG, f.fetchFn);
  now += 60_000;
  await provider.get(CONFIG, f.fetchFn);
  assert.equal(f.tokenCalls(), 1, "second call within TTL reuses the cached token");
  now = 10_000_000 + 3600 * 1000 - ACCESS_TOKEN_REFRESH_MARGIN_MS + 1_000; // inside the margin
  await provider.get(CONFIG, f.fetchFn);
  assert.equal(f.tokenCalls(), 2, "inside the refresh margin -> new exchange");
});

test("access token: concurrent callers share one in-flight exchange", async () => {
  const f = makeFetch();
  const provider = createAccessTokenProvider(() => 1);
  const results = await Promise.all([1, 2, 3, 4, 5].map(() => provider.get(CONFIG, f.fetchFn)));
  assert.equal(f.tokenCalls(), 1);
  assert.ok(results.every(t => t === FAKE_ACCESS_TOKEN));
});

test("access token: failures return null, are not cached, and invalidate() forces a refresh", async () => {
  const failing = makeFetch(undefined, 500);
  const provider = createAccessTokenProvider(() => 1);
  assert.equal(await provider.get(CONFIG, failing.fetchFn), null);
  assert.equal(await provider.get(CONFIG, failing.fetchFn), null);
  assert.equal(failing.tokenCalls(), 2, "a failure is retried on the next call, never cached");

  const ok = makeFetch();
  const p2 = createAccessTokenProvider(() => 1);
  await p2.get(CONFIG, ok.fetchFn);
  p2.invalidate();
  await p2.get(CONFIG, ok.fetchFn);
  assert.equal(ok.tokenCalls(), 2);
});

// ── Message / endpoint construction ──────────────────────────────────────────

test("buildFcmEndpoint: v1 send URL with the project id encoded", () => {
  assert.equal(buildFcmEndpoint("my-proj"), "https://fcm.googleapis.com/v1/projects/my-proj/messages:send");
  assert.equal(buildFcmEndpoint("a/b c"), "https://fcm.googleapis.com/v1/projects/a%2Fb%20c/messages:send");
});

test("buildFcmMessage: notification copy comes from buildApnsAlert; data is exactly {url, kind} as strings; no extra content", () => {
  for (const kind of ["announcement", "message", "calendar_event", "request", "request_approved"] as const) {
    const alert = buildApnsAlert(kind, { actorName: "Coach Smith", eventTitle: "Practice", teamLabel: "MVHS" });
    const msg = buildFcmMessage("tok", alert, "/team/x/home", kind);
    assert.deepEqual(msg.message.notification, alert);
    assert.deepEqual(Object.keys(msg.message.data).sort(), ["kind", "url"]);
    assert.ok(Object.values(msg.message.data).every(v => typeof v === "string"));
    assert.equal(msg.message.data.url, "/team/x/home");
    assert.equal(msg.message.data.kind, kind);
    assert.equal(msg.message.android.priority, "HIGH");
    assert.equal(msg.message.android.notification.channel_id, FCM_ANDROID_CHANNEL_ID);
    assert.deepEqual(Object.keys(msg.message).sort(), ["android", "data", "notification", "token"]);
  }
});

// ── Error classification ─────────────────────────────────────────────────────

test("classifyFcmError: permanent vs transient vs auth/config", () => {
  const body = (s: string, o: Parameters<typeof fcmError>[2] = {}) => JSON.parse(JSON.stringify({ error: { status: s, message: o.message ?? "", details: [
    ...(o.errorCode ? [{ errorCode: o.errorCode }] : []),
    ...(o.field ? [{ fieldViolations: [{ field: o.field }] }] : []),
  ] } }));
  assert.equal(classifyFcmError(404, body("NOT_FOUND", { errorCode: "UNREGISTERED" })), "permanent_token");
  assert.equal(classifyFcmError(404, body("NOT_FOUND", { message: "Requested entity was not found. UNREGISTERED" })), "permanent_token");
  assert.equal(classifyFcmError(404, body("NOT_FOUND")), "transient", "a bare 404 (e.g. wrong project) must not deactivate");
  assert.equal(classifyFcmError(403, body("PERMISSION_DENIED", { errorCode: "SENDER_ID_MISMATCH" })), "permanent_token");
  assert.equal(classifyFcmError(400, body("INVALID_ARGUMENT", { field: "message.token" })), "permanent_token");
  assert.equal(classifyFcmError(400, body("INVALID_ARGUMENT", { message: "The registration token is not a valid FCM registration token" })), "permanent_token");
  assert.equal(classifyFcmError(400, body("INVALID_ARGUMENT", { field: "message.data" })), "transient", "generic/payload INVALID_ARGUMENT never deactivates");
  assert.equal(classifyFcmError(400, body("INVALID_ARGUMENT")), "transient");
  assert.equal(classifyFcmError(401, body("UNAUTHENTICATED")), "auth_config");
  assert.equal(classifyFcmError(403, body("PERMISSION_DENIED")), "auth_config");
  for (const s of [429, 500, 503, 0]) assert.equal(classifyFcmError(s, null), "transient");
  assert.equal(fcmErrorCode(body("NOT_FOUND", { errorCode: "UNREGISTERED" })), "UNREGISTERED");
  assert.equal(fcmErrorCode({ error: { status: "SOMETHING_NEW", message: BODY_MARKER } }), "UNKNOWN", "only allowlisted names are ever surfaced");
});

// ── Dispatch: device selection, preferences, send ────────────────────────────

test("dispatchFcmPush: sends only to ACTIVE ANDROID devices (ios and inactive excluded); request shape is correct", async () => {
  const f = makeFetch();
  const devices = [
    device("row-a", ANDROID_TOKEN_1),
    device("row-i", IOS_TOKEN, "ios"),
    device("row-x", "fake-inactive-token", "android", "acc-1", false),
  ];
  const { deps, deactivated } = makeDeps(f.fetchFn, { getDevices: async () => devices });
  await dispatchFcmPush(INPUT, deps);
  const sends = f.sendCalls();
  assert.equal(sends.length, 1);
  assert.equal(sends[0].url, "https://fcm.googleapis.com/v1/projects/test-project/messages:send");
  const headers = sends[0].init.headers as Record<string, string>;
  assert.equal(headers.Authorization, `Bearer ${FAKE_ACCESS_TOKEN}`);
  assert.equal(headers["Content-Type"], "application/json");
  const body = JSON.parse(String(sends[0].init.body));
  assert.equal(body.message.token, ANDROID_TOKEN_1);
  assert.deepEqual(body.message.notification, buildApnsAlert("announcement", { actorName: "Coach Smith" }));
  assert.deepEqual(body.message.data, { url: "/team/monroe/notifications", kind: "announcement" });
  assert.equal(deactivated.length, 0);
  assert.ok(!JSON.stringify(f.calls).includes(IOS_TOKEN));
});

test("dispatchFcmPush: no android devices -> no token exchange and no send", async () => {
  const f = makeFetch();
  const { deps } = makeDeps(f.fetchFn, { getDevices: async () => [device("row-i", IOS_TOKEN, "ios")] });
  await dispatchFcmPush(INPUT, deps);
  assert.equal(f.calls.length, 0);
});

test("dispatchFcmPush: honors per-account category preferences (same gating as APNs) and looks each account up once", async () => {
  const f = makeFetch();
  const prefsCalls: string[] = [];
  const off: PushPreferences = { team_updates: false, messages: true, calendar: true, requests: true };
  const on: PushPreferences = { team_updates: true, messages: true, calendar: true, requests: true };
  const { deps } = makeDeps(f.fetchFn, {
    getDevices: async () => [device("r1", ANDROID_TOKEN_1, "android", "acc-1"), device("r2", "fake-token-r2", "android", "acc-1"), device("r3", ANDROID_TOKEN_2, "android", "acc-2")],
    getPrefs: async id => { prefsCalls.push(id); return id === "acc-1" ? off : on; },
  });
  await dispatchFcmPush(INPUT, deps);
  const sent = f.sendCalls().map(c => JSON.parse(String(c.init.body)).message.token);
  assert.deepEqual(sent, [ANDROID_TOKEN_2]);
  assert.deepEqual(prefsCalls.sort(), ["acc-1", "acc-2"]);
});

test("dispatchFcmPush: the access token is reused across dispatches (one exchange)", async () => {
  const f = makeFetch();
  const { deps } = makeDeps(f.fetchFn);
  await dispatchFcmPush(INPUT, deps);
  await dispatchFcmPush(INPUT, deps);
  assert.equal(f.tokenCalls(), 1);
  assert.equal(f.sendCalls().length, 2);
});

test("dispatchFcmPush: concurrency is bounded", async () => {
  let inFlight = 0;
  let peak = 0;
  const f = makeFetch(() => new Response("{}", { status: 200 }));
  const wrapped: FcmFetch = async (url, init) => {
    if (url.includes("fcm.googleapis.com")) {
      inFlight++; peak = Math.max(peak, inFlight);
      await new Promise(r => setTimeout(r, 5));
      inFlight--;
    }
    return f.fetchFn(url, init);
  };
  const many = Array.from({ length: 30 }, (_, i) => device(`row-${i}`, `fake-token-${i}`));
  const { deps } = makeDeps(wrapped, { getDevices: async () => many });
  await dispatchFcmPush(INPUT, deps);
  assert.equal(f.sendCalls().length, 30);
  assert.ok(peak <= 8 && peak > 1, `peak concurrency ${peak}`);
});

// ── Invalid-token cleanup vs transient errors ────────────────────────────────

const PERMANENT_CASES: Array<[string, () => Response]> = [
  ["UNREGISTERED", () => fcmError(404, "NOT_FOUND", { errorCode: "UNREGISTERED" })],
  ["token-specific INVALID_ARGUMENT", () => fcmError(400, "INVALID_ARGUMENT", { field: "message.token" })],
  ["SENDER_ID_MISMATCH", () => fcmError(403, "PERMISSION_DENIED", { errorCode: "SENDER_ID_MISMATCH" })],
];
for (const [name, make] of PERMANENT_CASES) {
  test(`dispatchFcmPush: ${name} deactivates exactly that device row`, async () => {
    const f = makeFetch(token => (token === ANDROID_TOKEN_1 ? make() : new Response("{}", { status: 200 })));
    const { deps, deactivated } = makeDeps(f.fetchFn, {
      getDevices: async () => [device("row-bad", ANDROID_TOKEN_1), device("row-good", ANDROID_TOKEN_2)],
    });
    await dispatchFcmPush(INPUT, deps);
    assert.deepEqual(deactivated, ["row-bad"]);
  });
}

const TRANSIENT_CASES: Array<[string, () => Response | Error]> = [
  ["generic INVALID_ARGUMENT", () => fcmError(400, "INVALID_ARGUMENT", { field: "message.data" })],
  ["500 INTERNAL", () => fcmError(500, "INTERNAL", { errorCode: "INTERNAL" })],
  ["503 UNAVAILABLE", () => fcmError(503, "UNAVAILABLE", { errorCode: "UNAVAILABLE" })],
  ["429 QUOTA_EXCEEDED", () => fcmError(429, "RESOURCE_EXHAUSTED", { errorCode: "QUOTA_EXCEEDED" })],
  ["401 UNAUTHENTICATED", () => fcmError(401, "UNAUTHENTICATED")],
  ["403 PERMISSION_DENIED (not sender mismatch)", () => fcmError(403, "PERMISSION_DENIED")],
  ["bare 404 (wrong project)", () => fcmError(404, "NOT_FOUND")],
  ["network failure", () => new Error("socket hang up")],
];
for (const [name, make] of TRANSIENT_CASES) {
  test(`dispatchFcmPush: ${name} does NOT deactivate and does not break dispatch`, async () => {
    const f = makeFetch(() => make());
    const { deps, deactivated } = makeDeps(f.fetchFn);
    await assert.doesNotReject(dispatchFcmPush(INPUT, deps));
    assert.equal(deactivated.length, 0);
  });
}

test("dispatchFcmPush: a request timeout does not deactivate and resolves", async () => {
  const hang: FcmFetch = (url, init) => {
    if (url.endsWith("/token")) return Promise.resolve(new Response(JSON.stringify({ access_token: FAKE_ACCESS_TOKEN, expires_in: 3600 }), { status: 200 }));
    return new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
  };
  const { deps, deactivated } = makeDeps(hang, { timeoutMs: 20 });
  await dispatchFcmPush(INPUT, deps);
  assert.equal(deactivated.length, 0);
});

test("dispatchFcmPush: a 401 invalidates the cached access token so the next dispatch refreshes it", async () => {
  let respond401 = true;
  const f = makeFetch(() => (respond401 ? fcmError(401, "UNAUTHENTICATED") : new Response("{}", { status: 200 })));
  const { deps } = makeDeps(f.fetchFn);
  await dispatchFcmPush(INPUT, deps);
  respond401 = false;
  await dispatchFcmPush(INPUT, deps);
  assert.equal(f.tokenCalls(), 2);
});

test("dispatchFcmPush: an access-token failure sends nothing and deactivates nothing", async () => {
  const f = makeFetch(undefined, 500);
  const { deps, deactivated } = makeDeps(f.fetchFn);
  await dispatchFcmPush(INPUT, deps);
  assert.equal(f.sendCalls().length, 0);
  assert.equal(deactivated.length, 0);
});

test("dispatchFcmPush: a throwing dependency never escapes", async () => {
  const f = makeFetch();
  const { deps } = makeDeps(f.fetchFn, { getDevices: async () => { throw new Error("db down"); } });
  await assert.doesNotReject(dispatchFcmPush(INPUT, deps));
});

// ── Logging safety ───────────────────────────────────────────────────────────

test("dispatchFcmPush: default logging never contains tokens, JWTs, keys, client email, access tokens or response bodies", async () => {
  const captured: string[] = [];
  const original = { log: console.log, error: console.error, warn: console.warn, info: console.info, debug: console.debug };
  const capture = (...args: unknown[]) => { captured.push(args.map(a => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")); };
  console.log = capture; console.error = capture; console.warn = capture; console.info = capture; console.debug = capture;
  const f = makeFetch(token => (token === ANDROID_TOKEN_1 ? fcmError(404, "NOT_FOUND", { errorCode: "UNREGISTERED" }) : token === ANDROID_TOKEN_2 ? fcmError(500, "INTERNAL", { errorCode: "INTERNAL" }) : new Response("{}", { status: 200 })));
  try {
    const { deps } = makeDeps(f.fetchFn, {
      log: undefined,
      getDevices: async () => [device("row-1", ANDROID_TOKEN_1), device("row-2", ANDROID_TOKEN_2), device("row-3", "fake-android-registration-token-3")],
    });
    delete deps.log; // use the real default logger, which writes to console
    await dispatchFcmPush(INPUT, deps);
  } finally {
    Object.assign(console, original);
  }
  const output = captured.join("\n");
  assert.match(output, /\[fcm\] dispatch_finished/, "the run must actually log (non-vacuous)");
  const jwt = buildServiceAccountJwt(CONFIG, 1);
  for (const secret of [ANDROID_TOKEN_1, ANDROID_TOKEN_2, "fake-android-registration-token-3", FAKE_ACCESS_TOKEN, "BEGIN PRIVATE KEY", CONFIG.clientEmail, jwt.split(".")[0], BODY_MARKER]) {
    assert.ok(!output.includes(secret), `log output must not contain ${secret.slice(0, 12)}…`);
  }
  assert.match(output, /row-1/, "opaque device row ids are fine to log");
});
