import test from "node:test";
import assert from "node:assert/strict";
import {
  resolvePhotoUrl,
  classifyAttachmentMime,
  safeExtensionForMime,
  validateAttachmentFile,
  validateAttachmentCount,
  actorIdColumns,
  stalePendingCutoffIso,
  validateSendRequest,
  parseSignRequestBody,
  parseResolveRequestBody,
  attachmentOnlyMessagePreview,
  messagePreview,
  safeContentDispositionFilename,
  buildAttachmentContentDisposition,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  MAX_FILE_BYTES,
  STALE_PENDING_MS,
  type ActorKey,
} from "./messages.ts";

// Phase A30: platform admin is a third source resolvePhotoUrl can draw
// from (via platform_admins.account_id -> elf_accounts), alongside the
// existing coach/member elf_accounts joins and the athlete-specific
// athletes.profile_photo override. Locks in the precedence order across
// all three real actor kinds so a future edit can't silently drop one.

test("resolvePhotoUrl: athlete's own athletes.profile_photo wins over any elf_accounts photo", () => {
  const url = resolvePhotoUrl(
    null,
    { name: "A", role: "athlete", athlete_id: "ath1", athletes: { profile_photo: "athlete.jpg" }, elf_accounts: { profile_photo_url: "account.jpg" } },
    null,
  );
  assert.equal(url, "athlete.jpg");
});

test("resolvePhotoUrl: coach falls back to elf_accounts.profile_photo_url", () => {
  const url = resolvePhotoUrl(
    { name: "Coach", role: "head_coach", elf_accounts: { profile_photo_url: "coach.jpg" } },
    null,
    null,
  );
  assert.equal(url, "coach.jpg");
});

test("resolvePhotoUrl: member (non-athlete, e.g. parent/booster) falls back to elf_accounts.profile_photo_url", () => {
  const url = resolvePhotoUrl(
    null,
    { name: "Parent", role: "parent", athlete_id: null, athletes: null, elf_accounts: { profile_photo_url: "parent.jpg" } },
    null,
  );
  assert.equal(url, "parent.jpg");
});

test("resolvePhotoUrl: platform admin resolves via its own elf_accounts join when coach/member are both absent", () => {
  const url = resolvePhotoUrl(null, null, { elf_accounts: { name: "ELF Employee", profile_photo_url: "admin.jpg" } });
  assert.equal(url, "admin.jpg");
});

test("resolvePhotoUrl: null when no actor has a resolvable photo at all", () => {
  assert.equal(resolvePhotoUrl(null, null, null), null);
  assert.equal(resolvePhotoUrl(null, null, { elf_accounts: null }), null);
});

// ─── Phase 2: attachment validation (locked limits) ───────────────────────────
// Every MIME/size rule here is the actual product-locked limit (approved
// design pass), not a placeholder — these tests exist so a future edit to
// the allow-list or the byte ceilings can't silently drift from what was
// approved without a failing test.

test("classifyAttachmentMime: every locked-allowed MIME type classifies to its correct kind", () => {
  assert.equal(classifyAttachmentMime("image/jpeg"), "image");
  assert.equal(classifyAttachmentMime("image/png"), "image");
  assert.equal(classifyAttachmentMime("image/webp"), "image");
  assert.equal(classifyAttachmentMime("image/heic"), "image");
  assert.equal(classifyAttachmentMime("image/heif"), "image");
  assert.equal(classifyAttachmentMime("video/mp4"), "video");
  assert.equal(classifyAttachmentMime("video/quicktime"), "video");
  assert.equal(classifyAttachmentMime("application/pdf"), "file");
  assert.equal(classifyAttachmentMime("application/msword"), "file");
  assert.equal(
    classifyAttachmentMime("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    "file",
  );
});

test("classifyAttachmentMime: unsupported MIME types classify to null, not a guessed kind", () => {
  assert.equal(classifyAttachmentMime("application/zip"), null);
  assert.equal(classifyAttachmentMime("video/webm"), null);
  assert.equal(classifyAttachmentMime("text/plain"), null);
  assert.equal(classifyAttachmentMime(""), null);
});

test("safeExtensionForMime: maps every allowed MIME to its safe extension, including HEIC/HEIF and MOV", () => {
  assert.equal(safeExtensionForMime("image/jpeg"), "jpg");
  assert.equal(safeExtensionForMime("image/heic"), "heic");
  assert.equal(safeExtensionForMime("image/heif"), "heif");
  assert.equal(safeExtensionForMime("video/mp4"), "mp4");
  assert.equal(safeExtensionForMime("video/quicktime"), "mov");
  assert.equal(safeExtensionForMime("application/pdf"), "pdf");
  assert.equal(safeExtensionForMime("application/msword"), "doc");
  assert.equal(
    safeExtensionForMime("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    "docx",
  );
});

test("safeExtensionForMime: unsupported MIME returns null — never a guessed/fallback extension", () => {
  assert.equal(safeExtensionForMime("application/octet-stream"), null);
});

test("validateAttachmentFile: rejects an unsupported MIME type outright, regardless of size", () => {
  const result = validateAttachmentFile({ mimeType: "application/zip", byteSize: 100 });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "unsupported_mime");
});

test("validateAttachmentFile: rejects zero/negative byte size as invalid, not merely 'too large'", () => {
  const zero = validateAttachmentFile({ mimeType: "image/jpeg", byteSize: 0 });
  assert.equal(zero.ok, false);
  if (!zero.ok) assert.equal(zero.error.code, "invalid_size");

  const negative = validateAttachmentFile({ mimeType: "image/jpeg", byteSize: -1 });
  assert.equal(negative.ok, false);
  if (!negative.ok) assert.equal(negative.error.code, "invalid_size");
});

test("validateAttachmentFile: image at/under the 10 MB limit is valid, over it is 'too_large'", () => {
  assert.equal(validateAttachmentFile({ mimeType: "image/png", byteSize: MAX_IMAGE_BYTES }).ok, true);
  const over = validateAttachmentFile({ mimeType: "image/png", byteSize: MAX_IMAGE_BYTES + 1 });
  assert.equal(over.ok, false);
  if (!over.ok) assert.equal(over.error.code, "too_large");
});

test("validateAttachmentFile: video at/under the 50 MB limit is valid, over it is 'too_large'", () => {
  assert.equal(validateAttachmentFile({ mimeType: "video/mp4", byteSize: MAX_VIDEO_BYTES }).ok, true);
  const over = validateAttachmentFile({ mimeType: "video/quicktime", byteSize: MAX_VIDEO_BYTES + 1 });
  assert.equal(over.ok, false);
  if (!over.ok) assert.equal(over.error.code, "too_large");
});

test("validateAttachmentFile: generic file at/under the 25 MB limit is valid, over it is 'too_large'", () => {
  assert.equal(validateAttachmentFile({ mimeType: "application/pdf", byteSize: MAX_FILE_BYTES }).ok, true);
  const over = validateAttachmentFile({ mimeType: "application/msword", byteSize: MAX_FILE_BYTES + 1 });
  assert.equal(over.ok, false);
  if (!over.ok) assert.equal(over.error.code, "too_large");
});

test("validateAttachmentFile: the per-kind limits are genuinely independent — a video-sized file fails as an image", () => {
  // Exactly the video ceiling, but submitted as an image MIME type — must
  // fail against the (much smaller) image limit, not the video one.
  const result = validateAttachmentFile({ mimeType: "image/jpeg", byteSize: MAX_VIDEO_BYTES });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "too_large");
});

test("validateAttachmentCount: at or under the 6-attachment max is valid", () => {
  assert.equal(validateAttachmentCount(MAX_ATTACHMENTS_PER_MESSAGE).ok, true);
  assert.equal(validateAttachmentCount(1).ok, true);
  assert.equal(validateAttachmentCount(0).ok, true);
});

test("validateAttachmentCount: exceeding the 6-attachment max is rejected with 'too_many_attachments'", () => {
  const result = validateAttachmentCount(MAX_ATTACHMENTS_PER_MESSAGE + 1);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "too_many_attachments");
});

// ─── Phase 2: actor-column stamping ────────────────────────────────────────────
// The exact three-way exclusivity shape shared by uploader_*
// (message_attachments) and p_sender_* (the send_message_with_attachments
// RPC params) — a coach actor must never stamp a member/platform_admin
// column and vice versa, matching the DB's own exclusivity CHECK.

test("actorIdColumns: a coach actor stamps only coach_id", () => {
  const actor: ActorKey = { kind: "coach", id: "c1" };
  assert.deepEqual(actorIdColumns(actor), { coach_id: "c1", member_id: null, platform_admin_id: null });
});

test("actorIdColumns: a member actor stamps only member_id", () => {
  const actor: ActorKey = { kind: "member", id: "m1" };
  assert.deepEqual(actorIdColumns(actor), { coach_id: null, member_id: "m1", platform_admin_id: null });
});

test("actorIdColumns: a platform_admin actor stamps only platform_admin_id", () => {
  const actor: ActorKey = { kind: "platform_admin", id: "pa1" };
  assert.deepEqual(actorIdColumns(actor), { coach_id: null, member_id: null, platform_admin_id: "pa1" });
});

// ─── Phase 2: stale-pending cutoff boundary ────────────────────────────────────

test("stalePendingCutoffIso: computes exactly now - 24h, not an approximation", () => {
  const now = Date.parse("2026-01-02T12:00:00.000Z");
  assert.equal(stalePendingCutoffIso(now), "2026-01-01T12:00:00.000Z");
});

test("stalePendingCutoffIso boundary: an attachment created just under 24h ago is NOT stale (its created_at is after the cutoff)", () => {
  const now = Date.parse("2026-01-02T12:00:00.000Z");
  const cutoff = stalePendingCutoffIso(now);
  const createdAt = new Date(now - (STALE_PENDING_MS - 60_000)).toISOString(); // 23h59m old
  assert.equal(createdAt > cutoff, true);
});

test("stalePendingCutoffIso boundary: an attachment created just over 24h ago IS stale (its created_at is before the cutoff)", () => {
  const now = Date.parse("2026-01-02T12:00:00.000Z");
  const cutoff = stalePendingCutoffIso(now);
  const createdAt = new Date(now - (STALE_PENDING_MS + 60_000)).toISOString(); // 24h01m old
  assert.equal(createdAt < cutoff, true);
});

// ─── Phase 3: reply/send request-shape validation ──────────────────────────────

test("validateSendRequest: text-only, non-empty body, no attachments — valid", () => {
  assert.equal(validateSendRequest({ body: "hello", attachmentIds: [] }).ok, true);
});

test("validateSendRequest: attachment-only, empty body, >=1 attachment — valid", () => {
  assert.equal(validateSendRequest({ body: "", attachmentIds: ["a1"] }).ok, true);
});

test("validateSendRequest: empty body AND no attachments — rejected", () => {
  const result = validateSendRequest({ body: "", attachmentIds: [] });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "body required");
});

test("validateSendRequest: body over 3000 chars — rejected regardless of attachments", () => {
  const result = validateSendRequest({ body: "x".repeat(3001), attachmentIds: [] });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "Message too long.");
});

test("validateSendRequest: exactly 6 attachment ids — valid (at the max)", () => {
  const ids = ["a1", "a2", "a3", "a4", "a5", "a6"];
  assert.equal(ids.length, MAX_ATTACHMENTS_PER_MESSAGE);
  assert.equal(validateSendRequest({ body: "", attachmentIds: ids }).ok, true);
});

test("validateSendRequest: 7 attachment ids — rejected (over the max)", () => {
  const ids = ["a1", "a2", "a3", "a4", "a5", "a6", "a7"];
  const result = validateSendRequest({ body: "", attachmentIds: ids });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /at most 6 attachments/);
});

test("validateSendRequest: duplicate attachment ids — rejected before any RPC call", () => {
  const result = validateSendRequest({ body: "", attachmentIds: ["a1", "a2", "a1"] });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "Duplicate attachment ids.");
});

// ─── Phase 3: sign endpoint request-shape validation ───────────────────────────

test("parseSignRequestBody: valid, complete body parses through", () => {
  const result = parseSignRequestBody({ original_filename: "photo.jpg", mime_type: "image/jpeg", byte_size: 1000 });
  assert.deepEqual(result, { ok: true, originalFilename: "photo.jpg", mimeType: "image/jpeg", byteSize: 1000 });
});

test("parseSignRequestBody: missing original_filename — rejected", () => {
  const result = parseSignRequestBody({ mime_type: "image/jpeg", byte_size: 1000 });
  assert.equal(result.ok, false);
});

test("parseSignRequestBody: missing mime_type — rejected", () => {
  const result = parseSignRequestBody({ original_filename: "a.jpg", byte_size: 1000 });
  assert.equal(result.ok, false);
});

test("parseSignRequestBody: byte_size not a number — rejected", () => {
  const result = parseSignRequestBody({ original_filename: "a.jpg", mime_type: "image/jpeg", byte_size: "1000" });
  assert.equal(result.ok, false);
});

test("parseSignRequestBody: null/non-object body — rejected, not thrown", () => {
  assert.equal(parseSignRequestBody(null).ok, false);
  assert.equal(parseSignRequestBody(undefined).ok, false);
});

test("parseSignRequestBody: never reads storage_path, attachment id, or uploader fields even if the client sends them", () => {
  // A malicious/confused client sending extra fields must not have them
  // silently accepted anywhere downstream — parseSignRequestBody's return
  // type only ever carries originalFilename/mimeType/byteSize.
  const result = parseSignRequestBody({
    original_filename: "a.jpg", mime_type: "image/jpeg", byte_size: 1000,
    storage_path: "attacker-controlled/path.jpg", id: "attacker-chosen-id", uploader_coach_id: "someone-elses-id",
  });
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result), ["ok", "originalFilename", "mimeType", "byteSize"]);
});

// ─── Phase 3: resolve endpoint request-shape validation ────────────────────────

test("parseResolveRequestBody: valid body parses through", () => {
  const result = parseResolveRequestBody({ recipient_actor_type: "coach", recipient_id: "c1" });
  assert.deepEqual(result, { ok: true, recipientActorType: "coach", recipientId: "c1" });
});

test("parseResolveRequestBody: missing recipient_actor_type — rejected", () => {
  assert.equal(parseResolveRequestBody({ recipient_id: "c1" }).ok, false);
});

test("parseResolveRequestBody: missing recipient_id — rejected", () => {
  assert.equal(parseResolveRequestBody({ recipient_actor_type: "coach" }).ok, false);
});

test("parseResolveRequestBody: null body — rejected, not thrown", () => {
  assert.equal(parseResolveRequestBody(null).ok, false);
});

// ─── Phase 3: canonical message preview (used for BOTH web-push body and ──────
// ─── the thread's last_message_preview via updateThreadMeta) ──────────────────

test("attachmentOnlyMessagePreview: single image", () => {
  assert.equal(attachmentOnlyMessagePreview(["image"]), "📷 Sent a photo");
});

test("attachmentOnlyMessagePreview: single video", () => {
  assert.equal(attachmentOnlyMessagePreview(["video"]), "🎥 Sent a video");
});

test("attachmentOnlyMessagePreview: single generic file", () => {
  assert.equal(attachmentOnlyMessagePreview(["file"]), "📎 Sent a file");
});

test("attachmentOnlyMessagePreview: multiple attachments — generic count, regardless of kind mix", () => {
  assert.equal(attachmentOnlyMessagePreview(["image", "video"]), "📎 Sent 2 attachments");
  assert.equal(attachmentOnlyMessagePreview(["image", "image", "file"]), "📎 Sent 3 attachments");
});

// image-only / video-only / file-only / multiple-attachment thread preview
// (the exact same fallback the web-push body already used, now also the
// value updateThreadMeta receives — see messagePreview below).
test("messagePreview: image-only thread/push preview", () => {
  assert.equal(messagePreview("", ["image"]), "📷 Sent a photo");
});

test("messagePreview: video-only thread/push preview", () => {
  assert.equal(messagePreview("", ["video"]), "🎥 Sent a video");
});

test("messagePreview: file-only thread/push preview", () => {
  assert.equal(messagePreview("", ["file"]), "📎 Sent a file");
});

test("messagePreview: multiple-attachment thread/push preview", () => {
  assert.equal(messagePreview("", ["image", "video", "file"]), "📎 Sent 3 attachments");
});

test("messagePreview: text + attachments uses the text, never the attachment fallback", () => {
  assert.equal(messagePreview("see attached", ["image", "file"]), "see attached");
});

test("messagePreview: text-only behavior is unchanged — truncated to 100 chars, no attachment involvement", () => {
  assert.equal(messagePreview("hello team", []), "hello team");
  assert.equal(messagePreview("x".repeat(150), []).length, 100);
});

test("messagePreview: whitespace-only body falls through to the attachment fallback", () => {
  assert.equal(messagePreview("   ", ["video"]), "🎥 Sent a video");
});

test("messagePreview: never contains a filename — the function has no filename input at all, for push OR thread preview", () => {
  // Structural guarantee, not just a behavioral one: neither
  // attachmentOnlyMessagePreview nor messagePreview accepts anything
  // resembling a filename in their parameters, so no private filename
  // can reach either the push payload or the thread list's preview
  // through this code path — even a caller that has a filename handy
  // (e.g. the send route, which knows original_filename) has no
  // parameter to pass it through.
  const preview = messagePreview("", ["file"]);
  assert.equal(preview.includes("."), false); // no accidental "photo.jpg"-style leak
  assert.equal(preview, "📎 Sent a file");
});

// ─── Phase 3: safe Content-Disposition filename handling ───────────────────────

test("safeContentDispositionFilename: ordinary filename passes through encoded", () => {
  assert.equal(safeContentDispositionFilename("photo.jpg"), "photo.jpg");
});

test("safeContentDispositionFilename: spaces become +, matching the existing team-files pattern", () => {
  assert.equal(safeContentDispositionFilename("team photo.jpg"), "team+photo.jpg");
});

test("safeContentDispositionFilename: CRLF header-injection attempt is fully percent-encoded, never raw", () => {
  const malicious = "a.jpg\r\nX-Injected: evil";
  const safe = safeContentDispositionFilename(malicious);
  assert.equal(safe.includes("\r"), false);
  assert.equal(safe.includes("\n"), false);
  assert.equal(safe.includes(":"), false);
});

test("safeContentDispositionFilename: embedded double-quote can't break out of the quoted header value", () => {
  const safe = safeContentDispositionFilename('a".jpg');
  assert.equal(safe.includes('"'), false);
});

test("buildAttachmentContentDisposition: produces both the quoted and UTF-8 filename* forms", () => {
  const header = buildAttachmentContentDisposition("team photo.jpg");
  assert.equal(header, `attachment; filename="team+photo.jpg"; filename*=UTF-8''team+photo.jpg`);
});

test("buildAttachmentContentDisposition: a CRLF-injection attempt never appears raw in the final header value", () => {
  const header = buildAttachmentContentDisposition("a.jpg\r\nSet-Cookie: evil=1");
  assert.equal(header.includes("\r"), false);
  assert.equal(header.includes("\n"), false);
});

test("buildAttachmentContentDisposition: defaults to 'attachment' when no disposition is given (video/PDF/DOC/DOCX)", () => {
  const header = buildAttachmentContentDisposition("clip.mp4");
  assert.match(header, /^attachment;/);
});

test("buildAttachmentContentDisposition: 'inline' can be requested explicitly (images, for <img src> compatibility)", () => {
  const header = buildAttachmentContentDisposition("photo.jpg", "inline");
  assert.match(header, /^inline;/);
  assert.equal(header, `inline; filename="photo.jpg"; filename*=UTF-8''photo.jpg`);
});
