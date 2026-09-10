-- Phase 11b: Post Likes / Thumbs-Up reactions on Communications → Team
-- Updates. Mirrors announcement_comments' polymorphic author shape
-- (author_type + author_coach_id/author_member_id/author_platform_admin_id)
-- since there is no single unified identity id across coach/member/
-- platform-admin roles in this app's session model — every route resolves
-- an ActorKey of exactly this shape (see lib/messages.ts), never a bare
-- account id. platform_admin is included from the start (unlike the
-- original Phase 11b draft) since it's already a first-class ActorKey
-- kind by the time this migration is written — see
-- phase_a29_platform_admin.sql / phase_a30_platform_admin_writes.sql.
--
-- Three partial unique indexes (rather than one composite UNIQUE) because
-- exactly one of author_coach_id/author_member_id/author_platform_admin_id
-- is ever non-NULL for any given row, and Postgres treats NULL <> NULL —
-- a single composite UNIQUE would NOT block a duplicate like (the NULL
-- columns would never collide). Same reasoning already documented for
-- announcement_comments' author columns.
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
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_slug             text NOT NULL,
  announcement_id           uuid NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  author_type               text NOT NULL CHECK (author_type IN ('coach', 'member', 'platform_admin')),
  author_coach_id           uuid REFERENCES team_coaches(id) ON DELETE CASCADE,
  author_member_id          uuid REFERENCES team_members(id) ON DELETE CASCADE,
  author_platform_admin_id  uuid REFERENCES platform_admins(id) ON DELETE CASCADE,
  created_at                timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS post_likes_coach_unique
  ON post_likes (announcement_id, author_coach_id) WHERE author_coach_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS post_likes_member_unique
  ON post_likes (announcement_id, author_member_id) WHERE author_member_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS post_likes_platform_admin_unique
  ON post_likes (announcement_id, author_platform_admin_id) WHERE author_platform_admin_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS post_likes_announcement_id_idx
  ON post_likes (announcement_id);
