-- Phase A30: Platform Admin write support
-- Run this in Supabase SQL Editor after phase_a29_platform_admin.sql and
-- phase_a29b_backfill_organizations.sql have both been applied and verified.
--
-- Extends the announcements/comments/messaging/notification-read tables so
-- a platform admin can write to them under their OWN identity
-- (platform_admins.id), without ever creating a team_coaches/team_members
-- row and without changing any existing coach/member behavior. Every
-- change below is additive (new nullable column, widened CHECK) except two
-- explicit DROP NOT NULL statements (announcements.coach_id,
-- team_files.coach_id) and the participant_key generated-column rebuild on
-- message_thread_participants/message_reads (unavoidable — Postgres has no
-- ALTER ... SET EXPRESSION for generated columns; see Section 6/7 below).
--
-- Exact current constraint/index names below were confirmed against
-- supabase/baseline/schema.sql (the 2026-08-21 pg_dump), NOT re-derived —
-- do not run this against a database whose schema has diverged from that
-- baseline without re-checking names first (\d+ each table in psql, or the
-- verification block at the bottom of this file, before Section 6/7 run).

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. announcements
-- ═══════════════════════════════════════════════════════════════════════════
-- coach_id is currently NOT NULL with no CHECK — dropping NOT NULL is the
-- entire schema change needed here; the FK (announcements_coach_id_fkey)
-- is untouched and still enforced whenever coach_id IS NOT NULL.
ALTER TABLE announcements
  ALTER COLUMN coach_id DROP NOT NULL;

ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS author_platform_admin_id uuid REFERENCES platform_admins(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS announcements_author_platform_admin_idx
  ON announcements (author_platform_admin_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. team_files
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE team_files
  ALTER COLUMN coach_id DROP NOT NULL;

ALTER TABLE team_files
  ADD COLUMN IF NOT EXISTS uploaded_by_platform_admin_id uuid REFERENCES platform_admins(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS team_files_uploaded_by_platform_admin_idx
  ON team_files (uploaded_by_platform_admin_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. announcement_comments
-- ═══════════════════════════════════════════════════════════════════════════
-- No compound "exactly one id" CHECK exists on this table today (unlike the
-- messaging tables below) — author_coach_id/author_member_id are already
-- both independently nullable with only the author_type value CHECK. This
-- section only needs to add the two columns and widen that one CHECK.
ALTER TABLE announcement_comments
  ADD COLUMN IF NOT EXISTS author_platform_admin_id uuid REFERENCES platform_admins(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS decided_by_platform_admin_id uuid REFERENCES platform_admins(id) ON DELETE SET NULL;

ALTER TABLE announcement_comments
  DROP CONSTRAINT IF EXISTS announcement_comments_author_type_check;
ALTER TABLE announcement_comments
  ADD CONSTRAINT announcement_comments_author_type_check
    CHECK (author_type = ANY (ARRAY['coach', 'member', 'platform_admin']));

CREATE INDEX IF NOT EXISTS announcement_comments_author_platform_admin_idx
  ON announcement_comments (author_platform_admin_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. message_threads
-- ═══════════════════════════════════════════════════════════════════════════
-- created_by_coach_id/created_by_member_id are already independently
-- nullable, no compound CHECK — same shape as announcement_comments above.
ALTER TABLE message_threads
  ADD COLUMN IF NOT EXISTS created_by_platform_admin_id uuid REFERENCES platform_admins(id) ON DELETE SET NULL;

ALTER TABLE message_threads
  DROP CONSTRAINT IF EXISTS message_threads_created_by_type_check;
ALTER TABLE message_threads
  ADD CONSTRAINT message_threads_created_by_type_check
    CHECK (created_by_type = ANY (ARRAY['coach', 'member', 'platform_admin']));

CREATE INDEX IF NOT EXISTS message_threads_created_by_platform_admin_idx
  ON message_threads (created_by_platform_admin_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. messages
-- ═══════════════════════════════════════════════════════════════════════════
-- sender_coach_id/sender_member_id are already independently nullable, no
-- compound CHECK on this table either.
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS sender_platform_admin_id uuid REFERENCES platform_admins(id) ON DELETE SET NULL;

ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_sender_type_check;
ALTER TABLE messages
  ADD CONSTRAINT messages_sender_type_check
    CHECK (sender_type = ANY (ARRAY['coach', 'member', 'platform_admin']));

CREATE INDEX IF NOT EXISTS messages_sender_platform_admin_idx
  ON messages (sender_platform_admin_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. message_thread_participants
-- ═══════════════════════════════════════════════════════════════════════════
-- This table has BOTH a compound "exactly one id matches actor_type" CHECK
-- (participants_actor_check) AND a STORED generated column (participant_key)
-- used as the unique on_conflict target by insertParticipantsIgnoringDuplicates()
-- (src/lib/messages.ts). Postgres has no ALTER COLUMN ... SET EXPRESSION for
-- generated columns, so participant_key must be dropped and recreated —
-- which requires dropping the unique index built on it first, and CASCADE
-- would also silently drop participants_actor_check's dependents if any
-- existed, so every drop below is explicit and ordered, not left to CASCADE.
--
-- Order: drop the participant_key-dependent unique index -> drop
-- participant_key -> add the new column -> widen actor_type CHECK ->
-- replace the compound CHECK -> recreate participant_key with 3-way
-- COALESCE -> recreate the unique index. Running these out of order (e.g.
-- adding the column after recreating participant_key) still works because
-- every ADD COLUMN here is independent, but this exact order is the one to
-- follow so a mid-script failure never leaves participant_key permanently
-- dropped without a replacement queued right behind it.

DROP INDEX IF EXISTS mtp_participant_key_uniq;

ALTER TABLE message_thread_participants
  DROP COLUMN IF EXISTS participant_key;

ALTER TABLE message_thread_participants
  ADD COLUMN IF NOT EXISTS platform_admin_id uuid REFERENCES platform_admins(id) ON DELETE CASCADE;

ALTER TABLE message_thread_participants
  DROP CONSTRAINT IF EXISTS message_thread_participants_actor_type_check;
ALTER TABLE message_thread_participants
  ADD CONSTRAINT message_thread_participants_actor_type_check
    CHECK (actor_type = ANY (ARRAY['coach', 'member', 'platform_admin']));

ALTER TABLE message_thread_participants
  DROP CONSTRAINT IF EXISTS participants_actor_check;
ALTER TABLE message_thread_participants
  ADD CONSTRAINT participants_actor_check
    CHECK (
      (actor_type = 'coach'          AND coach_id          IS NOT NULL AND member_id IS NULL AND platform_admin_id IS NULL) OR
      (actor_type = 'member'         AND member_id         IS NOT NULL AND coach_id  IS NULL AND platform_admin_id IS NULL) OR
      (actor_type = 'platform_admin' AND platform_admin_id IS NOT NULL AND coach_id  IS NULL AND member_id         IS NULL)
    );

ALTER TABLE message_thread_participants
  ADD COLUMN participant_key text GENERATED ALWAYS AS (
    actor_type || ':' || COALESCE(coach_id::text, member_id::text, platform_admin_id::text)
  ) STORED;

CREATE UNIQUE INDEX mtp_participant_key_uniq
  ON message_thread_participants (thread_id, participant_key);

CREATE INDEX IF NOT EXISTS mtp_platform_admin_id_idx
  ON message_thread_participants (platform_admin_id);

CREATE UNIQUE INDEX IF NOT EXISTS mtp_platform_admin_uniq
  ON message_thread_participants (thread_id, platform_admin_id)
  WHERE platform_admin_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. message_reads
-- ═══════════════════════════════════════════════════════════════════════════
-- Identical shape and identical generated-column constraint to Section 6 —
-- same ordered rebuild, same reasoning.

DROP INDEX IF EXISTS mr_participant_key_uniq;

ALTER TABLE message_reads
  DROP COLUMN IF EXISTS participant_key;

ALTER TABLE message_reads
  ADD COLUMN IF NOT EXISTS platform_admin_id uuid REFERENCES platform_admins(id) ON DELETE CASCADE;

ALTER TABLE message_reads
  DROP CONSTRAINT IF EXISTS message_reads_actor_type_check;
ALTER TABLE message_reads
  ADD CONSTRAINT message_reads_actor_type_check
    CHECK (actor_type = ANY (ARRAY['coach', 'member', 'platform_admin']));

ALTER TABLE message_reads
  DROP CONSTRAINT IF EXISTS message_reads_actor_check;
ALTER TABLE message_reads
  ADD CONSTRAINT message_reads_actor_check
    CHECK (
      (actor_type = 'coach'          AND coach_id          IS NOT NULL AND member_id IS NULL AND platform_admin_id IS NULL) OR
      (actor_type = 'member'         AND member_id         IS NOT NULL AND coach_id  IS NULL AND platform_admin_id IS NULL) OR
      (actor_type = 'platform_admin' AND platform_admin_id IS NOT NULL AND coach_id  IS NULL AND member_id         IS NULL)
    );

ALTER TABLE message_reads
  ADD COLUMN participant_key text GENERATED ALWAYS AS (
    actor_type || ':' || COALESCE(coach_id::text, member_id::text, platform_admin_id::text)
  ) STORED;

CREATE UNIQUE INDEX mr_participant_key_uniq
  ON message_reads (message_id, participant_key);

CREATE INDEX IF NOT EXISTS mr_platform_admin_id_idx
  ON message_reads (platform_admin_id);

CREATE UNIQUE INDEX IF NOT EXISTS mr_platform_admin_uniq
  ON message_reads (message_id, platform_admin_id)
  WHERE platform_admin_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. notification_platform_admin_reads (new table)
-- ═══════════════════════════════════════════════════════════════════════════
-- Mirrors notification_coach_reads exactly (same column shape, same unique
-- constraint shape, same FK ON DELETE CASCADE behavior) rather than adding
-- a third id column to the existing coach/member pair of tables — keeps
-- this additive and leaves two already-working tables completely untouched.
CREATE TABLE IF NOT EXISTS notification_platform_admin_reads (
  id                 uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  notification_id    uuid        NOT NULL REFERENCES notifications(id)     ON DELETE CASCADE,
  platform_admin_id  uuid        NOT NULL REFERENCES platform_admins(id)   ON DELETE CASCADE,
  read_at            timestamptz DEFAULT now() NOT NULL,
  UNIQUE (notification_id, platform_admin_id)
);

CREATE INDEX IF NOT EXISTS notification_platform_admin_reads_admin_idx
  ON notification_platform_admin_reads (platform_admin_id);

-- Matches the existing (if permissive) grant/RLS pattern used by every
-- other table in this schema: RLS enabled, zero policies, all access is
-- via the service_role key which bypasses RLS regardless — see the Phase 2
-- audit for why this is a non-issue for this app's access model. Not
-- introducing a new posture, just keeping the new table structurally
-- consistent with its siblings.
ALTER TABLE notification_platform_admin_reads ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE notification_platform_admin_reads TO anon;
GRANT ALL ON TABLE notification_platform_admin_reads TO authenticated;
GRANT ALL ON TABLE notification_platform_admin_reads TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION — run after applying. Every query should return the stated
-- expected result; none of them mutate anything.
-- ═══════════════════════════════════════════════════════════════════════════

-- (a) Confirm every widened CHECK is in place with the right definition.
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname IN (
  'announcement_comments_author_type_check',
  'message_threads_created_by_type_check',
  'messages_sender_type_check',
  'message_thread_participants_actor_type_check',
  'participants_actor_check',
  'message_reads_actor_type_check',
  'message_reads_actor_check'
)
ORDER BY conname;
-- Expect: each definition's ARRAY/OR list includes 'platform_admin'.

-- (b) Confirm both generated columns are back and correctly defined.
SELECT attrelid::regclass AS table_name, attname, attgenerated,
       pg_get_expr(adbin, adrelid) AS generation_expr
FROM pg_attribute
JOIN pg_attrdef ON pg_attrdef.adrelid = pg_attribute.attrelid AND pg_attrdef.adnum = pg_attribute.attnum
WHERE attname = 'participant_key'
  AND attrelid IN ('message_thread_participants'::regclass, 'message_reads'::regclass);
-- Expect: 2 rows, each expression referencing coach_id, member_id, AND platform_admin_id.

-- (c) No existing coach/member row was disturbed by the column rebuild —
-- row counts and coach/member participant_key values must be identical to
-- before this migration ran. Capture a "before" snapshot BEFORE running
-- Sections 6/7 (this session has no live DB access to do this for you):
--   CREATE TEMP TABLE mtp_before AS SELECT id, thread_id, actor_type, coach_id, member_id, participant_key FROM message_thread_participants;
--   CREATE TEMP TABLE mr_before  AS SELECT id, message_id, actor_type, coach_id, member_id, participant_key FROM message_reads;
-- Then after Sections 6/7:
--   SELECT * FROM mtp_before EXCEPT SELECT id, thread_id, actor_type, coach_id, member_id, participant_key FROM message_thread_participants;
--   SELECT * FROM mr_before  EXCEPT SELECT id, message_id, actor_type, coach_id, member_id, participant_key FROM message_reads;
-- Both must return 0 rows — proves every existing coach/member row's
-- participant_key recomputed to the exact same value it had before.

-- (d) announcements/team_files nullability landed and no existing row
-- lost its coach_id.
SELECT count(*) FILTER (WHERE coach_id IS NULL) AS null_coach_id,
       count(*) AS total
FROM announcements;
-- Expect null_coach_id to match whatever it was before this migration
-- (0, unless the booster/pre-existing-bug rows already exist — see the
-- Phase 2 report's anomaly finding) — this migration never sets an
-- existing coach_id to NULL, it only permits new NULLs going forward.

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK PLAN
-- ═══════════════════════════════════════════════════════════════════════════
-- Sections 1-5 and 8 are trivially reversible (DROP the added columns/
-- table/indexes, restore NOT NULL, restore the narrower CHECK) as long as
-- no row has actually used a platform_admin_id/platform_admin author_type
-- value yet — which will be true until Phase 2's application code (already
-- updated in this same change) is deployed and a seeded platform admin
-- account is used to write:
--
--   ALTER TABLE announcements ALTER COLUMN coach_id SET NOT NULL;        -- only safe if 0 NULLs exist
--   ALTER TABLE announcements DROP COLUMN author_platform_admin_id;
--   ALTER TABLE team_files ALTER COLUMN coach_id SET NOT NULL;           -- only safe if 0 NULLs exist
--   ALTER TABLE team_files DROP COLUMN uploaded_by_platform_admin_id;
--   ALTER TABLE announcement_comments DROP COLUMN author_platform_admin_id, DROP COLUMN decided_by_platform_admin_id;
--   ALTER TABLE announcement_comments DROP CONSTRAINT announcement_comments_author_type_check,
--     ADD CONSTRAINT announcement_comments_author_type_check CHECK (author_type = ANY (ARRAY['coach','member']));
--   -- (mirror the same DROP COLUMN + narrow-CHECK-restore pattern for message_threads/messages)
--   DROP TABLE notification_platform_admin_reads;
--
-- Sections 6/7 (message_thread_participants, message_reads) are the
-- expensive-to-reverse part: rolling back means repeating the same
-- drop-index / drop-column / re-add-column / recreate-index sequence in
-- reverse (2-way CHECK, 2-way participant_key). If ANY row has actually
-- been written with actor_type='platform_admin' by the time a rollback is
-- needed, that row must be deleted (or its thread/message reassigned)
-- BEFORE narrowing the CHECK back down, or the ADD CONSTRAINT step will
-- fail against existing data. Given that, the realistic rollback strategy
-- for Sections 6/7 specifically is: fix forward, don't roll back, once any
-- platform-admin message/read-receipt exists.
