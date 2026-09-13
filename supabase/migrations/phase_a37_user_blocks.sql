-- Phase A37: Interpersonal User Blocking (Apple Guideline 1.2 UGC safeguard).
--
-- Deliberately scoped to INTERPERSONAL communication only — starting a new
-- direct-message thread, and (in application code) hiding a blocked
-- actor's comments from the blocker's own view. A block is NEVER
-- consulted by the announcement pipeline (getAnnouncements/
-- isAnnouncementVisibleToActor in src/lib/teamData.ts /
-- src/lib/announcementVisibility.ts are untouched by this migration and
-- by the application code built on top of this table) — official team
-- communications, schedules, and safety information must always reach
-- every intended recipient regardless of any block relationship. This is
-- enforced structurally by never importing this table's data into that
-- code path, not by an explicit "coaches are unblockable" exception that
-- could later be bypassed or forgotten.
--
-- Same no-FK polymorphic-party pattern as content_reports (Phase A36) for
-- the same reason: blocker/blocked can each independently be a coach,
-- member, or platform admin, and a single FK column can't reference all
-- three identity tables. campaign_slug scopes every block to one team —
-- the same account acting on a different team is a distinct relationship
-- (an elf_accounts row can hold a coach role on Team A and a parent role
-- on Team B; blocking on one team must never affect the other).
--
-- Cleanup on account/membership deletion is handled explicitly by the
-- account-deletion routine (Phase A38 / src/lib/accountDeletion.ts), not
-- by ON DELETE CASCADE — there is no FK to cascade from, by design above.
--
-- Additive only; safe for existing teams. No existing table modified.

CREATE TABLE IF NOT EXISTS user_blocks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_slug     text NOT NULL,
  blocker_kind      text NOT NULL CHECK (blocker_kind IN ('coach', 'member', 'platform_admin')),
  blocker_id        uuid NOT NULL,
  blocked_kind      text NOT NULL CHECK (blocked_kind IN ('coach', 'member', 'platform_admin')),
  blocked_id        uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_blocks_no_self_block
    CHECK (NOT (blocker_kind = blocked_kind AND blocker_id = blocked_id)),
  CONSTRAINT user_blocks_unique_relationship
    UNIQUE (campaign_slug, blocker_kind, blocker_id, blocked_kind, blocked_id)
);

-- "Who have I blocked" (checked on every new-thread attempt + comment render).
CREATE INDEX IF NOT EXISTS user_blocks_blocker_idx
  ON user_blocks (campaign_slug, blocker_kind, blocker_id);

-- "Who has blocked me" (not currently used by any read path, but cheap
-- and symmetric to keep — e.g. useful later for surfacing to the blocked
-- party that a thread can no longer be started, without a table scan).
CREATE INDEX IF NOT EXISTS user_blocks_blocked_idx
  ON user_blocks (campaign_slug, blocked_kind, blocked_id);
