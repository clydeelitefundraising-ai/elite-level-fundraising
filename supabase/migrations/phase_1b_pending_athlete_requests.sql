-- Phase 1B: Unified Join Flow + Pending Athlete Approval
--
-- New table for athlete self-registration requests submitted through the
-- "I don't see my name" / not-listed path in the canonical join flow
-- (/enter-code -> POST /api/auth/join-request). Deliberately decoupled from
-- athletes/team_members — no athlete row and no team_members row is created
-- until a Head Coach approves the request — mirroring the same
-- decouple-until-decided pattern already used by team_staff_invitations
-- (Phase A28).
--
-- Additive only; safe for existing teams. No existing table is modified.

CREATE TABLE IF NOT EXISTS pending_athlete_requests (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_slug          text NOT NULL,
  account_id             uuid NOT NULL REFERENCES elf_accounts(id) ON DELETE CASCADE,
  full_name              text NOT NULL,
  class_year             text NOT NULL,
  event                  text,
  matched_athlete_id     uuid REFERENCES athletes(id) ON DELETE SET NULL,
  status                 text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  decided_by_account_id  uuid REFERENCES elf_accounts(id) ON DELETE SET NULL,
  decided_at             timestamptz,
  decline_reason         text,
  resulting_athlete_id   uuid REFERENCES athletes(id) ON DELETE SET NULL,
  resulting_member_id    uuid REFERENCES team_members(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- Head Coach queue listing: "pending requests for this campaign".
CREATE INDEX IF NOT EXISTS pending_athlete_requests_campaign_slug_idx
  ON pending_athlete_requests (campaign_slug);

-- /teams pending-card lookup: "requests submitted by this account".
CREATE INDEX IF NOT EXISTS pending_athlete_requests_account_id_idx
  ON pending_athlete_requests (account_id);

-- Prevents a second active (still pending) request for the same account on
-- the same team — the DB-level backstop against double-click / browser-retry
-- duplicate submissions, mirroring the phase_a28 partial-unique-index
-- pattern for team_staff_invitations. Application logic also checks this
-- before insert, but this is the authoritative guarantee.
CREATE UNIQUE INDEX IF NOT EXISTS pending_athlete_requests_active_uniq
  ON pending_athlete_requests (account_id, campaign_slug)
  WHERE status = 'pending';
