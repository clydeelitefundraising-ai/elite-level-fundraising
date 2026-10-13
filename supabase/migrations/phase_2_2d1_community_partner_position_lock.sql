-- Phase 2.2D-1: ELF Community Partner Advertising Position Locks
--
-- Any Community Partner may be locked to one of 20 numbered grid
-- positions (#1-20) for the future Home Screen advertising grid
-- (Phase 2.2D-2, not built yet). NULL means "unlocked" — the partner
-- participates in that future phase's fair rotation pool instead.
--
-- Deliberately a single nullable column on community_partners, not a
-- separate placements table — a locked position has no lifecycle of its
-- own yet (no start/end dates, no history) in this phase; see the
-- Phase 2.2D architecture audit for why a dedicated table is left as a
-- future option rather than built now.
--
-- is_active is intentionally NOT part of the uniqueness rule below — an
-- inactive partner keeps blocking its locked position (approved
-- requirement: "do not automatically reassign another partner's
-- reserved position"). Deactivating a partner does not free its slot;
-- only explicitly unlocking it does. A future phase's public grid read
-- is responsible for excluding inactive partners from what's actually
-- rendered (is_active=true, same filter listActiveCommunityPartners()
-- already applies) — this migration only governs who may HOLD a slot.
--
-- Idempotent — safe to re-run against production. Additive only; no
-- existing column, row, or behavior changes. NOT YET APPLIED — written
-- for review only, per Phase 2.2D-1 instructions.

ALTER TABLE community_partners
  ADD COLUMN IF NOT EXISTS locked_position integer NULL;

-- DROP + re-ADD is this codebase's established idempotent-constraint
-- pattern (Postgres has no "ADD CONSTRAINT IF NOT EXISTS") — see
-- phase_a30_platform_admin_writes.sql / phase_a31_message_attachments.sql
-- for the identical convention.
ALTER TABLE community_partners
  DROP CONSTRAINT IF EXISTS community_partners_locked_position_range;
ALTER TABLE community_partners
  ADD CONSTRAINT community_partners_locked_position_range
    CHECK (locked_position IS NULL OR (locked_position BETWEEN 1 AND 20));

-- The actual collision guard. Database-enforced, not just an application
-- check — two concurrent PATCH requests attempting to lock different
-- partners to the same position can never both succeed, regardless of
-- any race in the application layer above this.
CREATE UNIQUE INDEX IF NOT EXISTS community_partners_locked_position_unique_idx
  ON community_partners (locked_position)
  WHERE locked_position IS NOT NULL;
