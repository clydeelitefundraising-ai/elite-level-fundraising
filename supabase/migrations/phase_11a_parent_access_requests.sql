-- Phase 11a: Parent Access Approval.
--
-- Previously, POST /api/auth/join (role=parent) and PATCH
-- /api/team/[slug]/members/me inserted/updated a team_members row directly
-- — a parent got live team + athlete access immediately, with no coach
-- review. This closes that gap by requiring Head Coach approval, mirroring
-- pending_athlete_requests (Phase 1B) exactly: a request row is created
-- FIRST, and the team_members row (the thing that actually grants access,
-- read by getMemberSession/getActorForAccount) is only ever created when a
-- Head Coach approves it.
--
-- This is why NO team_members schema change is needed: a pending parent
-- simply has no team_members row for that campaign yet, so every existing
-- protected route already denies them via the same "actor.kind === public"
-- check every other unauthenticated visitor hits — there is no separate
-- status flag to remember to check everywhere. Existing already-approved
-- parent relationships (their team_members rows) are never touched by this
-- migration or by this feature's code — they never pass through this table.
--
-- Additive only; safe for existing teams.

CREATE TABLE IF NOT EXISTS parent_access_requests (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_slug          text NOT NULL,
  account_id             uuid NOT NULL REFERENCES elf_accounts(id) ON DELETE CASCADE,
  parent_name            text NOT NULL,
  athlete_id             uuid NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  status                 text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  decided_by_account_id  uuid REFERENCES elf_accounts(id) ON DELETE SET NULL,
  decided_at             timestamptz,
  decline_reason         text,
  resulting_member_id    uuid REFERENCES team_members(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- Head Coach queue listing: "pending requests for this campaign".
CREATE INDEX IF NOT EXISTS parent_access_requests_campaign_slug_idx
  ON parent_access_requests (campaign_slug);

-- /teams pending-card lookup: "requests submitted by this account".
CREATE INDEX IF NOT EXISTS parent_access_requests_account_id_idx
  ON parent_access_requests (account_id);

-- One active (pending) request per parent+child — the DB-level backstop
-- against double-click/browser-retry duplicates, mirroring
-- pending_athlete_requests_active_uniq. Keyed on (account_id, athlete_id)
-- rather than (account_id, campaign_slug) specifically so the SAME parent
-- can hold independent simultaneous pending requests for a second child or
-- a second team — each is a distinct (account_id, athlete_id) pair even
-- when two children share a campaign_slug.
CREATE UNIQUE INDEX IF NOT EXISTS parent_access_requests_active_uniq
  ON parent_access_requests (account_id, athlete_id)
  WHERE status = 'pending';
