-- Phase 28b: Fix message_reads duplicate handling
--
-- PostgREST's on_conflict= param requires a non-partial unique index.
-- The partial indexes from phase28 (WHERE coach_id IS NOT NULL / WHERE member_id IS NOT NULL)
-- can't be used as an on_conflict target. Add a generated column that PostgREST can target.

ALTER TABLE message_reads
  ADD COLUMN IF NOT EXISTS participant_key text
    GENERATED ALWAYS AS (actor_type || ':' || COALESCE(coach_id::text, member_id::text)) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS mr_participant_key_uniq
  ON message_reads (message_id, participant_key);
