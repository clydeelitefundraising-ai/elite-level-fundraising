import test from "node:test";
import assert from "node:assert/strict";
import { shareFileOrFallback } from "./nativeFileShare.ts";

// Manual set/restore rather than a beforeEach/afterEach hook, so a failure
// mid-test can't leave stale globals for a later test regardless of run
// order — each test is responsible for its own cleanup via try/finally.

function withAndroidBridge<T>(bridge: unknown, run: () => T | Promise<T>): Promise<T> | T {
  const globals = globalThis as { ElfAndroidFiles?: unknown };
  const previous = globals.ElfAndroidFiles;
  globals.ElfAndroidFiles = bridge;
  const restore = () => { globals.ElfAndroidFiles = previous; };
  try {
    const result = run();
    if (result instanceof Promise) return result.finally(restore);
    restore();
    return result;
  } catch (err) {
    restore();
    throw err;
  }
}

function withNavigator<T>(nav: unknown, run: () => T | Promise<T>): Promise<T> | T {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { value: nav, configurable: true, writable: true });
  const restore = () => {
    if (previous) Object.defineProperty(globalThis, "navigator", previous);
  };
  try {
    const result = run();
    if (result instanceof Promise) return result.finally(restore);
    restore();
    return result;
  } catch (err) {
    restore();
    throw err;
  }
}

test("shareFileOrFallback: Android bridge present is preferred over navigator.share and fallback", async () => {
  const bytes = new TextEncoder().encode("Hello");
  const file = new File([bytes], "donations.csv", { type: "text/csv" });

  let bridgeArgs: [string, string, string] | null = null;
  const bridge = {
    saveAndShare: (base64Data: string, fileName: string, mimeType: string) => {
      bridgeArgs = [base64Data, fileName, mimeType];
      return JSON.stringify({ ok: true, fileName });
    },
  };

  let shareCalled = false;
  const nav = {
    canShare: () => true,
    share: async () => { shareCalled = true; },
  };
  let fallbackCalled = false;

  await withAndroidBridge(bridge, () =>
    withNavigator(nav, () => shareFileOrFallback(file, () => { fallbackCalled = true; })),
  );

  assert.ok(bridgeArgs, "bridge.saveAndShare must be called");
  const [base64Data, fileName, mimeType] = bridgeArgs!;
  assert.equal(fileName, "donations.csv");
  assert.equal(mimeType, "text/csv");
  assert.equal(base64Data, Buffer.from(bytes).toString("base64"), "file bytes must round-trip through base64 correctly");
  assert.equal(shareCalled, false, "navigator.share must not be called when the Android bridge is present");
  assert.equal(fallbackCalled, false, "the anchor/blob fallback must not be called when the Android bridge is present");
});

test("shareFileOrFallback: Android bridge failure is surfaced, never a false success", async () => {
  const file = new File([new Uint8Array([1, 2, 3])], "athletes.csv", { type: "text/csv" });
  const bridge = {
    saveAndShare: () => JSON.stringify({ ok: false, error: "io_error" }),
  };
  let fallbackCalled = false;

  await assert.rejects(
    () => withAndroidBridge(bridge, () => shareFileOrFallback(file, () => { fallbackCalled = true; })),
    /io_error/,
  );
  assert.equal(fallbackCalled, false, "a bridge failure must not silently run the fallback and look like success");
});

test("shareFileOrFallback: Android bridge returning an unparsable response is treated as failure, not success", async () => {
  const file = new File([new Uint8Array([1])], "x.csv", { type: "text/csv" });
  const bridge = { saveAndShare: () => "not json" };

  await assert.rejects(() => withAndroidBridge(bridge, () => shareFileOrFallback(file, () => {})));
});

test("shareFileOrFallback: without the Android bridge, existing navigator.share behavior is used", async () => {
  const file = new File([new Uint8Array([1])], "x.csv", { type: "text/csv" });
  let sharedFiles: File[] | null = null;
  const nav = {
    canShare: () => true,
    share: async (data: { files: File[] }) => { sharedFiles = data.files; },
  };
  let fallbackCalled = false;

  await withAndroidBridge(undefined, () =>
    withNavigator(nav, () => shareFileOrFallback(file, () => { fallbackCalled = true; })),
  );

  assert.deepEqual(sharedFiles, [file]);
  assert.equal(fallbackCalled, false);
});

test("shareFileOrFallback: without the Android bridge and without Web Share support, the existing anchor fallback runs", async () => {
  const file = new File([new Uint8Array([1])], "x.csv", { type: "text/csv" });
  const nav = {}; // no canShare/share — matches a plain desktop browser
  let fallbackCalled = false;

  await withAndroidBridge(undefined, () =>
    withNavigator(nav, () => shareFileOrFallback(file, () => { fallbackCalled = true; })),
  );

  assert.equal(fallbackCalled, true);
});
