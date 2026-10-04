-- Group Messaging G1: schema foundation.
--
-- The existing messaging schema (phase28_direct_messages.sql onward)
-- already represents a conversation as message_threads + a genuine
-- message_thread_participants JOIN TABLE (not a 2-column pair) — nothing
-- here changes that. This migration adds only the three things the G1
-- read-only audit found actually missing:
--
--   1. message_threads.thread_type — distinguishes a DM from a named group.
--      Defaults every EXISTING row (and every future insert that doesn't
--      specify it) to 'dm', so no historical thread changes meaning.
--      Needed so group creation can deliberately bypass
--      findCanonicalExistingThread()'s "identical participant set = same
--      conversation" reuse logic (correct for DMs, wrong for two
--      differently-named groups with the same membership).
--   2. message_threads.group_name — a dedicated field for a group's name.
--      Deliberately NOT repurposing `subject`: that column has been
--      permanently null "going forward" since Phase 2B (see
--      findCanonicalExistingThread's own comments) and giving it a second,
--      group-specific meaning now would make every future reader of
--      `subject` re-litigate which era/type of row they're looking at.
--      Nullable at the column level (DMs never set it); application code
--      enforces "required for a group" at the API layer, same division of
--      responsibility already used for creator_name/sender_name (Phase 3C)
--      non-null-at-the-column but validated server-side before insert.
--   3. message_threads.archived_at — minimal archive/soft-delete marker for
--      the locked G1 "Head Coach can archive a group" behavior. Nullable,
--      NULL = active, matching the exact shape of participants.removed_at
--      below rather than inventing a separate boolean+timestamp pair.
--   4. message_thread_participants.removed_at — the locked soft-removal
--      model: NULL = active participant, non-null = removed (immediate
--      loss of access; historical messages/message_reads rows are
--      untouched, since message_reads references messages, not
--      participants, and nothing here touches that table at all).
--      Existing mtp_coach_uniq/mtp_member_uniq/mtp_platform_admin_uniq
--      partial unique indexes (unchanged) continue to guarantee at most
--      one participant row per (thread, actor) REGARDLESS of removed_at —
--      re-adding a previously-removed participant must UPDATE that row's
--      removed_at back to NULL (application logic), never INSERT a second
--      row for the same actor.
--
-- Every existing row in both tables is a DM / an active participant by
-- construction (thread_type defaults to 'dm', removed_at defaults to NULL)
-- — this migration changes the meaning of zero existing rows.
--
-- Additive only. No table dropped, no column dropped, no existing data
-- deleted or mutated. No RLS/grant changes (both tables already follow the
-- existing permissive service-role-only access pattern used throughout this
-- schema — see phase_a30's identical note for the established rationale).

-- ─── message_threads ─────────────────────────────────────────────────────────

ALTER TABLE message_threads
  ADD COLUMN IF NOT EXISTS thread_type text NOT NULL DEFAULT 'dm';

ALTER TABLE message_threads
  DROP CONSTRAINT IF EXISTS message_threads_thread_type_check;
ALTER TABLE message_threads
  ADD CONSTRAINT message_threads_thread_type_check
    CHECK (thread_type = ANY (ARRAY['dm', 'group']));

ALTER TABLE message_threads
  ADD COLUMN IF NOT EXISTS group_name text;

-- G1 review correction: the database itself now enforces the invariant
-- application code (validateGroupName — src/lib/messages.ts) already
-- checks — a 'group' row can never exist with a null/blank group_name, and
-- a 'dm' row is never required to have one. Mirrors messages.body's own
-- existing CHECK pattern exactly (length(trim(...)) > 0 for "has real
-- content", raw length(...) <= N for the max — same two-part shape, same
-- 80-char limit already enforced application-side by
-- GROUP_NAME_MAX_LENGTH). A 'dm' row's group_name is unconstrained (NULL
-- today; nothing stops it being set, though nothing ever does) — only a
-- 'group' row is held to the nonblank/length rule.
ALTER TABLE message_threads
  DROP CONSTRAINT IF EXISTS message_threads_group_name_check;
ALTER TABLE message_threads
  ADD CONSTRAINT message_threads_group_name_check
    CHECK (
      thread_type <> 'group' OR
      (group_name IS NOT NULL AND length(trim(group_name)) > 0 AND length(group_name) <= 80)
    );

ALTER TABLE message_threads
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Thread listing (getThreadsForActor) and group lookups both filter/order
-- on these — cheap, standard btree indexes, same convention as the
-- existing message_threads_slug_idx.
CREATE INDEX IF NOT EXISTS message_threads_thread_type_idx
  ON message_threads (campaign_slug, thread_type);

-- ─── message_thread_participants ─────────────────────────────────────────────

ALTER TABLE message_thread_participants
  ADD COLUMN IF NOT EXISTS removed_at timestamptz;

-- "Active participants of this thread" is now the dominant read pattern
-- (every authorization check — isParticipant, getThreadParticipants,
-- getThreadsForActor, getAccountIdsForThreadParticipants — filters on
-- removed_at IS NULL going forward). Partial index matching that exact
-- predicate, scoped by thread_id since every one of those queries also
-- filters by thread_id (or an IN-list of thread ids).
CREATE INDEX IF NOT EXISTS mtp_active_by_thread_idx
  ON message_thread_participants (thread_id)
  WHERE removed_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION — run after applying. Every query should return the stated
-- expected result; none of them mutate anything.
-- ═══════════════════════════════════════════════════════════════════════════

-- (a) Every existing thread is a DM, not accidentally a group.
-- SELECT count(*) FILTER (WHERE thread_type <> 'dm') AS non_dm_count FROM message_threads;
-- Expect: 0 (this migration never sets thread_type to 'group' itself —
-- only new application code, shipped alongside this migration, does).

-- (b) Every existing participant row is active.
-- SELECT count(*) FILTER (WHERE removed_at IS NOT NULL) AS removed_count FROM message_thread_participants;
-- Expect: 0.

-- (c) Constraints landed correctly.
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conname IN ('message_threads_thread_type_check', 'message_threads_group_name_check');
-- Expect:
--   message_threads_thread_type_check: CHECK (thread_type = ANY (ARRAY['dm'::text, 'group'::text]))
--   message_threads_group_name_check:  CHECK (thread_type <> 'group'::text OR (group_name IS NOT NULL AND length(TRIM(BOTH FROM group_name)) > 0 AND length(group_name) <= 80))

-- (d) No existing row is a 'group' with a null/blank name (vacuously true —
-- this migration never sets thread_type='group' on any existing row, see
-- (a) above, so the constraint can never reject anything that already
-- exists).
-- SELECT count(*) FROM message_threads WHERE thread_type = 'group' AND (group_name IS NULL OR length(trim(group_name)) = 0);
-- Expect: 0.

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK PLAN
-- ═══════════════════════════════════════════════════════════════════════════
-- Safe to fully reverse as long as no row has thread_type='group' or a
-- non-null removed_at/archived_at yet (i.e. before any group-messaging
-- application code has actually been used):
--
--   DROP INDEX IF EXISTS mtp_active_by_thread_idx;
--   ALTER TABLE message_thread_participants DROP COLUMN IF EXISTS removed_at;
--   DROP INDEX IF EXISTS message_threads_thread_type_idx;
--   ALTER TABLE message_threads DROP CONSTRAINT IF EXISTS message_threads_group_name_check;
--   ALTER TABLE message_threads DROP CONSTRAINT IF EXISTS message_threads_thread_type_check;
--   ALTER TABLE message_threads DROP COLUMN IF EXISTS thread_type;
--   ALTER TABLE message_threads DROP COLUMN IF EXISTS group_name;
--   ALTER TABLE message_threads DROP COLUMN IF EXISTS archived_at;
--
-- Once any group thread or soft-removed participant exists, this becomes a
-- fix-forward-only schema, same posture as phase_a30's Sections 6/7.
