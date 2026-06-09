-- Phase 13: Notification System
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- Safe to run multiple times — all statements use IF NOT EXISTS / IF EXISTS guards.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add stable team_id UUID to campaign_settings
--    Each campaign gets a unique UUID that survives slug renames.
--    Future multi-sport: add a `teams` table and FK team_id to it.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE campaign_settings
  ADD COLUMN IF NOT EXISTS team_id uuid DEFAULT gen_random_uuid();

-- Backfill any rows created before this migration (should be zero in prod,
-- but the DEFAULT handles it; this UPDATE covers any edge cases).
UPDATE campaign_settings SET team_id = gen_random_uuid() WHERE team_id IS NULL;

-- Now enforce NOT NULL and UNIQUE after backfill.
ALTER TABLE campaign_settings ALTER COLUMN team_id SET NOT NULL;
ALTER TABLE campaign_settings ADD CONSTRAINT campaign_settings_team_id_key UNIQUE (team_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Notifications table (team-scoped, keyed by team_id)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       uuid        NOT NULL REFERENCES campaign_settings(team_id) ON DELETE CASCADE,
  type          text        NOT NULL CHECK (type IN ('announcement', 'file_upload', 'calendar_event', 'fundraiser')),
  title         text        NOT NULL,
  body          text        NOT NULL DEFAULT '',
  reference_id  uuid,
  reference_url text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_team_created_idx
  ON notifications (team_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Per-member read/dismiss state
--    One row per (notification, member) pair.
--    dismissed=true hides the notification from the member's view entirely.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_reads (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid        NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  member_id       uuid        NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  read_at         timestamptz,
  dismissed       boolean     NOT NULL DEFAULT false,
  UNIQUE (notification_id, member_id)
);

CREATE INDEX IF NOT EXISTS notification_reads_member_idx
  ON notification_reads (member_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Enable Realtime on notifications so clients receive live inserts
-- ─────────────────────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
