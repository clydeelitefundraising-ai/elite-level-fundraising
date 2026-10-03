-- Family Relationships Phase C1: harden concurrent parent-access approvals
-- against duplicate team_members rows for the same account+campaign.
--
-- AUDIT FINDING: approveRequest() (src/lib/platform/parentAccessRequests.ts)
-- and createLinkedAthleteMember() (src/lib/platform/athletes.ts) both do a
-- check-then-insert on (account_id, campaign_slug) — "does a team_members
-- row already exist for this account on this campaign? if not, create one"
-- — with no database-level backstop. Two sibling parent_access_requests
-- (e.g. Emma and Jake, same parent, same team) approved at nearly the same
-- moment could both observe no existing row and each insert one, leaving
-- the parent with two team_members identities on the same team.
--
-- This is already the PRODUCT'S intended invariant, not a new rule being
-- invented here:
--   - team_coaches already enforces the equivalent via the existing
--     team_coaches_campaign_slug_account_id_uniq partial unique index
--     (UNIQUE (campaign_slug, account_id) WHERE account_id IS NOT NULL).
--   - staffInvite.ts's hasSameCampaignRelationship() independently assumes
--     "an account has at most one relationship per campaign" and actively
--     blocks adding staff when a team_members (or team_coaches) row
--     already exists for that account+campaign.
--   - createLinkedAthleteMember()'s own comment already describes exactly
--     this scenario ("If a team_members row already exists for this
--     account+campaign (e.g. a race...), links onto that existing row
--     instead of creating a second membership") as the intended behavior,
--     just without a database guarantee behind it.
--
-- Scoped to account_id IS NOT NULL only: a legacy, pre-Phase-21 cookie-only
-- join path (src/app/api/team/[slug]/join/route.ts — no longer linked from
-- any UI, but still a reachable endpoint for old shared links) creates
-- team_members rows with account_id = NULL and no account-level identity at
-- all. A partial index scoped to NOT NULL leaves those entirely
-- unconstrained, matching Postgres's own standard behavior that NULL never
-- equals NULL for uniqueness purposes, and mirrors team_coaches's identical
-- existing pattern exactly.
--
-- Forward-only. Does not touch team_coaches, team_member_athletes, or any
-- other table. Adds no column, removes no column, deletes no data.

-- Safety check: fail loudly with the exact duplicate count, rather than
-- either (a) letting CREATE UNIQUE INDEX fail with a generic duplicate-key
-- error that names only one offending row, or (b) ever auto-merging/
-- deleting anything. No data is read into logs here beyond a count; no row
-- is modified by this block.
DO $$
DECLARE
  dup_count int;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT account_id, campaign_slug
    FROM team_members
    WHERE account_id IS NOT NULL
    GROUP BY account_id, campaign_slug
    HAVING count(*) > 1
  ) dups;

  IF dup_count > 0 THEN
    RAISE EXCEPTION
      'phase_c1_team_members_account_campaign_uniq: % existing (account_id, campaign_slug) pair(s) already have more than one team_members row. This migration must not proceed until those are manually reviewed and resolved — no automatic merge/delete will be performed here. Run this to list them: SELECT account_id, campaign_slug, count(*) FROM team_members WHERE account_id IS NOT NULL GROUP BY account_id, campaign_slug HAVING count(*) > 1;',
      dup_count;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS team_members_account_campaign_uniq
  ON team_members (account_id, campaign_slug)
  WHERE account_id IS NOT NULL;
