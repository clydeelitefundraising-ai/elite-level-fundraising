-- Phase 24.4: guarantee push_subscriptions.endpoint uniqueness
--
-- Root cause (confirmed in code): api/team/[slug]/push/subscribe/route.ts
-- POSTs with `Prefer: resolution=merge-duplicates` but no `on_conflict=`
-- query param. PostgREST's documented behavior is that an upsert with no
-- explicit on_conflict target falls back to the table's primary key
-- (`id`) — which is server-generated fresh on every insert, so this has
-- never actually been able to match an existing row. Every "resubscribe"
-- of the same browser endpoint has been a plain insert, not an update.
--
-- push_subscriptions predates this project's tracked-migration convention
-- (same as elf_accounts/team_members/announcements/etc. — confirmed no
-- CREATE TABLE for it exists in supabase/migrations/), so whether
-- `endpoint` already carries a live UNIQUE constraint cannot be confirmed
-- from the repo alone. This migration is written to be safe either way:
-- CREATE UNIQUE INDEX IF NOT EXISTS is a no-op if an equivalent unique
-- index already exists, and only creates one if it doesn't.
--
-- Safety: if any duplicate endpoint rows already exist in production from
-- the bug above, this statement will FAIL (a unique index cannot be
-- created over pre-existing duplicates). The verification query below
-- must be run first — if it returns any rows, those duplicates need to be
-- resolved (keep the most-recently-updated row per endpoint, delete the
-- rest) before this index can be created. Do not delete rows as part of
-- this migration file — that decision belongs to whoever applies it,
-- with the actual duplicate rows in front of them.

-- Run this FIRST. If it returns zero rows, the CREATE UNIQUE INDEX below
-- is safe to run as-is.
--
-- SELECT endpoint, count(*)
-- FROM push_subscriptions
-- GROUP BY endpoint
-- HAVING count(*) > 1;

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_key
  ON push_subscriptions (endpoint);
