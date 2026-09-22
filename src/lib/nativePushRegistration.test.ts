// Phase 2C / Phase 2E: behavior of the native push registration flow,
// exercised with an injected plugin (no Capacitor runtime, no jsdom). Tokens
// here are obviously fake strings.
//
// Phase 2E split the single startNativePushRegistration() into two
// independent pieces -- attachNativePushListeners (registration,
// registrationError, pushNotificationActionPerformed) and
// resolveNativePushPermissionAndRegister (permission/channel/register()) --
// so listener attachment can live permanently at the root of the app while
// permission/registration stays authenticated and contextual. Tests below
// are split the same way.
import test from "node:test";
import assert from "node:assert/strict";
import {
  ANDROID_PUSH_CHANNEL,
  ANDROID_PUSH_CHANNEL_ID,
  attachNativePushListeners,
  registerDeviceTokenWithRotation,
  resolveNativePushPermissionAndRegister,
  type PermissionPromptSession,
  type PushPluginLike,
  type TokenRegistrationIO,
} from "./nativePushRegistration.ts";

type Call = string;

function fakePlugin(opts: { initial?: string; afterRequest?: string; channelFails?: boolean } = {}) {
  const calls: Call[] = [];
  const handlers: Record<string, (arg: never) => void> = {};
  const removed: string[] = [];
  const plugin = {
    async addListener(event: string, cb: (arg: never) => void) {
      calls.push(`addListener:${event}`);
      handlers[event] = cb;
      return { remove: () => { removed.push(event); } };
    },
    async checkPermissions() { calls.push("checkPermissions"); return { receive: opts.initial ?? "denied" }; },
    async requestPermissions() { calls.push("requestPermissions"); return { receive: opts.afterRequest ?? "denied" }; },
    async register() { calls.push("register"); },
    async createChannel(channel: unknown) {
      calls.push("createChannel");
      if (opts.channelFails) throw new Error("channel failed");
      (plugin as unknown as { lastChannel: unknown }).lastChannel = channel;
    },
  } as unknown as PushPluginLike & { lastChannel?: unknown };
  return { plugin, calls, handlers, removed };
}

function memorySession(initial = false): PermissionPromptSession & { prompted: boolean } {
  const s = {
    prompted: initial,
    wasPrompted() { return s.prompted; },
    markPrompted() { s.prompted = true; },
  };
  return s;
}

async function attach(platform: "ios" | "android", plugin: PushPluginLike, extra: {
  cancelled?: boolean;
  registered?: Array<[string, string]>;
  navigated?: string[];
} = {}) {
  const registered = extra.registered ?? [];
  const navigated = extra.navigated ?? [];
  const remove = await attachNativePushListeners({
    platform,
    plugin,
    registerToken: async (p, t) => { registered.push([p, t]); },
    navigate: u => { navigated.push(u); },
    isCancelled: () => extra.cancelled ?? false,
  });
  return { remove, registered, navigated };
}

async function resolve(platform: "ios" | "android", plugin: PushPluginLike, extra: {
  session?: PermissionPromptSession;
  cancelled?: boolean;
} = {}) {
  await resolveNativePushPermissionAndRegister({
    platform,
    plugin,
    isCancelled: () => extra.cancelled ?? false,
    promptSession: extra.session ?? memorySession(),
  });
}

const LISTENERS = ["addListener:registration", "addListener:registrationError", "addListener:pushNotificationActionPerformed"];

// ── attachNativePushListeners: listener attachment only ──────────────────────

test("attach: registers exactly the three expected listeners, nothing else", async () => {
  const f = fakePlugin();
  await attach("android", f.plugin);
  assert.deepEqual(f.calls, LISTENERS);
});

test("attach: does not touch permission/channel/register at all", async () => {
  const f = fakePlugin();
  await attach("ios", f.plugin);
  assert.ok(!f.calls.includes("checkPermissions"));
  assert.ok(!f.calls.includes("requestPermissions"));
  assert.ok(!f.calls.includes("createChannel"));
  assert.ok(!f.calls.includes("register"));
});

test("attach: two independent calls each attach their own three listeners (no shared/global state)", async () => {
  const a = fakePlugin();
  const b = fakePlugin();
  await attach("android", a.plugin);
  await attach("android", b.plugin);
  assert.deepEqual(a.calls, LISTENERS);
  assert.deepEqual(b.calls, LISTENERS);
});

test("remove() detaches all three listeners, and only those three", async () => {
  const f = fakePlugin();
  const { remove } = await attach("android", f.plugin);
  remove();
  assert.deepEqual(f.removed.sort(), ["pushNotificationActionPerformed", "registration", "registrationError"]);
});

test("iOS token -> registerToken('ios', token)", async () => {
  const f = fakePlugin();
  const { registered } = await attach("ios", f.plugin);
  (f.handlers["registration"] as (t: { value: string }) => void)({ value: "fake-ios-token" });
  assert.deepEqual(registered, [["ios", "fake-ios-token"]]);
});

test("Android token -> registerToken('android', token); ignored after teardown", async () => {
  const f = fakePlugin();
  const state = { cancelled: false };
  const registered: Array<[string, string]> = [];
  await attachNativePushListeners({
    platform: "android",
    plugin: f.plugin,
    registerToken: async (p, t) => { registered.push([p, t]); },
    navigate: () => {},
    isCancelled: () => state.cancelled,
  });
  const onToken = f.handlers["registration"] as (t: { value: string }) => void;
  onToken({ value: "fake-android-token" });
  state.cancelled = true;
  onToken({ value: "fake-late-token" });
  assert.deepEqual(registered, [["android", "fake-android-token"]]);
});

// ── Notification tap routing (attachNativePushListeners owns this) ───────────

test("tap: safe same-origin paths navigate (both platforms)", async () => {
  for (const platform of ["ios", "android"] as const) {
    const f = fakePlugin();
    const navigated: string[] = [];
    await attach(platform, f.plugin, { navigated });
    const onTap = f.handlers["pushNotificationActionPerformed"] as (a: unknown) => void;
    onTap({ notification: { data: { url: "/team/example-team/messages/abc123" } } });
    onTap({ notification: { data: { url: "/team/example-team/calendar" } } });
    assert.deepEqual(navigated, ["/team/example-team/messages/abc123", "/team/example-team/calendar"], platform);
  }
});

test("tap: unsafe or missing urls are ignored", async () => {
  const f = fakePlugin();
  const navigated: string[] = [];
  await attach("android", f.plugin, { navigated });
  const onTap = f.handlers["pushNotificationActionPerformed"] as (a: unknown) => void;
  for (const url of [
    "https://evil.example/x",
    "//evil.example/x",
    "javascript:alert(1)",
    "/javascript:alert(1)",
    "/team\\evil",
    "team/relative",
    "",
    undefined,
    null,
    42,
    { href: "/team/x" },
  ]) {
    onTap({ notification: { data: { url } } });
  }
  onTap({});
  onTap({ notification: {} });
  assert.deepEqual(navigated, []);
});

test("tap after teardown is ignored", async () => {
  const f = fakePlugin();
  const navigated: string[] = [];
  const state = { cancelled: false };
  await attachNativePushListeners({
    platform: "android",
    plugin: f.plugin,
    registerToken: async () => {},
    navigate: u => { navigated.push(u); },
    isCancelled: () => state.cancelled,
  });
  state.cancelled = true;
  (f.handlers["pushNotificationActionPerformed"] as (a: unknown) => void)({ notification: { data: { url: "/team/x" } } });
  assert.deepEqual(navigated, []);
});

// ── resolveNativePushPermissionAndRegister: iOS ───────────────────────────────

test("iOS: checkPermissions, requestPermissions on 'prompt', then register -- no channel, no listeners", async () => {
  const f = fakePlugin({ initial: "prompt", afterRequest: "granted" });
  await resolve("ios", f.plugin);
  assert.deepEqual(f.calls, ["checkPermissions", "requestPermissions", "register"]);
});

test("iOS: already granted -> no prompt, register", async () => {
  const f = fakePlugin({ initial: "granted" });
  await resolve("ios", f.plugin);
  assert.deepEqual(f.calls, ["checkPermissions", "register"]);
});

test("iOS: denied -> no prompt and no register", async () => {
  const f = fakePlugin({ initial: "denied" });
  await resolve("ios", f.plugin);
  assert.deepEqual(f.calls, ["checkPermissions"]);
});

test("iOS: 'prompt-with-rationale' is NOT treated as promptable (that state is Android-only)", async () => {
  const f = fakePlugin({ initial: "prompt-with-rationale", afterRequest: "granted" });
  await resolve("ios", f.plugin);
  assert.ok(!f.calls.includes("requestPermissions"));
  assert.ok(!f.calls.includes("register"));
});

test("iOS: ignores the Android once-per-session prompt flag (previous behavior preserved)", async () => {
  const f = fakePlugin({ initial: "prompt", afterRequest: "granted" });
  await resolve("ios", f.plugin, { session: memorySession(true) });
  assert.ok(f.calls.includes("requestPermissions"));
  assert.ok(f.calls.includes("register"));
});

test("iOS: cancelled before register -> register never called", async () => {
  const f = fakePlugin({ initial: "granted" });
  await resolve("ios", f.plugin, { cancelled: true });
  assert.ok(!f.calls.includes("register"));
});

// ── resolveNativePushPermissionAndRegister: Android ───────────────────────────

test("Android 12 and below (plugin reports 'granted'): no prompt, channel then register", async () => {
  const f = fakePlugin({ initial: "granted" });
  await resolve("android", f.plugin);
  assert.deepEqual(f.calls, ["checkPermissions", "createChannel", "register"]);
});

test("Android 13+ 'prompt' -> request once -> granted -> channel then register", async () => {
  const f = fakePlugin({ initial: "prompt", afterRequest: "granted" });
  await resolve("android", f.plugin);
  assert.deepEqual(f.calls, ["checkPermissions", "requestPermissions", "createChannel", "register"]);
});

test("Android 13+ 'prompt-with-rationale' is promptable too", async () => {
  const f = fakePlugin({ initial: "prompt-with-rationale", afterRequest: "granted" });
  await resolve("android", f.plugin);
  assert.ok(f.calls.includes("requestPermissions"));
  assert.ok(f.calls.includes("register"));
});

test("Android: permission denied after the prompt -> no channel and no register", async () => {
  const f = fakePlugin({ initial: "prompt", afterRequest: "denied" });
  await resolve("android", f.plugin);
  assert.ok(f.calls.includes("requestPermissions"));
  assert.ok(!f.calls.includes("createChannel"));
  assert.ok(!f.calls.includes("register"));
});

test("Android: already denied -> never prompts, never registers", async () => {
  const f = fakePlugin({ initial: "denied" });
  await resolve("android", f.plugin);
  assert.ok(!f.calls.includes("requestPermissions"));
  assert.ok(!f.calls.includes("register"));
});

test("Android: the prompt is shown at most once per app session (no nagging on later mounts)", async () => {
  const session = memorySession();
  const first = fakePlugin({ initial: "prompt", afterRequest: "denied" });
  await resolve("android", first.plugin, { session });
  assert.equal(first.calls.filter(c => c === "requestPermissions").length, 1);

  const second = fakePlugin({ initial: "prompt-with-rationale", afterRequest: "granted" });
  await resolve("android", second.plugin, { session });
  assert.ok(!second.calls.includes("requestPermissions"), "second mount must not re-prompt");
  assert.ok(!second.calls.includes("register"), "and must not register while permission is missing");
});

test("Android: a later mount registers once the user granted permission in system settings", async () => {
  const session = memorySession(true);
  const f = fakePlugin({ initial: "granted" });
  await resolve("android", f.plugin, { session });
  assert.ok(f.calls.includes("register"));
});

test("Android: cancelled before permission check -> nothing happens", async () => {
  const f = fakePlugin({ initial: "granted" });
  await resolve("android", f.plugin, { cancelled: true });
  assert.deepEqual(f.calls, []);
});

// ── Channel ─────────────────────────────────────────────────────────────────

test("channel spec: single stable 'elf_default' channel named 'ELF Notifications', importance HIGH", async () => {
  assert.equal(ANDROID_PUSH_CHANNEL_ID, "elf_default");
  assert.equal(ANDROID_PUSH_CHANNEL.id, "elf_default");
  assert.equal(ANDROID_PUSH_CHANNEL.name, "ELF Notifications");
  assert.equal(ANDROID_PUSH_CHANNEL.importance, 4);
  const f = fakePlugin({ initial: "granted" });
  await resolve("android", f.plugin);
  assert.equal(f.calls.filter(c => c === "createChannel").length, 1, "exactly one channel is created");
  assert.equal((f.plugin as unknown as { lastChannel: { id: string } }).lastChannel.id, "elf_default");
});

test("channel creation failure never blocks registration", async () => {
  const f = fakePlugin({ initial: "granted", channelFails: true });
  await resolve("android", f.plugin);
  assert.deepEqual(f.calls, ["checkPermissions", "createChannel", "register"]);
});

test("channel creation is repeat-safe: two mounts both attempt it without error", async () => {
  const a = fakePlugin({ initial: "granted" });
  const b = fakePlugin({ initial: "granted" });
  await resolve("android", a.plugin);
  await resolve("android", b.plugin);
  assert.ok(a.calls.includes("createChannel") && b.calls.includes("createChannel"));
});

// ── Token rotation ───────────────────────────────────────────────────────────

function fakeIO(opts: { saved?: string | null; ok?: boolean; registerThrows?: boolean; deactivateThrows?: boolean } = {}) {
  const posts: Array<{ path: string; body: unknown }> = [];
  const state = { saved: opts.saved ?? null, order: [] as string[] };
  const io: TokenRegistrationIO = {
    getSaved: () => state.saved,
    save: t => { state.saved = t; state.order.push("save"); },
    post: async (path, body) => {
      state.order.push(`post:${path}`);
      posts.push({ path, body });
      if (path === "/api/push/devices" && opts.registerThrows) throw new Error("network");
      if (path === "/api/push/devices/deactivate" && opts.deactivateThrows) throw new Error("network");
      return path === "/api/push/devices" ? (opts.ok ?? true) : true;
    },
  };
  return { io, posts, state };
}

test("Android rotation: new token registers, then the previous token is deactivated (exact payloads)", async () => {
  const f = fakeIO({ saved: "fake-old-token" });
  await registerDeviceTokenWithRotation("android", "fake-new-token", f.io);
  assert.deepEqual(f.posts, [
    { path: "/api/push/devices", body: { platform: "android", device_token: "fake-new-token" } },
    { path: "/api/push/devices/deactivate", body: { platform: "android", device_token: "fake-old-token" } },
  ]);
  assert.equal(f.state.saved, "fake-new-token");
  assert.deepEqual(f.state.order, ["save", "post:/api/push/devices", "post:/api/push/devices/deactivate"]);
});

test("Android: same token again -> re-registers (upsert refresh), never deactivates", async () => {
  const f = fakeIO({ saved: "fake-same-token" });
  await registerDeviceTokenWithRotation("android", "fake-same-token", f.io);
  assert.deepEqual(f.posts.map(p => p.path), ["/api/push/devices"]);
});

test("Android: no previous token -> no deactivate call", async () => {
  const f = fakeIO({ saved: null });
  await registerDeviceTokenWithRotation("android", "fake-first-token", f.io);
  assert.deepEqual(f.posts.map(p => p.path), ["/api/push/devices"]);
});

test("Android: registration failure (non-2xx) -> old token is kept active, no deactivate", async () => {
  const f = fakeIO({ saved: "fake-old-token", ok: false });
  await registerDeviceTokenWithRotation("android", "fake-new-token", f.io);
  assert.deepEqual(f.posts.map(p => p.path), ["/api/push/devices"]);
  assert.equal(f.state.saved, "fake-new-token", "still saved locally so logout can deactivate it");
});

test("Android: registration network error -> resolves, no deactivate, token still saved", async () => {
  const f = fakeIO({ saved: "fake-old-token", registerThrows: true });
  await registerDeviceTokenWithRotation("android", "fake-new-token", f.io);
  assert.deepEqual(f.posts.map(p => p.path), ["/api/push/devices"]);
  assert.equal(f.state.saved, "fake-new-token");
});

test("Android: a failing deactivate never throws or blocks", async () => {
  const f = fakeIO({ saved: "fake-old-token", deactivateThrows: true });
  await assert.doesNotReject(registerDeviceTokenWithRotation("android", "fake-new-token", f.io));
  assert.equal(f.state.saved, "fake-new-token");
});

test("iOS: token changes are registered exactly as before -- never a deactivate call", async () => {
  const f = fakeIO({ saved: "fake-old-ios-token" });
  await registerDeviceTokenWithRotation("ios", "fake-new-ios-token", f.io);
  assert.deepEqual(f.posts, [
    { path: "/api/push/devices", body: { platform: "ios", device_token: "fake-new-ios-token" } },
  ]);
});

// ── No token logging ─────────────────────────────────────────────────────────

test("no console output at all while attaching, resolving permission, rotating and routing (tokens never logged)", async () => {
  const MARKER = "fake-secret-token-marker";
  const seen: string[] = [];
  const methods = ["log", "info", "warn", "error", "debug"] as const;
  const originals = methods.map(m => console[m]);
  methods.forEach(m => { console[m] = (...args: unknown[]) => { seen.push(args.map(String).join(" ")); }; });
  try {
    const f = fakePlugin({ initial: "prompt", afterRequest: "granted", channelFails: true });
    await attach("android", f.plugin);
    await resolve("android", f.plugin);
    (f.handlers["registration"] as (t: { value: string }) => void)({ value: MARKER });
    (f.handlers["registrationError"] as (e: unknown) => void)({ message: MARKER });
    (f.handlers["pushNotificationActionPerformed"] as (a: unknown) => void)({ notification: { data: { url: "https://evil.example/" + MARKER } } });
    const io = fakeIO({ saved: MARKER + "-old", deactivateThrows: true });
    await registerDeviceTokenWithRotation("android", MARKER, io.io);
  } finally {
    methods.forEach((m, i) => { console[m] = originals[i]; });
  }
  assert.deepEqual(seen.filter(line => line.includes(MARKER)), []);
  assert.deepEqual(seen, [], "the flow should not log anything");
});
