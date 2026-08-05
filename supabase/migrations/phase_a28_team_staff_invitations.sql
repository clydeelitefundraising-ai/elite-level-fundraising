-- Phase A28: Head Coach Staff Management
--
-- New table for pending staff invitations (Assistant Coach / Booster) sent
-- by a Head Coach from inside the Team App. Deliberately decoupled from
-- team_coaches — unlike the existing admin coach_invite_tokens flow (which
-- requires a team_coaches row to already exist before an invite can be
-- sent), no team_coaches row, elf_accounts row, or any other campaign
-- artifact is created until the invitee actually accepts. This avoids the
-- orphaned-record class of bug fixed in Phase A26 (orphaned campaigns) —
-- here applied to orphaned staff relationships instead.
--
-- Token pattern mirrors the existing hashed single-use token convention
-- (coach_invite_tokens, account_reset_tokens / lib/coachInvite.ts) — only
-- the SHA-256 hash of the raw token is ever stored.
--
-- Additive only; safe for existing teams. No existing table is modified.

CREATE TABLE IF NOT EXISTS team_staff_invitations (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_slug          text NOT NULL,
  email                  text NOT NULL,
  normalized_email       text NOT NULL,
  full_name              text NOT NULL,
  role                   text NOT NULL CHECK (role IN ('assistant_coach', 'booster')),
  token_hash             text NOT NULL UNIQUE,
  invited_by_account_id  uuid REFERENCES elf_accounts(id) ON DELETE SET NULL,
  expires_at             timestamptz NOT NULL,
  accepted_at            timestamptz,
  revoked_at             timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- Fast token lookup on acceptance (already unique above; explicit index for
-- clarity and to match the lookup pattern used by every other write here).
CREATE INDEX IF NOT EXISTS team_staff_invitations_token_hash_idx
  ON team_staff_invitations (token_hash);

-- Staff-page listing: "pending invitations for this campaign".
CREATE INDEX IF NOT EXISTS team_staff_invitations_campaign_slug_idx
  ON team_staff_invitations (campaign_slug);

-- Prevents a second active (not yet accepted or revoked) invitation for the
-- same person + role on the same team — the DB-level backstop against
-- double-click / browser-retry duplicate invitations, mirroring the
-- phase_a26 partial-unique-index pattern for team_coaches.
CREATE UNIQUE INDEX IF NOT EXISTS team_staff_invitations_active_uniq
  ON team_staff_invitations (campaign_slug, normalized_email, role)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;
