-- Phase A40: Moderator removal of messages and attachments (Apple
-- Guideline 1.2 — reporting must be paired with an actual ability to act
-- on it, not just a status field).
--
-- Soft-delete, not hard-delete: a message row's id is referenced by
-- message_reads (ON DELETE CASCADE) and may be embedded in other
-- participants' already-rendered thread history — hard-deleting it would
-- either cascade-destroy unrelated read receipts or leave a silent gap in
-- the conversation. Setting deleted_at and blanking body in application
-- code (src/lib/moderation/messageModeration.ts) preserves thread
-- structure exactly, the same "row survives, content doesn't" pattern
-- already used for announcement_comments' author snapshot vs. live
-- membership.
--
-- message_attachments gets its own, separate `removed_at` column rather
-- than reusing the existing `status` CHECK ('pending'/'attached') — status
-- tracks the UPLOAD lifecycle (has this file finished uploading and been
-- claimed by a message), which is an orthogonal concern to MODERATION
-- state (was this since removed). Mixing the two into one enum would
-- make "was this ever attached, and is it currently removed" ambiguous
-- to query. storage_path stays NOT NULL/UNIQUE and untouched — the
-- underlying storage OBJECT is deleted by application code at removal
-- time (same deleteStorageObjects() helper accountDeletionPurge.ts
-- already uses), and access is independently blocked at the application
-- layer by resolveAuthorizedAttachment() checking removed_at IS NOT NULL
-- — this column's only job is to make that check possible and to record
-- when it happened for audit purposes.
--
-- Additive only; safe for existing teams. No existing row is touched.

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE message_attachments
  ADD COLUMN IF NOT EXISTS removed_at timestamptz;
