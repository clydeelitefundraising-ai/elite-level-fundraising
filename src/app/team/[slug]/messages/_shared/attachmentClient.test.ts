import test from "node:test";
import assert from "node:assert/strict";
import {
  readableFileSize,
  classifyClientMime,
  canPreviewAsImage,
  validateClientFile,
  selectFilesForAttachment,
  parseSignResponse,
  shouldRenderTextBubble,
  attachmentAnchorProps,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  MAX_FILE_BYTES,
} from "./attachmentClient.ts";

// These mirror the server-side rules in src/lib/messages.ts's validation
// tests exactly — this file is a deliberate, disclosed duplication of
// that public (non-secret) allow-list for client-side UX validation, so
// its own tests exist to catch the two ever silently drifting apart.

test("readableFileSize: bytes, KB, MB thresholds", () => {
  assert.equal(readableFileSize(500), "500 B");
  assert.equal(readableFileSize(2048), "2 KB");
  assert.equal(readableFileSize(1_500_000), "1.4 MB");
});

test("classifyClientMime: every locked-allowed MIME type classifies to its correct kind", () => {
  assert.equal(classifyClientMime("image/jpeg"), "image");
  assert.equal(classifyClientMime("image/heic"), "image");
  assert.equal(classifyClientMime("video/quicktime"), "video");
  assert.equal(classifyClientMime("application/pdf"), "file");
  assert.equal(
    classifyClientMime("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    "file",
  );
});

test("classifyClientMime: unsupported MIME types classify to null", () => {
  assert.equal(classifyClientMime("application/zip"), null);
  assert.equal(classifyClientMime(""), null);
});

test("canPreviewAsImage: JPEG/PNG/WebP are previewable", () => {
  assert.equal(canPreviewAsImage("image/jpeg"), true);
  assert.equal(canPreviewAsImage("image/png"), true);
  assert.equal(canPreviewAsImage("image/webp"), true);
});

test("canPreviewAsImage: HEIC/HEIF are explicitly NOT previewable, despite being image/* MIME types", () => {
  assert.equal(canPreviewAsImage("image/heic"), false);
  assert.equal(canPreviewAsImage("image/heif"), false);
});

test("canPreviewAsImage: non-image kinds are not previewable", () => {
  assert.equal(canPreviewAsImage("video/mp4"), false);
  assert.equal(canPreviewAsImage("application/pdf"), false);
});

test("validateClientFile: unsupported MIME rejected", () => {
  const result = validateClientFile({ name: "a.zip", type: "application/zip", size: 100 });
  assert.equal(result.ok, false);
});

test("validateClientFile: image at/under 10 MB valid, over it rejected", () => {
  assert.equal(validateClientFile({ name: "a.jpg", type: "image/jpeg", size: MAX_IMAGE_BYTES }).ok, true);
  const over = validateClientFile({ name: "a.jpg", type: "image/jpeg", size: MAX_IMAGE_BYTES + 1 });
  assert.equal(over.ok, false);
});

test("validateClientFile: video at/under 50 MB valid, over it rejected", () => {
  assert.equal(validateClientFile({ name: "a.mp4", type: "video/mp4", size: MAX_VIDEO_BYTES }).ok, true);
  const over = validateClientFile({ name: "a.mp4", type: "video/mp4", size: MAX_VIDEO_BYTES + 1 });
  assert.equal(over.ok, false);
});

test("validateClientFile: generic file at/under 25 MB valid, over it rejected", () => {
  assert.equal(validateClientFile({ name: "a.pdf", type: "application/pdf", size: MAX_FILE_BYTES }).ok, true);
  const over = validateClientFile({ name: "a.pdf", type: "application/pdf", size: MAX_FILE_BYTES + 1 });
  assert.equal(over.ok, false);
});

test("selectFilesForAttachment: accepts files up to the max, no errors", () => {
  const files = Array.from({ length: MAX_ATTACHMENTS_PER_MESSAGE }, (_, i) => ({
    name: `photo${i}.jpg`, type: "image/jpeg", size: 1000,
  }));
  const result = selectFilesForAttachment(0, files);
  assert.equal(result.validFiles.length, MAX_ATTACHMENTS_PER_MESSAGE);
  assert.equal(result.errors.length, 0);
});

test("selectFilesForAttachment: rejects files beyond the max as a single error, keeps the rest", () => {
  const files = Array.from({ length: MAX_ATTACHMENTS_PER_MESSAGE + 2 }, (_, i) => ({
    name: `photo${i}.jpg`, type: "image/jpeg", size: 1000,
  }));
  const result = selectFilesForAttachment(0, files);
  assert.equal(result.validFiles.length, MAX_ATTACHMENTS_PER_MESSAGE);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /Only 6 attachments/);
});

test("selectFilesForAttachment: respects files already selected (existingCount)", () => {
  const files = [
    { name: "a.jpg", type: "image/jpeg", size: 1000 },
    { name: "b.jpg", type: "image/jpeg", size: 1000 },
  ];
  const result = selectFilesForAttachment(MAX_ATTACHMENTS_PER_MESSAGE - 1, files);
  assert.equal(result.validFiles.length, 1);
  assert.equal(result.errors.length, 1);
});

test("selectFilesForAttachment: an invalid file among valid ones is reported but doesn't block the others", () => {
  const files = [
    { name: "good.jpg", type: "image/jpeg", size: 1000 },
    { name: "bad.zip", type: "application/zip", size: 1000 },
    { name: "good2.png", type: "image/png", size: 1000 },
  ];
  const result = selectFilesForAttachment(0, files);
  assert.equal(result.validFiles.length, 2);
  assert.equal(result.errors.length, 1);
});

test("parseSignResponse: valid response parses through", () => {
  const result = parseSignResponse({
    attachment_id: "a1", signed_upload_url: "https://example.test/upload", mime_type: "image/jpeg",
  });
  assert.deepEqual(result, {
    ok: true, attachmentId: "a1", signedUploadUrl: "https://example.test/upload", mimeType: "image/jpeg",
  });
});

test("parseSignResponse: server error response surfaces its message", () => {
  const result = parseSignResponse({ error: "File exceeds the 10 MB limit for images." });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "File exceeds the 10 MB limit for images.");
});

test("parseSignResponse: malformed/incomplete response is rejected, not thrown", () => {
  assert.equal(parseSignResponse(null).ok, false);
  assert.equal(parseSignResponse({}).ok, false);
  assert.equal(parseSignResponse({ attachment_id: "a1" }).ok, false);
});

test("parseSignResponse: never carries a storage_path field even if the server response included one", () => {
  const result = parseSignResponse({
    attachment_id: "a1", signed_upload_url: "https://example.test/upload", mime_type: "image/jpeg",
    storage_path: "should-never-be-used",
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(Object.keys(result), ["ok", "attachmentId", "signedUploadUrl", "mimeType"]);
});

test("shouldRenderTextBubble: false for empty body (attachment-only message)", () => {
  assert.equal(shouldRenderTextBubble(""), false);
});

test("shouldRenderTextBubble: false for whitespace-only body", () => {
  assert.equal(shouldRenderTextBubble("   "), false);
});

test("shouldRenderTextBubble: true for a real body, with or without attachments alongside it", () => {
  assert.equal(shouldRenderTextBubble("see attached"), true);
});

// ─── attachmentAnchorProps: iOS native "File not found." fix ───────────────────
//
// Native Capacitor's default handling of target="_blank" hands the
// navigation off to the SYSTEM browser (a separate app with its own,
// unrelated cookie storage) instead of keeping it inside the app's own
// authenticated WKWebView — the ELF session cookie never reaches that
// separate browser, so the authenticated download route can't recognize
// the requester as a thread participant. These tests lock in the fix:
// web keeps target="_blank" unchanged, native drops it entirely so the
// navigation stays in-WebView with the existing session intact.

test("attachmentAnchorProps: web (non-native) retains target=_blank + rel=noopener noreferrer", () => {
  const props = attachmentAnchorProps(false);
  assert.deepEqual(props, { target: "_blank", rel: "noopener noreferrer" });
});

test("attachmentAnchorProps: native Capacitor never sets target=_blank", () => {
  const props = attachmentAnchorProps(true);
  assert.equal(props.target, undefined);
});

test("attachmentAnchorProps: native Capacitor returns no rel either (no target means nothing for rel to protect)", () => {
  const props = attachmentAnchorProps(true);
  assert.deepEqual(props, {});
});
