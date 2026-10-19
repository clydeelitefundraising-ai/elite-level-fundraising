// Phase 4-2 — downloading completion CSV reports: fetch/validate, delivery
// (Android bridge, iOS Share sheet with a second tap, desktop download).
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import {
  REPORT_MESSAGES,
  ReportDownloadError,
  anchorDownload,
  deliverReport,
  deliveryEnvironment,
  fetchCsvReport,
  reportErrorMessage,
  reportFilename,
} from "./reportDownload.ts";
import { shareFileWithOutcome } from "../_components/nativeFileShare.ts";
import { getNativePlatform } from "../../../../lib/nativePushDevice.ts";

const BOM = [0xef, 0xbb, 0xbf];
const csvBytes = () => new Uint8Array([...BOM, ...new TextEncoder().encode("Grade,Athlete Name\r\nSenior,\"O'Brien, Kate\"\r\n")]);
const DISPOSITION = `attachment; filename="wolves-todo-all-tasks-completion-2026-10-19.csv"; filename*=UTF-8''wolves-todo-all-tasks-completion-2026-10-19.csv`;
const csvResponse = (body: BodyInit = csvBytes(), headers: Record<string, string> = {}) =>
  new Response(body, { status: 200, headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": DISPOSITION, ...headers } });
const fetchReturning = (res: Response | (() => never)) => (async () => (typeof res === "function" ? res() : res)) as unknown as typeof fetch;

async function rejects(p: Promise<unknown>, message: string) {
  await assert.rejects(p, (err: unknown) => err instanceof ReportDownloadError && err.message === message);
}

// ── Fetch and validate ────────────────────────────────────────────────────

test("a CSV response becomes a file with the exact bytes — UTF-8 BOM kept — and the server's filename", async () => {
  let opts: RequestInit | undefined;
  const file = await fetchCsvReport("/x", "fallback.csv", (async (_u: string, o?: RequestInit) => { opts = o; return csvResponse(); }) as unknown as typeof fetch);
  assert.equal(file.name, "wolves-todo-all-tasks-completion-2026-10-19.csv");
  assert.equal(file.type, "text/csv;charset=utf-8");
  assert.deepEqual([...new Uint8Array(await file.arrayBuffer())], [...csvBytes()]);
  assert.equal(opts?.cache, "no-store");
  assert.equal(opts?.credentials, "same-origin"); // the session cookie goes with it
});

test("JSON error responses are never saved as a CSV: plain message per status", async () => {
  const json = (status: number) => new Response(JSON.stringify({ error: "x", reason: "y" }), { status, headers: { "content-type": "application/json" } });
  for (const [status, message] of [
    [401, REPORT_MESSAGES.forbidden], [403, REPORT_MESSAGES.forbidden], [404, REPORT_MESSAGES.notFound],
    [409, REPORT_MESSAGES.archived], [413, REPORT_MESSAGES.tooLarge], [503, REPORT_MESSAGES.unverified], [500, REPORT_MESSAGES.unverified],
  ] as const) {
    await rejects(fetchCsvReport("/x", "f.csv", fetchReturning(json(status))), message);
    assert.equal(reportErrorMessage(status), message);
  }
  // A 200 that isn't a CSV (e.g. a JSON or HTML page) is refused too.
  await rejects(fetchCsvReport("/x", "f.csv", fetchReturning(new Response("{}", { status: 200, headers: { "content-type": "application/json" } }))), REPORT_MESSAGES.unexpected);
  await rejects(fetchCsvReport("/x", "f.csv", fetchReturning(new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }))), REPORT_MESSAGES.unexpected);
  // A CSV without the BOM (not one of ours) is refused.
  await rejects(fetchCsvReport("/x", "f.csv", fetchReturning(csvResponse("Grade\r\n"))), REPORT_MESSAGES.unexpected);
  await rejects(fetchCsvReport("/x", "f.csv", fetchReturning(csvResponse(new Uint8Array([0xef])))), REPORT_MESSAGES.unexpected);
});

test("network failures give a plain message", async () => {
  await rejects(fetchCsvReport("/x", "f.csv", (async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch), REPORT_MESSAGES.network);
});

test("filenames: filename* preferred; anything unusual falls back", () => {
  assert.equal(reportFilename(DISPOSITION, "f.csv"), "wolves-todo-all-tasks-completion-2026-10-19.csv");
  assert.equal(reportFilename(`attachment; filename="a-b.csv"`, "f.csv"), "a-b.csv");
  for (const bad of [null, "", "attachment", `attachment; filename="../../etc.csv"`, `attachment; filename="x.exe"`, `attachment; filename*=UTF-8''%E0%A4%A`]) {
    assert.equal(reportFilename(bad, "fallback.csv"), "fallback.csv", String(bad));
  }
});

// ── Delivery: decided by where the page runs, never by browser features ──

const aFile = () => new File([csvBytes()], "r.csv", { type: "text/csv;charset=utf-8" });

/** Runs `run` with the globals a real environment would have. `app`
 *  installs the bridge objects the installed ELF apps inject, which
 *  Capacitor's own platform detection reads (window.androidBridge /
 *  window.webkit.messageHandlers.bridge). */
function inEnvironment<T>(env: { app?: "ios" | "android"; nav?: unknown; bridge?: unknown; width?: number; userAgent?: string }, run: () => Promise<T>): Promise<T> {
  const g = globalThis as Record<string, unknown>;
  const keep = { androidBridge: g.androidBridge, webkit: g.webkit, ElfAndroidFiles: g.ElfAndroidFiles, innerWidth: g.innerWidth };
  const navDesc = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const nav = env.nav ?? {};
  if (env.userAgent) (nav as Record<string, unknown>).userAgent = env.userAgent;
  Object.defineProperty(globalThis, "navigator", { value: nav, configurable: true, writable: true });
  g.androidBridge = env.app === "android" ? { postMessage() {} } : undefined;
  g.webkit = env.app === "ios" ? { messageHandlers: { bridge: { postMessage() {} } } } : undefined;
  g.ElfAndroidFiles = env.bridge;
  g.innerWidth = env.width ?? 1440;
  return run().finally(() => {
    if (navDesc) Object.defineProperty(globalThis, "navigator", navDesc);
    Object.assign(g, keep);
  });
}

/** A browser that DOES support file sharing but refuses it, like Chrome /
 *  Edge on Windows after an async report (the reported bug). */
function refusingShareNavigator() {
  const calls = { canShare: 0, share: 0 };
  const nav = {
    canShare: () => { calls.canShare++; return true; },
    share: async () => { calls.share++; throw new DOMException("expired", "NotAllowedError"); },
  };
  return { nav, calls };
}

test("environment comes from the app platform: browser / Android app / iOS app", async () => {
  assert.equal(deliveryEnvironment(null), "browser");
  assert.equal(deliveryEnvironment("android"), "android-app");
  assert.equal(deliveryEnvironment("ios"), "ios-app");
  // Real Capacitor detection, as the apps' injected bridges make it.
  assert.equal(await inEnvironment({}, async () => deliveryEnvironment(getNativePlatform())), "browser");
  assert.equal(await inEnvironment({ app: "android" }, async () => deliveryEnvironment(getNativePlatform())), "android-app");
  assert.equal(await inEnvironment({ app: "ios" }, async () => deliveryEnvironment(getNativePlatform())), "ios-app");
});

const WINDOWS_CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0";
const MAC_SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

test("Windows desktop (Chrome/Edge supports file sharing): a direct download — the Share API is never touched", async () => {
  for (const width of [360, 390, 430, 1440]) { // a narrowed window changes nothing
    const { nav, calls } = refusingShareNavigator();
    const downloads: File[] = [];
    const result = await inEnvironment({ nav, width, userAgent: WINDOWS_CHROME }, () => deliverReport(aFile(), { download: f => { downloads.push(f); } }));
    assert.equal(result, "downloaded", String(width));
    assert.equal(downloads.length, 1);
    assert.deepEqual([...new Uint8Array(await downloads[0].arrayBuffer())], [...csvBytes()], "exact bytes, BOM first");
    assert.equal(downloads[0].name, "r.csv");
    assert.deepEqual(calls, { canShare: 0, share: 0 }, "no Share sheet on desktop");
  }
});

test("macOS Safari (supports file sharing): a direct download, never 'Report ready'", async () => {
  const nav = { canShare: () => true, share: async () => { throw new Error("must not be called"); } };
  let downloaded = 0;
  assert.equal(await inEnvironment({ nav, userAgent: MAC_SAFARI }, () => deliverReport(aFile(), { download: () => { downloaded++; } })), "downloaded");
  assert.equal(downloaded, 1);
});

test("phone browsers (not the ELF app) download normally too", async () => {
  const nav = { canShare: () => true, share: async () => { throw new Error("must not be called"); } };
  let downloaded = 0;
  assert.equal(await inEnvironment({ nav, width: 390 }, () => deliverReport(aFile(), { download: () => { downloaded++; } })), "downloaded");
  assert.equal(downloaded, 1);
});

test("Android app: the native file bridge gets the exact bytes; no browser download", async () => {
  let sent: string | null = null;
  let downloaded = 0;
  const bridge = { saveAndShare: (b64: string) => { sent = b64; return JSON.stringify({ ok: true }); } };
  const result = await inEnvironment({ app: "android", bridge }, () => deliverReport(aFile(), { download: () => { downloaded++; } }));
  assert.equal(result, "saved");
  assert.deepEqual([...Buffer.from(sent!, "base64")], [...csvBytes()]);
  assert.equal(downloaded, 0);
});

test("Android app: a bridge failure, or no bridge at all, is a visible error — never a silent no-op", async () => {
  const failing = { saveAndShare: () => JSON.stringify({ ok: false, error: "no_space" }) };
  await rejects(inEnvironment({ app: "android", bridge: failing }, () => deliverReport(aFile(), { download: () => assert.fail("no download in the app") })), REPORT_MESSAGES.shareFailed);
  await rejects(inEnvironment({ app: "android" }, () => deliverReport(aFile(), { download: () => assert.fail("no download in the app") })), REPORT_MESSAGES.shareFailed);
});

test("iOS app: Share sheet; expired tap -> needs_tap, the next direct tap shares; no browser download", async () => {
  let calls = 0;
  const shared: number[][] = [];
  const nav = {
    canShare: () => true,
    share: async ({ files }: { files: File[] }) => {
      if (++calls === 1) throw new DOMException("expired", "NotAllowedError");
      shared.push([...new Uint8Array(await files[0].arrayBuffer())].slice(0, 3));
    },
  };
  await inEnvironment({ app: "ios", nav }, async () => {
    const file = aFile();
    const noDownload = { download: () => assert.fail("no download in the app") };
    assert.equal(await deliverReport(file, noDownload), "needs_tap");   // after the slow report
    assert.equal(await deliverReport(file, noDownload), "shared");      // "Report ready — Save CSV" tap
  });
  assert.equal(calls, 2);
  assert.deepEqual(shared, [BOM]);
});

test("iOS app: cancelled stays quiet; no file sharing at all is a visible error", async () => {
  const cancel = { canShare: () => true, share: async () => { throw new DOMException("x", "AbortError"); } };
  assert.equal(await inEnvironment({ app: "ios", nav: cancel }, () => deliverReport(aFile())), "cancelled");
  await rejects(inEnvironment({ app: "ios", nav: {} }, () => deliverReport(aFile())), REPORT_MESSAGES.shareFailed);
  await rejects(inEnvironment({ app: "ios", nav: { canShare: () => true, share: async () => { throw new DOMException("x", "DataError"); } } }, () => deliverReport(aFile())), REPORT_MESSAGES.shareFailed);
});

test("explicit environments behave the same (used by the button)", async () => {
  let downloads = 0;
  assert.equal(await deliverReport(aFile(), { environment: "browser", share: async () => assert.fail("no share"), download: () => { downloads++; } }), "downloaded");
  assert.equal(downloads, 1);
  for (const outcome of ["saved", "shared", "cancelled"] as const) {
    assert.equal(await deliverReport(aFile(), { environment: "ios-app", share: async () => outcome }), outcome);
  }
  assert.equal(await deliverReport(aFile(), { environment: "ios-app", share: async () => "needs_tap" }), "needs_tap");
  await rejects(deliverReport(aFile(), { environment: "android-app", share: async () => "needs_tap" }), REPORT_MESSAGES.shareFailed);
});

// ── shareFileWithOutcome (new, alongside the unchanged shareFileOrFallback) ──

function withGlobals<T>(g: { nav?: unknown; bridge?: unknown }, run: () => Promise<T>): Promise<T> {
  const navDesc = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const globals = globalThis as { ElfAndroidFiles?: unknown };
  const prevBridge = globals.ElfAndroidFiles;
  Object.defineProperty(globalThis, "navigator", { value: g.nav, configurable: true, writable: true });
  globals.ElfAndroidFiles = g.bridge;
  return run().finally(() => {
    if (navDesc) Object.defineProperty(globalThis, "navigator", navDesc);
    globals.ElfAndroidFiles = prevBridge;
  });
}
const domError = (name: string) => new DOMException("x", name);

test("share outcome: Android bridge saves the exact bytes (BOM included) and is preferred", async () => {
  let sent: [string, string, string] | null = null;
  let shared = false;
  const outcome = await withGlobals({
    bridge: { saveAndShare: (b64: string, name: string, type: string) => { sent = [b64, name, type]; return JSON.stringify({ ok: true }); } },
    nav: { canShare: () => true, share: async () => { shared = true; } },
  }, () => shareFileWithOutcome(aFile()));
  assert.equal(outcome, "saved");
  assert.equal(shared, false);
  assert.deepEqual([...Buffer.from(sent![0], "base64")], [...csvBytes()]);
  assert.equal(sent![1], "r.csv");
  assert.equal(sent![2], "text/csv;charset=utf-8");
});

test("share outcome: Android bridge failure is an error, not a false success", async () => {
  await assert.rejects(withGlobals({ bridge: { saveAndShare: () => JSON.stringify({ ok: false, error: "no_space" }) } }, () => shareFileWithOutcome(aFile())), /no_space/);
  await assert.rejects(withGlobals({ bridge: { saveAndShare: () => "not json" } }, () => shareFileWithOutcome(aFile())), /bad_response/);
});

test("share outcome: Share sheet shared / cancelled / NotAllowedError (iOS expired tap) / unsupported / other error", async () => {
  const nav = (share: () => Promise<void>) => ({ canShare: () => true, share });
  assert.equal(await withGlobals({ nav: nav(async () => {}) }, () => shareFileWithOutcome(aFile())), "shared");
  assert.equal(await withGlobals({ nav: nav(async () => { throw domError("AbortError"); }) }, () => shareFileWithOutcome(aFile())), "cancelled");
  assert.equal(await withGlobals({ nav: nav(async () => { throw domError("NotAllowedError"); }) }, () => shareFileWithOutcome(aFile())), "needs_tap");
  assert.equal(await withGlobals({ nav: {} }, () => shareFileWithOutcome(aFile())), "unsupported");
  assert.equal(await withGlobals({ nav: { canShare: () => false, share: async () => {} } }, () => shareFileWithOutcome(aFile())), "unsupported");
  assert.equal(await withGlobals({ nav: undefined }, () => shareFileWithOutcome(aFile())), "unsupported");
  await assert.rejects(withGlobals({ nav: nav(async () => { throw domError("DataError"); }) }, () => shareFileWithOutcome(aFile())));
});

// ── Desktop download cleanup ──────────────────────────────────────────────

test("desktop download: a link with the filename is clicked once and its object URL released", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const created: string[] = [], revoked: string[] = [], clicked: { href: string; download: string }[] = [];
  const body = { children: [] as unknown[], appendChild(n: unknown) { this.children.push(n); }, removeChild(n: unknown) { this.children = this.children.filter(c => c !== n); } };
  const prevDoc = (globalThis as { document?: unknown }).document;
  const origCreate = URL.createObjectURL, origRevoke = URL.revokeObjectURL;
  (globalThis as { document?: unknown }).document = {
    body,
    createElement: () => ({ href: "", download: "", rel: "", click() { clicked.push({ href: this.href, download: this.download }); } }),
  };
  URL.createObjectURL = () => { created.push("blob:1"); return "blob:1"; };
  URL.revokeObjectURL = (u: string) => { revoked.push(u); };
  try {
    anchorDownload(aFile());
    assert.deepEqual(clicked, [{ href: "blob:1", download: "r.csv" }]);
    assert.equal(body.children.length, 0, "link removed");
    assert.deepEqual(revoked, []);
    mock.timers.tick(2000);
    assert.deepEqual(revoked, ["blob:1"], "object URL released");
  } finally {
    (globalThis as { document?: unknown }).document = prevDoc;
    URL.createObjectURL = origCreate;
    URL.revokeObjectURL = origRevoke;
    mock.timers.reset();
  }
});
