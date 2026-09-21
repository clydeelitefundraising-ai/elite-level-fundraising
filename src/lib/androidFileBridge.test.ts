// Phase 1C.2: pure behavior of the Android file bridge's web side. The native
// half (AndroidFileBridge.java) can only be proven on a device/emulator; here
// we pin the helpers that must stay in lock-step with it (filename and MIME
// handling), the JSON contract, and the failure paths -- which must never be
// silent.
import test from "node:test";
import assert from "node:assert/strict";
import {
  AndroidFileBridgeError,
  blobToBase64,
  isPdf,
  normalizeMimeType,
  openWithViewerOnAndroid,
  resultFromJson,
  sanitizeFileName,
  saveAndShareOnAndroid,
  userMessageForError,
} from "./androidFileBridge.ts";

type Call = { method: string; base64: string; name: string; mime: string };

function installBridge(reply: string | ((call: Call) => string)) {
  const calls: Call[] = [];
  const make = (method: string) => (base64: string, name: string, mime: string) => {
    const call = { method, base64, name, mime };
    calls.push(call);
    return typeof reply === "function" ? reply(call) : reply;
  };
  (globalThis as unknown as { window?: unknown }).window = {
    ElfAndroidFiles: { saveAndShare: make("saveAndShare"), openWithViewer: make("openWithViewer") },
  };
  return calls;
}
function removeBridge() {
  delete (globalThis as unknown as { window?: unknown }).window;
}

// ── sanitizeFileName ──

test("sanitizeFileName strips path segments (unix and windows separators)", () => {
  assert.equal(sanitizeFileName("../../etc/passwd"), "passwd");
  assert.equal(sanitizeFileName("a/b\\c.csv"), "c.csv");
  assert.equal(sanitizeFileName("C:\\Users\\x\\report.pdf"), "report.pdf");
});

test("sanitizeFileName replaces unsafe characters and collapses dot runs", () => {
  assert.equal(sanitizeFileName("re port?.csv"), "re port_.csv");
  assert.equal(sanitizeFileName("a..b...c.txt"), "a.b.c.txt");
  assert.equal(sanitizeFileName("we<i>rd|na\"me.png"), "we_i_rd_na_me.png");
});

test("sanitizeFileName drops leading dots/spaces so a file can't be hidden or become '..'", () => {
  assert.equal(sanitizeFileName(".hidden"), "hidden");
  assert.equal(sanitizeFileName("..."), "file");
  assert.equal(sanitizeFileName("   "), "file");
});

test("sanitizeFileName falls back to 'file' for empty/nullish input", () => {
  assert.equal(sanitizeFileName(""), "file");
  assert.equal(sanitizeFileName(null), "file");
  assert.equal(sanitizeFileName(undefined), "file");
});

test("sanitizeFileName caps length at 100 and keeps a short extension", () => {
  const out = sanitizeFileName(`${"x".repeat(300)}.pdf`);
  assert.equal(out.length, 100);
  assert.ok(out.endsWith(".pdf"));
});

test("sanitizeFileName adds an extension from a known MIME type only when the name has none", () => {
  assert.equal(sanitizeFileName("donations", "text/csv"), "donations.csv");
  assert.equal(sanitizeFileName("cal", "text/calendar; charset=utf-8"), "cal.ics");
  assert.equal(sanitizeFileName("photo", "image/jpeg"), "photo.jpg");
  assert.equal(sanitizeFileName("notes.txt", "text/csv"), "notes.txt");
  assert.equal(sanitizeFileName("blob", "application/x-unknown"), "blob");
});

// ── normalizeMimeType ──

test("normalizeMimeType strips parameters and lower-cases allowlisted types", () => {
  assert.equal(normalizeMimeType("text/csv;charset=utf-8"), "text/csv");
  assert.equal(normalizeMimeType("TEXT/Calendar"), "text/calendar");
  assert.equal(normalizeMimeType(" application/pdf "), "application/pdf");
  assert.equal(normalizeMimeType("image/png"), "image/png");
});

test("normalizeMimeType collapses well-formed but unlisted types to octet-stream", () => {
  assert.equal(normalizeMimeType("text/html"), "application/octet-stream");
  assert.equal(normalizeMimeType("application/javascript"), "application/octet-stream");
  assert.equal(normalizeMimeType("application/vnd.ms-excel"), "application/octet-stream");
});

test("normalizeMimeType treats empty as octet-stream and rejects malformed values", () => {
  assert.equal(normalizeMimeType(""), "application/octet-stream");
  assert.equal(normalizeMimeType(undefined), "application/octet-stream");
  assert.equal(normalizeMimeType("*/*"), null);
  assert.equal(normalizeMimeType("not a mime"), null);
  assert.equal(normalizeMimeType("text/"), null);
  assert.equal(normalizeMimeType("../etc/passwd"), null);
});

// ── isPdf ──

test("isPdf recognises PDFs by MIME type or filename", () => {
  assert.equal(isPdf("application/pdf"), true);
  assert.equal(isPdf("application/pdf; foo=bar"), true);
  assert.equal(isPdf("application/octet-stream", "Flyer.PDF"), true);
  assert.equal(isPdf("image/png", "a.png"), false);
  assert.equal(isPdf(undefined, undefined), false);
});

// ── resultFromJson ──

test("resultFromJson parses success and failure replies", () => {
  assert.deepEqual(resultFromJson('{"ok":true,"fileName":"a.csv"}'), { ok: true, fileName: "a.csv" });
  assert.deepEqual(resultFromJson('{"ok":true}'), { ok: true });
  assert.deepEqual(resultFromJson('{"ok":false,"error":"no_handler"}'), { ok: false, error: "no_handler" });
});

test("resultFromJson never turns an unparseable or ambiguous reply into success", () => {
  assert.deepEqual(resultFromJson("not json"), { ok: false, error: "io_error" });
  assert.deepEqual(resultFromJson(undefined), { ok: false, error: "io_error" });
  assert.deepEqual(resultFromJson('{"ok":"true"}'), { ok: false, error: "io_error" });
  assert.deepEqual(resultFromJson('{"ok":false}'), { ok: false, error: "io_error" });
});

test("every native error code has a user-presentable message", () => {
  for (const code of ["bridge_unavailable", "no_handler", "forbidden_origin", "empty_data", "too_large", "bad_mime", "bad_data", "io_error", "launch_failed"]) {
    assert.ok(userMessageForError(code).length > 10, code);
  }
  assert.ok(userMessageForError("something_new").length > 10);
  assert.match(userMessageForError("no_handler"), /No app/);
});

// ── blobToBase64 ──

test("blobToBase64 matches Buffer's encoding, including data larger than one chunk", async () => {
  const bytes = new Uint8Array(200_000).map((_, i) => (i * 31) % 256);
  const expected = Buffer.from(bytes).toString("base64");
  assert.equal(await blobToBase64(new Blob([bytes])), expected);
  assert.equal(await blobToBase64(new Blob(["hello,csv\n1,2\n"])), Buffer.from("hello,csv\n1,2\n").toString("base64"));
});

// ── bridge calls ──

test("saveAndShareOnAndroid sends base64, a sanitized name and a normalized MIME type", async () => {
  const calls = installBridge('{"ok":true}');
  try {
    await saveAndShareOnAndroid(new Blob(["a,b\n1,2\n"], { type: "text/csv;charset=utf-8" }), "../my donations", undefined);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, "saveAndShare");
    assert.equal(calls[0].name, "my donations.csv");
    assert.equal(calls[0].mime, "text/csv");
    assert.equal(calls[0].base64, Buffer.from("a,b\n1,2\n").toString("base64"));
  } finally {
    removeBridge();
  }
});

test("openWithViewerOnAndroid uses the viewer method and keeps the PDF type", async () => {
  const calls = installBridge('{"ok":true}');
  try {
    await openWithViewerOnAndroid(new Blob(["%PDF-1.4"], { type: "application/pdf" }), "Flyer.pdf");
    assert.equal(calls[0].method, "openWithViewer");
    assert.equal(calls[0].mime, "application/pdf");
    assert.equal(calls[0].name, "Flyer.pdf");
  } finally {
    removeBridge();
  }
});

test("a no-handler reply surfaces as a visible AndroidFileBridgeError, not silence", async () => {
  installBridge('{"ok":false,"error":"no_handler"}');
  try {
    await assert.rejects(
      () => openWithViewerOnAndroid(new Blob(["BEGIN:VCALENDAR"], { type: "text/calendar" }), "cal.ics"),
      (err: unknown) => {
        assert.ok(err instanceof AndroidFileBridgeError);
        assert.equal(err.code, "no_handler");
        assert.match(err.message, /No app/);
        return true;
      },
    );
  } finally {
    removeBridge();
  }
});

test("a missing bridge (older app build / not Android) fails loudly", async () => {
  removeBridge();
  await assert.rejects(
    () => saveAndShareOnAndroid(new Blob(["x"]), "x.csv", "text/csv"),
    (err: unknown) => err instanceof AndroidFileBridgeError && err.code === "bridge_unavailable",
  );
});

test("empty files, malformed MIME types and oversize files are rejected before calling native code", async () => {
  const calls = installBridge('{"ok":true}');
  try {
    await assert.rejects(() => saveAndShareOnAndroid(new Blob([]), "x.csv", "text/csv"), (e: unknown) => (e as AndroidFileBridgeError).code === "empty_data");
    await assert.rejects(() => saveAndShareOnAndroid(new Blob(["x"]), "x.csv", "not a mime"), (e: unknown) => (e as AndroidFileBridgeError).code === "bad_mime");
    await assert.rejects(
      () => saveAndShareOnAndroid(new Blob([new Uint8Array(25 * 1024 * 1024 + 1)]), "big.csv", "text/csv"),
      (e: unknown) => (e as AndroidFileBridgeError).code === "too_large",
    );
    assert.equal(calls.length, 0);
  } finally {
    removeBridge();
  }
});
