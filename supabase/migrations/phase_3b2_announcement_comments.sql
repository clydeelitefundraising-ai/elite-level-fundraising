-- Phase 3B-2: Announcement Comments + Head Coach Moderation
--
-- Every new comment requires Head Coach approval before becoming visible
-- to the rest of the team, EXCEPT Head-Coach-authored comments, which
-- publish immediately (the author already IS the sole moderator for this
-- campaign — see approveComment()/lib/platform/comments.ts createComment()
-- for the exact rule; enforced in application code, not here).
--
-- Single-row-with-status-column design (pending/approved/declined),
-- mirroring pending_athlete_requests (Phase 1B) rather than an append-only
-- log like athlete_outreach (Phase 26) — a comment doesn't need decision
-- history, just current state, matching the pending_athlete_requests
-- precedent exactly (including the same claim-before-mutate conditional
-- UPDATE ... WHERE status = 'pending' race-safety pattern used there).
--
-- Author identity — CORRECTED (see audit): author_name/author_role are
-- captured ONCE at comment creation time (the same denormalized-snapshot
-- pattern already used by announcements.author_name/author_role) — this
-- is the durable, authoritative source for display, and it survives
-- indefinitely even if the author later leaves the team. author_coach_id/
-- author_member_id are kept as best-effort, nullable LIVE references
-- (ON DELETE SET NULL) used only for "is this my comment" ownership
-- checks and live profile-photo lookup — if the author's team_coaches/
-- team_members row is later deleted (roster/staff removal, demo reset,
-- etc.), these columns simply become NULL and the comment's text/
-- author_name/author_role are entirely unaffected.
--
-- Deliberately NOT enforced by a CHECK constraint requiring one of these
-- two to stay non-null. An earlier draft of this migration had exactly
-- such a constraint (announcement_comments_author_ref_chk) paired with
-- ON DELETE SET NULL — audited and found to be a real, reproducible bug:
-- SET NULL fires as an UPDATE on this table, which is itself subject to
-- the table's own CHECK constraints, so removing a staff member or member
-- who had ever commented would abort with a constraint violation and
-- block the removal entirely. Confirmed reachable via
-- removeStaffRelationship() (single-row staff removal) and
-- /api/admin/demo/reset (bulk team_members wipe, which doesn't clear
-- announcements/comments first). The identical CHECK+SET NULL pattern
-- already exists live in production on message_threads.threads_creator_check
-- and messages.messages_sender_check (Phase 28) — a real, separate,
-- out-of-scope bug recorded as technical debt for a future isolated fix,
-- NOT addressed here. Application code (createComment()) is the sole
-- writer of author_coach_id/author_member_id and always sets exactly one
-- of the two correctly at insert time — the same trust-the-service-layer
-- convention already used for announcements.coach_id, which has no CHECK
-- either.
--
-- Additive only; safe for existing teams. No existing table is modified.
-- Existing announcements with zero comments are entirely unaffected —
-- nothing here is backfilled or required for any existing row.

CREATE TABLE IF NOT EXISTS announcement_comments (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_slug        text NOT NULL,
  announcement_id      uuid NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  author_type          text NOT NULL CHECK (author_type IN ('coach', 'member')),
  author_coach_id      uuid REFERENCES team_coaches(id) ON DELETE SET NULL,
  author_member_id     uuid REFERENCES team_members(id) ON DELETE SET NULL,
  author_name          text NOT NULL,
  author_role          text NOT NULL,
  body                 text NOT NULL,
  status               text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  decided_by_coach_id  uuid REFERENCES team_coaches(id) ON DELETE SET NULL,
  decided_at           timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Feed rendering: "every comment on this announcement" (application code
-- then filters approved-vs-own-pending-or-declined per viewer).
CREATE INDEX IF NOT EXISTS announcement_comments_announcement_id_idx
  ON announcement_comments (announcement_id);

-- Head Coach moderation queue: "pending comments for this campaign".
-- Composite (not two separate indexes) since every moderation-queue query
-- filters on both columns together.
CREATE INDEX IF NOT EXISTS announcement_comments_campaign_status_idx
  ON announcement_comments (campaign_slug, status);
