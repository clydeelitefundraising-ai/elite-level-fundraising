// Phase 4-2 — downloading completion CSV reports: fetch/validate, delivery
// (Android bridge, iOS Share sheet with a second tap, desktop download).
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import {
  REPORT_MESSAGES,
  ReportDownloadError,
  anchorDownload,
  deliverReport,
  fetchCsvReport,
  reportErrorMessage,
  reportFilename,
} from "./reportDownload.ts";
import { shareFileWithOutcome } from "../_components/nativeFileShare.ts";

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

// ── Delivery ──────────────────────────────────────────────────────────────

const aFile = () => new File([csvBytes()], "r.csv", { type: "text/csv;charset=utf-8" });

test("delivery: no file sharing (desktop) -> one normal download", async () => {
  let downloads = 0;
  assert.equal(await deliverReport(aFile(), async () => "unsupported", () => { downloads++; }), "downloaded");
  assert.equal(downloads, 1);
});

test("delivery: Android bridge / Share sheet / cancelled -> no extra download", async () => {
  for (const outcome of ["saved", "shared", "cancelled"] as const) {
    let downloads = 0;
    assert.equal(await deliverReport(aFile(), async () => outcome, () => { downloads++; }), outcome);
    assert.equal(downloads, 0, outcome);
  }
});

test("delivery: iOS refusing the Share sheet (expired tap) -> needs_tap, never a silent no-op download", async () => {
  let downloads = 0;
  assert.equal(await deliverReport(aFile(), async () => "needs_tap", () => { downloads++; }), "needs_tap");
  assert.equal(downloads, 0);
});

test("delivery: a device failure is a plain error", async () => {
  await rejects(deliverReport(aFile(), async () => { throw new Error("bridge said no"); }, () => {}), REPORT_MESSAGES.shareFailed);
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

test("iOS second tap: first share refused (expired tap), the next direct tap opens it", async () => {
  let calls = 0;
  const nav = { canShare: () => true, share: async () => { if (++calls === 1) throw domError("NotAllowedError"); } };
  await withGlobals({ nav }, async () => {
    const file = aFile();
    assert.equal(await deliverReport(file), "needs_tap");      // after the slow report
    assert.equal(await deliverReport(file), "shared");         // "Report ready — Save CSV" tap
  });
  assert.equal(calls, 2);
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
