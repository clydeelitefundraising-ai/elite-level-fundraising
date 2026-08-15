-- Phase 4C: calendar subscription tokens (external calendar sync).
--
-- Brand-new table — does not touch calendar_events or any existing table,
-- row, or column. Purely additive: CREATE TABLE + two indexes, nothing
-- else. Safe to run on production with zero rows affected elsewhere.
--
-- Purpose: lets ELF issue a revocable, per-campaign secret token whose
-- URL Apple/Google Calendar can poll (GET /api/calendar/[token].ics)
-- without an ELF login session, while keeping the raw token itself out
-- of the database entirely (only its SHA-256 hash is stored) — same
-- "long random secret in the URL, hash at rest" shape as this repo's
-- existing coach_invite_tokens (src/lib/coachInvite.ts), just with no
-- expiry (a calendar subscription is meant to be long-lived until a
-- human revokes/rotates it) and no rotated_at column (rotation is
-- modeled as "revoke the old row, insert a new one," not an in-place
-- update — see calendarSubscription.ts).
CREATE TABLE IF NOT EXISTS calendar_subscription_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_slug text NOT NULL,
  token_hash    text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz
);

-- A token_hash must uniquely identify at most one row — the public feed
-- route looks up solely by hash (never by campaign_slug), so this index
-- both enforces that invariant and makes the lookup an index scan.
CREATE UNIQUE INDEX IF NOT EXISTS calendar_subscription_tokens_hash_idx
  ON calendar_subscription_tokens (token_hash);

-- At most one ACTIVE (non-revoked) token per campaign at a time. Rotation
-- revokes the current row (setting revoked_at) before inserting the new
-- one, so this partial index never blocks a rotation — it only prevents
-- two simultaneously-active tokens for the same campaign. Mirrors the
-- existing partial-unique-index dedup pattern from
-- phase_a14a_automation_events.sql.
CREATE UNIQUE INDEX IF NOT EXISTS calendar_subscription_tokens_active_slug_idx
  ON calendar_subscription_tokens (campaign_slug) WHERE revoked_at IS NULL;
