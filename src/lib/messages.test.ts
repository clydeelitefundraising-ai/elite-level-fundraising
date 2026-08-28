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
