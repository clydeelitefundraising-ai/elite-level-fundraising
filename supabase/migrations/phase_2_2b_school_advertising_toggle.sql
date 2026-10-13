-- Phase 2.2B: School-Wide ELF Community Partners Advertising Toggle
--
-- One boolean per school (organizations row), controlling whether ELF
-- Community Partners advertising is eligible to appear for every team/sport
-- linked to that school via campaign_settings.organization_id (Phase A29).
-- Deliberately NOT a column on campaign_settings — the setting is scoped to
-- the school, not the individual campaign, so one toggle must apply to every
-- team at that school without per-team duplication or drift.
--
-- Default false: a school's advertising is never shown until an ELF
-- Platform Admin explicitly turns it on — matches Phase 2.2A's
-- community_partners.is_active default-false convention (never publicly
-- visible until explicitly activated).
--
-- Additive only; no existing column is altered or dropped, no existing row
-- changes behavior. Safe to run against production. NOT YET APPLIED —
-- written for review only, per Phase 2.2B instructions.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS show_community_partners boolean NOT NULL DEFAULT false;
