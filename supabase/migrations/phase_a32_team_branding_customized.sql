-- Team App Phase 3: explicit branding-customization flag.
--
-- Live QA (Phase 2 checkpoint) found that campaign_settings.primary_color
-- cannot be trusted to indicate "this coach intentionally customized their
-- branding" — real rows already contain historical placeholder/backfill
-- values (e.g. a generic onboarding blue, and even the app's own old
-- hardcoded navy stored as if it were a chosen color). Sentinel-value
-- detection is therefore unreliable and would only grow a maintenance
-- burden as more accidental defaults are discovered.
--
-- This column is the explicit, unambiguous signal instead:
--   branding_customized = false -> Team App renders the ELF default theme
--                                  (orange/yellow), regardless of whatever
--                                  is stored in primary_color/secondary_color.
--   branding_customized = true  -> Team App uses this team's stored
--                                  primary_color/secondary_color as accents.
--
-- Purely additive. NOT NULL DEFAULT FALSE means every existing row gets
-- `false` automatically with no backfill/guessing script required — this is
-- also the functionally correct value for every existing team today, since
-- no coach-facing branding editor exists yet to have ever set it true.
--
-- Independent of campaign_settings.theme_primary_color / theme_secondary_color
-- / theme_accent_color / theme_button_color (added in
-- phase_a19e_campaign_theme_colors.sql) — those remain the PUBLIC campaign
-- donation page's separate theme system and are untouched by this migration.

ALTER TABLE campaign_settings
  ADD COLUMN IF NOT EXISTS branding_customized boolean NOT NULL DEFAULT false;
