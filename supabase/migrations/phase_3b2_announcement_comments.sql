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
-- Author identity uses the same canonical actor_type/coach_id/member_id
-- shape already established by message_thread_participants/messages
-- (see lib/messages.ts) — NOT a denormalized name/email string — so
-- display name, role, and profile photo can always be resolved fresh via
-- the same embedded-select pattern already used there (zero N+1). This is
-- deliberately NOT modeled after announcements.coach_id, which only
-- supports staff authors (only staff can create announcements today) —
-- comments must support athlete/parent (team_members) authors too.
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
  body                 text NOT NULL,
  status               text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  decided_by_coach_id  uuid REFERENCES team_coaches(id) ON DELETE SET NULL,
  decided_at           timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT announcement_comments_author_ref_chk CHECK (
    (author_type = 'coach'  AND author_coach_id  IS NOT NULL AND author_member_id IS NULL) OR
    (author_type = 'member' AND author_member_id IS NOT NULL AND author_coach_id  IS NULL)
  )
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
