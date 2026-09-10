-- Phase 11b: Post Likes / Thumbs-Up reactions on Communications → Team
-- Updates. Mirrors announcement_comments' polymorphic author shape
-- (author_type + author_coach_id/author_member_id) since there is no
-- single unified identity id across coach/member roles in this app's
-- session model — every route resolves an ActorKey of exactly this shape
-- (see lib/messages.ts), never a bare account id.
--
-- Two partial unique indexes (rather than one composite UNIQUE) because
-- exactly one of author_coach_id/author_member_id is always NULL for any
-- given row, and Postgres treats NULL <> NULL — a single
-- UNIQUE(announcement_id, author_coach_id, author_member_id) would NOT
-- block a coach or member from inserting a second like (both NULL/self
-- columns would never collide). This is the same reasoning already
-- documented for announcement_comments' author columns.
--
-- ON DELETE CASCADE (not SET NULL, unlike announcement_comments): a like
-- has no durable snapshot content worth preserving after the liker's
-- membership row is gone — cascading delete is simpler and avoids
-- announcement_comments' historical SET-NULL-vs-CHECK-constraint bug class
-- (see that table's migration) without needing to reproduce its
-- workaround here, since there's no CHECK requiring exactly one non-null
-- column on this table.
--
-- Additive only; safe for existing teams.

CREATE TABLE IF NOT EXISTS post_likes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_slug    text NOT NULL,
  announcement_id  uuid NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  author_type      text NOT NULL CHECK (author_type IN ('coach', 'member')),
  author_coach_id  uuid REFERENCES team_coaches(id) ON DELETE CASCADE,
  author_member_id uuid REFERENCES team_members(id) ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS post_likes_coach_unique
  ON post_likes (announcement_id, author_coach_id) WHERE author_coach_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS post_likes_member_unique
  ON post_likes (announcement_id, author_member_id) WHERE author_member_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS post_likes_announcement_id_idx
  ON post_likes (announcement_id);
