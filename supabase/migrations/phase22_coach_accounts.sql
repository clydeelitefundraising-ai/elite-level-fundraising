-- Phase 22: Coach Account Unification
-- Adds account_id to team_coaches and a single-use invite/reset token table.

-- 1. Link coaches to the unified elf_accounts identity system
ALTER TABLE team_coaches
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES elf_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS team_coaches_account_id_idx ON team_coaches (account_id);

-- 2. Single-use, expiring invite/reset tokens for coach account activation
CREATE TABLE IF NOT EXISTS coach_invite_tokens (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id    uuid        NOT NULL REFERENCES team_coaches(id) ON DELETE CASCADE,
  token_hash  text        NOT NULL,         -- sha256(raw token); raw token never stored
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,                  -- NULL until consumed
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coach_invite_tokens_token_hash_idx ON coach_invite_tokens (token_hash);
CREATE INDEX IF NOT EXISTS coach_invite_tokens_coach_id_idx   ON coach_invite_tokens (coach_id);
