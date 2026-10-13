-- Phase 2.2A: ELF Community Partners (global advertising partners)
--
-- Platform-wide advertising partners, managed exclusively by ELF Platform
-- Admin via the modern elf_accounts-backed identity (getPlatformAdminSession,
-- src/lib/platformAdminSession.ts) — never the legacy shared-password /admin
-- cookie tool. A partner here supports the ELF platform as a whole, never
-- an individual team's fundraiser.
--
-- Deliberately a NEW, separate table, NOT a reuse of either existing
-- sponsor-shaped system:
--   - `sponsors` (per-team, campaign_slug-scoped, coach/booster/platform-
--     admin managed via /team/[slug]/sponsors) — a different business
--     relationship (a local business sponsoring ONE team), untouched by
--     this migration.
--   - `sponsor_businesses` / `sponsor_activities` / `sponsor_relationships`
--     (the legacy /admin CRM's internal sales-pipeline tracking) — no
--     logo/description/display fields, wrong shape for a public-facing
--     directory, untouched by this migration.
-- Rows in this table must never be created by converting/migrating a
-- `sponsors` row, and vice versa — see the Phase 2.2 architecture audit for
-- the full rationale.
--
-- is_active defaults false: a newly created partner is never publicly
-- visible until an ELF Platform Admin explicitly activates it (Phase 2.2A
-- requirement). is_active is also the deactivate-not-delete flag — mirrors
-- campaign_settings.archived's existing "soft retirement, never hard
-- delete" convention (see phase_f1a_fundraising_toggle.sql). No DELETE
-- endpoint is built against this table for the same reason: deactivating
-- preserves the historical record, a hard delete would not.
--
-- website_url is validated server-side (see src/lib/platform/
-- communityPartners.ts's isValidHttpsUrl) as a well-formed https:// URL
-- before every insert/update — enforced in the API route layer, not by a
-- DB CHECK constraint, matching this codebase's existing convention of
-- keeping business validation in the application layer (see e.g. the
-- sponsors API's VALID_TIERS check) rather than duplicating it in SQL.
--
-- Additive only; no existing table is modified. NOT YET APPLIED — written
-- for review only, per Phase 2.2A instructions.

CREATE TABLE IF NOT EXISTS community_partners (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name      text NOT NULL,
  short_description  text,
  website_url        text,
  logo_url           text,
  is_active          boolean NOT NULL DEFAULT false,
  is_featured        boolean NOT NULL DEFAULT false,
  display_order      integer NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  -- No trigger maintains this — src/lib/platform/communityPartners.ts's
  -- updateCommunityPartner() explicitly sets updated_at = now() on every
  -- PATCH, the same application-layer convention this codebase already
  -- uses everywhere (no table in this schema has an updated_at trigger).
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Serves both the admin list view's default ordering and Phase 2.2C's
-- eventual "active partners in display order" read — same shape, one index.
CREATE INDEX IF NOT EXISTS community_partners_display_order_idx
  ON community_partners (is_active, display_order);
