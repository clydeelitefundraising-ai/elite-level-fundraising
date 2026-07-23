-- Phase A22: Identity & Account Modernization
--
-- ACTION REQUIRED: run this before deploying the new join flow — the join
-- route and password-reset routes will fail (or, for the claim-uniqueness
-- index, silently allow duplicate claims) until this runs.

-- ── Multi-athlete links for parent-role team_members ────────────────────────
-- A parent's team_members row is still one row per (account, campaign_slug),
-- but a parent can have multiple kids on the same roster. team_members.athlete_id
-- (existing column) remains the athlete's own single self-link — untouched,
-- still used exactly as before for role='athlete' rows. This new join table
-- is additive: it's how a role='parent' row links to one or more athletes.
CREATE TABLE IF NOT EXISTS team_member_athletes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id  uuid NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  athlete_id      uuid NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_member_id, athlete_id)
);
CREATE INDEX IF NOT EXISTS team_member_athletes_member_idx  ON team_member_athletes (team_member_id);
CREATE INDEX IF NOT EXISTS team_member_athletes_athlete_idx ON team_member_athletes (athlete_id);

-- ── Roster claiming integrity ────────────────────────────────────────────────
-- At most one athlete-role team_members row may claim a given roster athlete.
-- This is the actual enforcement mechanism behind "claimed vs unclaimed" —
-- deliberately DB-level, not just app-level, so it holds even under races.
-- Parents are NOT subject to this (many parents may link to the same athlete
-- via team_member_athletes above).
CREATE UNIQUE INDEX IF NOT EXISTS team_members_athlete_claim_uniq
  ON team_members (athlete_id)
  WHERE role = 'athlete' AND athlete_id IS NOT NULL;

-- ── Password reset tokens for elf_accounts ──────────────────────────────────
-- Mirrors coach_invite_tokens (phase22_coach_accounts.sql) exactly: single-use,
-- hashed-only storage of the raw token, time-limited.
CREATE TABLE IF NOT EXISTS account_reset_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES elf_accounts(id) ON DELETE CASCADE,
  token_hash  text NOT NULL,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS account_reset_tokens_hash_idx    ON account_reset_tokens (token_hash);
CREATE INDEX IF NOT EXISTS account_reset_tokens_account_idx ON account_reset_tokens (account_id);
