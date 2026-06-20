-- Phase 27: Team Messaging Center
-- Run in Supabase SQL Editor. Safe to run multiple times — uses IF NOT EXISTS / IF EXISTS guards.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. announcements: add recipient targeting fields
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS recipient_scope text NOT NULL DEFAULT 'everyone'
    CHECK (recipient_scope IN ('everyone','athletes','parents','boosters','athlete_specific')),
  ADD COLUMN IF NOT EXISTS recipient_athlete_id uuid;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. notifications: add 'message' type + recipient targeting fields
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
    CHECK (type IN ('announcement','file_upload','calendar_event','fundraiser','message'));

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS recipient_scope text NOT NULL DEFAULT 'everyone'
    CHECK (recipient_scope IN ('everyone','athletes','parents','boosters','athlete_specific')),
  ADD COLUMN IF NOT EXISTS recipient_athlete_id uuid;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. push_subscriptions: link subscriptions to team members for role-targeted push
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS member_id uuid REFERENCES team_members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS push_subscriptions_member_idx
  ON push_subscriptions (member_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. notification_coach_reads: per-coach read state (coaches have no team_members row)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_coach_reads (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid        NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  coach_id        uuid        NOT NULL REFERENCES team_coaches(id)  ON DELETE CASCADE,
  read_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notification_id, coach_id)
);

CREATE INDEX IF NOT EXISTS notification_coach_reads_coach_idx
  ON notification_coach_reads (coach_id);
