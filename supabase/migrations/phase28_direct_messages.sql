-- Phase 28: Direct Messaging System

-- Add coach_id to push_subscriptions for per-coach DM push targeting
ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS coach_id uuid REFERENCES team_coaches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS push_subscriptions_coach_idx
  ON push_subscriptions (coach_id);

-- ─── message_threads ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS message_threads (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_slug         text        NOT NULL,
  subject               text,
  created_by_type       text        NOT NULL CHECK (created_by_type IN ('coach','member')),
  created_by_coach_id   uuid        REFERENCES team_coaches(id) ON DELETE SET NULL,
  created_by_member_id  uuid        REFERENCES team_members(id) ON DELETE SET NULL,
  last_message_at       timestamptz NOT NULL DEFAULT now(),
  last_message_preview  text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT threads_creator_check CHECK (
    (created_by_type = 'coach'  AND created_by_coach_id  IS NOT NULL AND created_by_member_id IS NULL) OR
    (created_by_type = 'member' AND created_by_member_id IS NOT NULL AND created_by_coach_id  IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS message_threads_slug_idx
  ON message_threads (campaign_slug, last_message_at DESC);

-- ─── message_thread_participants ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS message_thread_participants (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id        uuid        NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  actor_type       text        NOT NULL CHECK (actor_type IN ('coach','member')),
  coach_id         uuid        REFERENCES team_coaches(id)  ON DELETE CASCADE,
  member_id        uuid        REFERENCES team_members(id)  ON DELETE CASCADE,
  is_auto_included boolean     NOT NULL DEFAULT false,
  is_observer      boolean     NOT NULL DEFAULT false,
  joined_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT participants_actor_check CHECK (
    (actor_type = 'coach'  AND coach_id  IS NOT NULL AND member_id IS NULL) OR
    (actor_type = 'member' AND member_id IS NOT NULL AND coach_id  IS NULL)
  )
);

-- Prevent duplicate participants per thread
CREATE UNIQUE INDEX IF NOT EXISTS mtp_coach_uniq
  ON message_thread_participants (thread_id, coach_id)
  WHERE coach_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS mtp_member_uniq
  ON message_thread_participants (thread_id, member_id)
  WHERE member_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS mtp_coach_id_idx  ON message_thread_participants (coach_id);
CREATE INDEX IF NOT EXISTS mtp_member_id_idx ON message_thread_participants (member_id);

-- ─── messages ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS messages (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id        uuid        NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  sender_type      text        NOT NULL CHECK (sender_type IN ('coach','member')),
  sender_coach_id  uuid        REFERENCES team_coaches(id)  ON DELETE SET NULL,
  sender_member_id uuid        REFERENCES team_members(id)  ON DELETE SET NULL,
  body             text        NOT NULL CHECK (length(trim(body)) > 0 AND length(body) <= 3000),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT messages_sender_check CHECK (
    (sender_type = 'coach'  AND sender_coach_id  IS NOT NULL AND sender_member_id IS NULL) OR
    (sender_type = 'member' AND sender_member_id IS NOT NULL AND sender_coach_id  IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS messages_thread_idx ON messages (thread_id, created_at ASC);

-- ─── message_reads ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS message_reads (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid        NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  actor_type text        NOT NULL CHECK (actor_type IN ('coach','member')),
  coach_id   uuid        REFERENCES team_coaches(id)  ON DELETE CASCADE,
  member_id  uuid        REFERENCES team_members(id)  ON DELETE CASCADE,
  read_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT message_reads_actor_check CHECK (
    (actor_type = 'coach'  AND coach_id  IS NOT NULL AND member_id IS NULL) OR
    (actor_type = 'member' AND member_id IS NOT NULL AND coach_id  IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS mr_coach_uniq
  ON message_reads (message_id, coach_id)
  WHERE coach_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS mr_member_uniq
  ON message_reads (message_id, member_id)
  WHERE member_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS mr_coach_id_idx  ON message_reads (coach_id);
CREATE INDEX IF NOT EXISTS mr_member_id_idx ON message_reads (member_id);
