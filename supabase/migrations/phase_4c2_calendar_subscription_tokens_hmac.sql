-- Phase 4C follow-up: remove the now-unused token_hash architecture.
--
-- calendar_subscription_tokens no longer stores any token material at
-- all. Verification moved to a deterministic HMAC computed from the
-- row's own id + a server-only CALENDAR_SYNC_PEPPER env var, recomputed
-- fresh on every request (public feed AND authenticated member
-- retrieval) — never stored, never persisted, never cached server-side.
-- See src/lib/calendarSubscription.ts.
--
-- Table confirmed empty via read-only REST query immediately before this
-- migration was written (Content-Range: */0) — no live subscription rows
-- exist yet, so this drops zero data.
--
-- Does NOT touch: id, campaign_slug, created_at, revoked_at, or
-- calendar_subscription_tokens_active_slug_idx (the partial unique index
-- enforcing one active token per campaign) — all remain exactly as
-- created by phase_4c_calendar_subscription_tokens.sql.
DROP INDEX IF EXISTS calendar_subscription_tokens_hash_idx;

ALTER TABLE calendar_subscription_tokens
  DROP COLUMN IF EXISTS token_hash;
