-- Phase A26: Existing-Coach Campaign Assignment
--
-- Defensive DB-level guard: prevents the same elf_accounts row from being
-- linked to the same campaign via team_coaches more than once. Confirmed
-- live (2026-07-25) that no such constraint exists today — team_coaches
-- only has a UNIQUE(email, campaign_slug) constraint, which does NOT
-- protect against inserting a second row for the same account_id with a
-- different email string (empirically verified: two inserts with the same
-- account_id + campaign_slug but different email both succeeded). Partial
-- (account_id IS NOT NULL) so legacy/unlinked coach rows are unaffected.
-- Mirrors the existing partial-unique-index pattern used by
-- phase_a22_account_modernization.sql's team_members_athlete_claim_uniq.

CREATE UNIQUE INDEX IF NOT EXISTS team_coaches_campaign_slug_account_id_uniq
  ON team_coaches (campaign_slug, account_id)
  WHERE account_id IS NOT NULL;
