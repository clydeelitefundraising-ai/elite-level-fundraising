-- Phase A33: Self-service password recovery for modern ELF accounts.
-- Purely additive — no changes to elf_accounts schema. Mirrors the
-- single-use, expiring token shape established by coach_invite_tokens
-- (phase22_coach_accounts.sql).

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid        NOT NULL REFERENCES elf_accounts(id) ON DELETE CASCADE,
  token_hash  text        NOT NULL,         -- sha256(raw token); raw token never stored
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,                  -- NULL until consumed
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_token_hash_idx ON password_reset_tokens (token_hash);
CREATE INDEX IF NOT EXISTS password_reset_tokens_account_id_idx ON password_reset_tokens (account_id);
