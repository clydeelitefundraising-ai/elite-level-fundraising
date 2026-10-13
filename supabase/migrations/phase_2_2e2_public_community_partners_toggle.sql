-- Phase 2.2E-2: Public Campaign Page ELF Community Partners Toggle
--
-- A SEPARATE control from organizations.show_community_partners (Phase
-- 2.2B), which governs ELF Community Partners inside the authenticated
-- Team App (Home Screen grid + Partners tab) only. This new column
-- governs the UNAUTHENTICATED public fundraising campaign page
-- independently — ELF can enable advertising inside the app without
-- exposing it publicly, or vice versa, for any given school.
--
-- Default false: a school's public campaign pages show no ELF
-- advertising until a Platform Admin explicitly turns this on — same
-- "never visible until explicitly activated" convention as every other
-- advertising-visibility flag in this feature set
-- (community_partners.is_active, organizations.show_community_partners).
--
-- Deliberately does NOT affect a team's own permanent presenting
-- sponsor (Phase 2.2E-3, not built yet) — that is explicitly out of
-- scope for this toggle by design, recorded here for future phases:
-- this column must never be read as a gate for a team's own sponsor
-- data, only for ELF-controlled platform advertising.
--
-- Additive only; no existing column is altered or dropped, no existing
-- row's current behavior changes (existing organizations default to
-- false here regardless of their existing show_community_partners
-- value — the two are fully independent). Safe to run against
-- production. NOT YET APPLIED — written for review only, per Phase
-- 2.2E-2 instructions.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS show_community_partners_public boolean NOT NULL DEFAULT false;
