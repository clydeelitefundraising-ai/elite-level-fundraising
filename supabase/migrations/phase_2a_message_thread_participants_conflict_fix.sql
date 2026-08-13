-- Phase 2A: fix message_thread_participants ON CONFLICT handling
--
-- Same issue phase28b already fixed for message_reads: PostgREST's
-- on_conflict= param requires a non-partial unique index. The existing
-- partial indexes from phase28 (mtp_coach_uniq WHERE coach_id IS NOT NULL,
-- mtp_member_uniq WHERE member_id IS NOT NULL) can't be used as an
-- on_conflict target — an insert using on_conflict=thread_id,member_id
-- against this table fails at the database level with no matching
-- constraint, silently (the calling code didn't check the response before
-- this fix), so syncRequiredThreadParticipants()'s participant inserts
-- never actually landed.
--
-- Additive only; does not touch existing partial indexes, does not modify
-- any existing row. Pre-migration audit (read-only, against live data)
-- confirmed: every existing row generates a non-null participant_key, and
-- zero duplicate (thread_id, participant_key) identities exist — the new
-- unique index can be created without conflict.

ALTER TABLE message_thread_participants
  ADD COLUMN IF NOT EXISTS participant_key text
    GENERATED ALWAYS AS (actor_type || ':' || COALESCE(coach_id::text, member_id::text)) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS mtp_participant_key_uniq
  ON message_thread_participants (thread_id, participant_key);
