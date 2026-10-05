-- Phase F1a: Team-Level Fundraising Toggle — schema only.
--
-- Adds a single new column, campaign_settings.fundraising_enabled, that
-- lets Platform Admin turn a team's FUNDRAISING SERVICES on/off
-- independently of everything else about the team. This migration is
-- schema-only: no route, page, or component yet reads this column to
-- change ANY behavior (that lands in a later F1 phase) — it exists purely
-- so Platform Admin can start setting it and the value can be verified in
-- production before anything depends on it.
--
-- ─── Three distinct, independent concepts on campaign_settings ────────────
-- (kept separate deliberately — never conflate these in code or copy)
--
--   archived (existing, UNCHANGED by this migration)
--     Whole team/campaign retirement — publish/unpublish of the ENTIRE
--     team. When true: the public page shows "this campaign has ended"
--     and new /enter-code joins are rejected. Existing members' authenticated
--     /team/[slug]/* tools are NOT gated by this flag today. archived takes
--     precedence over fundraising_enabled (a retired team is retired,
--     regardless of the fundraising flag's value).
--
--   fundraising_enabled (NEW — this migration)
--     Whether FUNDRAISING SERVICES specifically are currently enabled for
--     an otherwise-active team. A team can be fully usable (roster,
--     announcements, calendar, messaging, custom groups, staff tools,
--     family relationships) with this false — team management does not
--     require an active fundraiser. Platform-Admin-controlled only.
--
--   allow_coach_fundraising (existing, UNCHANGED by this migration —
--   Phase A35)
--     Whether an individual COACH may personally participate as a
--     fundraiser alongside athletes (own leaderboard entry, own goal, own
--     share link). Orthogonal to whether the team's fundraiser is enabled
--     at all — a coach-fundraising opt-in is meaningless if
--     fundraising_enabled is false, but the two flags are never written or
--     read as if they were the same thing.
--
-- ─── Backfill ordering (read before applying) ──────────────────────────────
--
-- Every campaign that exists before this migration predates the explicit
-- fundraising_enabled state. To preserve existing application behavior and
-- avoid introducing a behavioral change during F1a, every existing row —
-- archived or not — is explicitly backfilled to true. This is NOT an
-- inference that every existing campaign currently has fundraising "fully
-- available" (an archived campaign's public page already shows "this
-- campaign has ended," independent of this column); it is simply that this
-- migration must not itself change any existing campaign's observable
-- behavior. archived remains an entirely independent state and continues
-- to control whole-campaign retirement — see its own note above — and
-- takes precedence over fundraising_enabled at runtime regardless of this
-- column's value.
--
-- The column is therefore added WITHOUT a default first, every existing
-- row is explicitly backfilled to true, and ONLY THEN is the column's
-- default (for FUTURE rows — new teams/campaigns created after this
-- migration) set to false and NOT NULL enforced. This ordering is
-- deliberate: adding the column with `NOT NULL DEFAULT false` directly, in
-- one step, would have used that same default to populate every EXISTING
-- row as well (Postgres's fast-default behavior for ADD COLUMN), which
-- would have silently disabled fundraising for every existing team the
-- moment this migration ran. Splitting it into four explicit steps makes
-- that impossible and makes the intent unambiguous to a future reader.
--
-- Additive only. Does not touch archived, status, allow_coach_fundraising,
-- or any other existing column. No data in any other table is read or
-- written by this migration — donations, sponsors, fundraising_contacts,
-- athlete_outreach, campaign_coach_fundraisers, and every other
-- fundraising-history table are completely untouched.

-- Step 1 — add the column nullable, with no default yet. Deliberately NOT
-- `NOT NULL DEFAULT false` in one step — see the ordering note above.
ALTER TABLE campaign_settings
  ADD COLUMN IF NOT EXISTS fundraising_enabled boolean;

-- Step 2 — backfill every row that exists today to true, preserving
-- current behavior for every existing team. Scoped to `IS NULL` so this
-- step is idempotent and safe to re-run (a second run touches zero rows).
UPDATE campaign_settings
SET fundraising_enabled = true
WHERE fundraising_enabled IS NULL;

-- Step 3 — establish the default for FUTURE rows only. A brand-new
-- campaign/team created after this migration starts with fundraising OFF;
-- Platform Admin must explicitly enable it. This default has no effect on
-- any row that already exists (Step 2 already gave every one of them an
-- explicit, concrete value).
ALTER TABLE campaign_settings
  ALTER COLUMN fundraising_enabled SET DEFAULT false;

-- Step 4 — now that every existing row has a concrete value (Step 2) and
-- every future row gets one from the default (Step 3), NOT NULL can be
-- enforced safely, with no risk of failing against a row that was never
-- backfilled.
ALTER TABLE campaign_settings
  ALTER COLUMN fundraising_enabled SET NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION — run after applying. None of these mutate anything.
-- ═══════════════════════════════════════════════════════════════════════════

-- (a) Every row that existed before this migration is now true — including
-- archived campaigns, since the backfill is unconditional (it does not
-- read or branch on `archived`). Adjust the row count in your head to
-- match what you expect for "every campaign row that existed before
-- today, archived or not":
-- SELECT count(*) FROM campaign_settings WHERE fundraising_enabled = true;
-- SELECT count(*) FROM campaign_settings WHERE fundraising_enabled = false;
-- Expect the false count to be 0 immediately after this migration runs
-- (no campaign could have been created between Step 3 and "now" in the
-- same migration transaction).

-- (b) The column is NOT NULL with the correct future default:
-- SELECT column_name, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'campaign_settings' AND column_name = 'fundraising_enabled';
-- Expect: is_nullable = 'NO', column_default = 'false'.

-- (c) archived is completely unchanged — spot-check a few known rows'
-- archived values against what they were before this migration (manual
-- comparison, this migration does not touch that column at all).

-- (d) allow_coach_fundraising is completely unchanged — same spot-check,
-- same reasoning.

-- (e) No fundraising history was touched — row counts for donations,
-- sponsors, fundraising_contacts, athlete_outreach, campaign_coach_fundraisers
-- before and after this migration must be identical (this migration issues
-- no DML against any of those tables).

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK PLAN
-- ═══════════════════════════════════════════════════════════════════════════
-- Safe to fully reverse as long as no application code has started reading
-- or writing fundraising_enabled yet (true immediately after this F1a
-- phase, since F1a deliberately wires up Platform Admin write access only
-- and no read-path depends on the column's value):
--
--   ALTER TABLE campaign_settings ALTER COLUMN fundraising_enabled DROP NOT NULL;
--   ALTER TABLE campaign_settings ALTER COLUMN fundraising_enabled DROP DEFAULT;
--   ALTER TABLE campaign_settings DROP COLUMN IF EXISTS fundraising_enabled;
--
-- This drops only the new column — archived, allow_coach_fundraising, and
-- every other column/table are never touched by this migration or its
-- rollback.
