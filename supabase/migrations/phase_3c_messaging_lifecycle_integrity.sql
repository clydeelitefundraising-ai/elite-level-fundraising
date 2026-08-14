-- Phase 3C: Messaging Lifecycle Integrity — durable creator/sender identity
--
-- Corrects a real, confirmed defect in the original Phase 28 messaging
-- schema, discovered while auditing the (already-fixed) Phase 3B-2
-- announcement_comments migration: message_threads.threads_creator_check
-- and messages.messages_sender_check each pair ON DELETE SET NULL on the
-- creator/sender FK columns with a CHECK requiring exactly one of them to
-- stay non-null. ON DELETE SET NULL fires as an UPDATE on this table,
-- which is itself subject to the table's own CHECK constraints — so
-- removing a staff member or team member who had ever created a thread or
-- sent a message would abort with a constraint violation and block the
-- removal entirely. Confirmed reachable via (at least) six live code
-- paths: removeStaffRelationship(), admin/coaches/[id] coach deletion,
-- three demo reset/seed routes, and (for threads_creator_check
-- specifically) the full campaign-deletion route, whose own careful
-- child-before-parent ordering pre-cleans messages/participants/reads but
-- not message_threads itself before deleting team_coaches/team_members.
--
-- Fix mirrors the Phase 3B-2 announcement_comments correction exactly:
-- creator_name/creator_role and sender_name/sender_role are durable
-- snapshot columns, captured once at creation time from the resolved
-- session — the authoritative, always-present display identity, immune
-- to what later happens to the live team_coaches/team_members rows.
-- created_by_coach_id/created_by_member_id and sender_coach_id/
-- sender_member_id remain exactly as they are (nullable, ON DELETE SET
-- NULL) — now used only for best-effort profile-photo enrichment and any
-- future live-relationship lookups, never required to stay non-null.
--
-- Deliberately NOT replaced with any other CHECK requiring a creator/
-- sender ID to remain non-null — that would just reintroduce the same
-- defect under a different name.
--
-- message_thread_participants and message_reads are NOT touched by this
-- migration — both already use ON DELETE CASCADE (not SET NULL) on their
-- identical-shaped actor_type/coach_id/member_id CHECK, so removing a
-- staff/member relationship deletes their participant/read rows outright
-- instead of attempting to null one column of them, and no conflict is
-- possible there. That is the CORRECT behavior for thread *access*
-- (departure should remove access), which is a separate concern from
-- historical message *attribution* (departure should not erase or block
-- anything about what was already said). participant_key and its indexes
-- are untouched.
--
-- Additive only; no message or thread is deleted, no message body is
-- changed, no participant/read row is mutated. Backfill sources every
-- existing row's snapshot from the CURRENT live team_coaches/team_members
-- relationship (pre-migration audit confirmed 100% of existing rows —
-- 12 threads, 20 messages — already have a valid, resolvable, non-null
-- creator/sender reference today); the 'Former Team Member' fallback is
-- defensive only and is not expected to affect any current row.

-- ─── message_threads ─────────────────────────────────────────────────────────

ALTER TABLE message_threads
  ADD COLUMN IF NOT EXISTS creator_name text,
  ADD COLUMN IF NOT EXISTS creator_role text;

UPDATE message_threads mt
SET creator_name = tc.name, creator_role = tc.role
FROM team_coaches tc
WHERE mt.created_by_type = 'coach'
  AND mt.created_by_coach_id = tc.id
  AND mt.creator_name IS NULL;

UPDATE message_threads mt
SET creator_name = tm.name, creator_role = tm.role
FROM team_members tm
WHERE mt.created_by_type = 'member'
  AND mt.created_by_member_id = tm.id
  AND mt.creator_name IS NULL;

-- Defensive fallback only — an honest label for a genuinely unresolved
-- historical identity (e.g. the live relationship was already gone
-- before this migration ran), never a fabricated name. Not expected to
-- affect any row given the pre-migration audit above.
UPDATE message_threads
SET creator_name = 'Former Team Member', creator_role = ''
WHERE creator_name IS NULL;

ALTER TABLE message_threads
  ALTER COLUMN creator_name SET NOT NULL,
  ALTER COLUMN creator_role SET NOT NULL;

-- Removes the contradictory constraint. Deliberately no replacement
-- CHECK requiring created_by_coach_id/created_by_member_id to stay
-- non-null — that is precisely the defect being fixed.
ALTER TABLE message_threads DROP CONSTRAINT IF EXISTS threads_creator_check;

-- ─── messages ────────────────────────────────────────────────────────────────

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS sender_name text,
  ADD COLUMN IF NOT EXISTS sender_role text;

UPDATE messages m
SET sender_name = tc.name, sender_role = tc.role
FROM team_coaches tc
WHERE m.sender_type = 'coach'
  AND m.sender_coach_id = tc.id
  AND m.sender_name IS NULL;

UPDATE messages m
SET sender_name = tm.name, sender_role = tm.role
FROM team_members tm
WHERE m.sender_type = 'member'
  AND m.sender_member_id = tm.id
  AND m.sender_name IS NULL;

UPDATE messages
SET sender_name = 'Former Team Member', sender_role = ''
WHERE sender_name IS NULL;

ALTER TABLE messages
  ALTER COLUMN sender_name SET NOT NULL,
  ALTER COLUMN sender_role SET NOT NULL;

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_sender_check;
