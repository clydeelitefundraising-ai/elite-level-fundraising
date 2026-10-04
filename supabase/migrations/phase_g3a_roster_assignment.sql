-- Group Messaging G3A: roster-assignment schema + backfill.
--
-- LOCKED ARCHITECTURE (see the G3 roster-assignment architecture audit):
--   athletes                      = roster identity (no login, no account)
--   team_members                  = joined/authenticated ELF identity
--   message_thread_athletes (NEW) = roster athletes assigned to a custom
--                                    message group — "who the coach picked,"
--                                    independent of whether they've joined
--   message_thread_participants   = authenticated identities currently
--                                    allowed to read/send/receive (UNCHANGED
--                                    — this migration adds no column here
--                                    and never stores an athletes.id in it)
--
-- A roster-only (never-joined) athlete can be assigned to a group — recorded
-- here — without a fake team_members row ever being created for them. A
-- joined athlete's real team_members.id, and any of their approved family's
-- team_members.id, continue to be the only things ever written into
-- message_thread_participants. This table answers "who is assigned," never
-- "who can read" — read/send/attachment authorization is untouched and
-- continues to run entirely through message_thread_participants.
--
-- Additive only. No existing table/column altered, no data mutated except
-- the backfill INSERTs below (new rows only, idempotent, group threads
-- only).

-- ─── message_thread_athletes ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS message_thread_athletes (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id  uuid        NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  athlete_id uuid        NOT NULL REFERENCES athletes(id)        ON DELETE CASCADE,
  added_at   timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz
);

-- One persistent row per (thread_id, athlete_id), for the entire life of the
-- assignment — re-add reactivates (removed_at = NULL via UPDATE), it never
-- inserts a second row. Same reactivate-by-UPDATE convention already
-- established for message_thread_participants (see phase_g1's header
-- comment), just with a plain (not partial) UNIQUE index: unlike
-- message_thread_participants — where mtp_coach_uniq/mtp_member_uniq are
-- partial specifically so cross-actor-type NULLs never collide — this table
-- has exactly one non-nullable identity column, so a plain UNIQUE constraint
-- already expresses "at most one row per (thread, athlete) regardless of
-- removed_at" with no NULL-collision concern to design around.
CREATE UNIQUE INDEX IF NOT EXISTS message_thread_athletes_thread_athlete_uniq
  ON message_thread_athletes (thread_id, athlete_id);

-- Active assignments by thread — Manage Group's "who is on the roster for
-- this group" read, and the add/remove/reconciliation logic's "all
-- currently-assigned athletes for this thread" scan.
CREATE INDEX IF NOT EXISTS message_thread_athletes_active_by_thread_idx
  ON message_thread_athletes (thread_id)
  WHERE removed_at IS NULL;

-- Active assignments by athlete — the reverse-lookup used by both
-- activation hooks (athlete joins via /enter-code; a parent is approved
-- for this athlete) to find every group this athlete is currently assigned
-- to, across the whole campaign.
CREATE INDEX IF NOT EXISTS message_thread_athletes_active_by_athlete_idx
  ON message_thread_athletes (athlete_id)
  WHERE removed_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- BACKFILL — existing G1 groups created before this migration.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- For every ACTIVE, DIRECTLY-chosen athlete participant (actor_type='member',
-- role='athlete', removed_at IS NULL, is_auto_included=false) on an existing
-- thread_type='group' thread, insert the corresponding roster assignment.
--
-- Excluded by construction of the WHERE clause below (never backfilled):
--   - DMs                         (mt.thread_type = 'group' filter)
--   - parent participants         (tm.role = 'athlete' filter — a parent's
--                                   team_members.athlete_id is the LEGACY
--                                   family-link column, not a roster
--                                   assignment, and must never be read as one)
--   - coach participants          (mtp.actor_type = 'member' filter)
--   - auto-included family rows   (mtp.is_auto_included = false — only a
--                                   directly-selected athlete seed is a real
--                                   roster assignment; an auto-included
--                                   athlete row should not occur per G1's own
--                                   model, but the filter is explicit anyway)
--   - removed/soft-deleted rows   (mtp.removed_at IS NULL)
--   - a member row with no athlete_id link (tm.athlete_id IS NOT NULL)
--   - cross-campaign mismatches   (tm.campaign_slug = mt.campaign_slug,
--                                   explicit join condition, never assumed)
--
-- Idempotent: ON CONFLICT (thread_id, athlete_id) DO NOTHING — safe to run
-- more than once, and safe even if application code has already started
-- writing message_thread_athletes rows for brand-new groups before this
-- backfill runs (no duplicate, no error).
INSERT INTO message_thread_athletes (thread_id, athlete_id)
SELECT DISTINCT mtp.thread_id, tm.athlete_id
FROM message_thread_participants mtp
JOIN message_threads mt ON mt.id = mtp.thread_id
JOIN team_members     tm ON tm.id = mtp.member_id
WHERE mt.thread_type        = 'group'
  AND mtp.actor_type        = 'member'
  AND mtp.removed_at        IS NULL
  AND mtp.is_auto_included  = false
  AND tm.role                = 'athlete'
  AND tm.athlete_id          IS NOT NULL
  AND tm.campaign_slug       = mt.campaign_slug
ON CONFLICT (thread_id, athlete_id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION — run after applying. None of these mutate anything.
-- ═══════════════════════════════════════════════════════════════════════════

-- (a) Every backfilled row traces back to a real, same-campaign, directly-
-- selected athlete participant — spot-check a handful:
-- SELECT mta.thread_id, mta.athlete_id, mt.campaign_slug, mt.thread_type
-- FROM message_thread_athletes mta
-- JOIN message_threads mt ON mt.id = mta.thread_id
-- ORDER BY mta.added_at DESC LIMIT 20;

-- (b) No DM ever gained a roster assignment:
-- SELECT count(*) FROM message_thread_athletes mta
-- JOIN message_threads mt ON mt.id = mta.thread_id
-- WHERE mt.thread_type <> 'group';
-- Expect: 0.

-- (c) No parent/coach participant was ever mistaken for a roster assignment
-- (every assignment's athlete_id must match at least one ACTUAL athlete-role
-- team_members row that was a direct participant on that same thread):
-- SELECT count(*) FROM message_thread_athletes mta
-- WHERE NOT EXISTS (
--   SELECT 1 FROM message_thread_participants mtp
--   JOIN team_members tm ON tm.id = mtp.member_id
--   WHERE mtp.thread_id = mta.thread_id
--     AND tm.athlete_id = mta.athlete_id
--     AND tm.role = 'athlete'
-- );
-- Expect: 0.

-- (d) Re-running the backfill INSERT above a second time inserts zero new
-- rows (idempotency proof) — rerun it and check:
-- SELECT count(*) FROM message_thread_athletes;
-- Expect: identical count before and after a second run.

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK PLAN
-- ═══════════════════════════════════════════════════════════════════════════
-- Safe to fully reverse as long as no application code has relied on this
-- table existing yet (i.e. before this phase's server code is deployed):
--
--   DROP INDEX IF EXISTS message_thread_athletes_active_by_athlete_idx;
--   DROP INDEX IF EXISTS message_thread_athletes_active_by_thread_idx;
--   DROP INDEX IF EXISTS message_thread_athletes_thread_athlete_uniq;
--   DROP TABLE IF EXISTS message_thread_athletes;
--
-- This drops the backfilled rows along with the table — nothing else in the
-- schema (message_threads, message_thread_participants, athletes,
-- team_members) is ever touched by this migration or its rollback.
