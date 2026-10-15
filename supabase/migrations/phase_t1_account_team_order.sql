-- Custom Team Ordering T1: per-account saved order for the Team Selector
-- (/teams) and the in-team switcher — every list getAccountTeams() supplies.
--
-- One row per account. team_slugs is the account's preferred order of
-- campaign_slug values, saved as a whole list from the Reorder control.
-- Display rules live in app code (src/lib/teamOrder.ts):
--   * saved slugs that are still current memberships come first, in order
--   * slugs no longer a membership (left/removed team) are ignored, never
--     shown — they drop out of the row on the account's next save
--   * memberships not in the list (newly joined teams) follow, oldest
--     membership first, so a new team lands at the bottom
--   * no row at all = oldest membership first (deterministic tie-break)
--
-- This table never grants or reflects access: membership and role
-- resolution stay entirely in team_coaches / team_members, which this
-- migration does not touch. The app only accepts slugs the signed-in
-- account actually belongs to when saving.
--
-- RLS enabled with no policies: only the service role (app server) can
-- read or write, same as the other account-level tables in production.
-- ON DELETE CASCADE removes the row when the account is deleted, matching
-- push_preferences — accountDeletion.ts needs no change.
--
-- Additive only. No existing table/column altered, no data written.
-- The app falls back to the default order while this table is missing, so
-- it is safe to run before or after the app deploy.

CREATE TABLE IF NOT EXISTS account_team_order (
  account_id uuid        PRIMARY KEY REFERENCES elf_accounts(id) ON DELETE CASCADE,
  team_slugs text[]      NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE account_team_order ENABLE ROW LEVEL SECURITY;
