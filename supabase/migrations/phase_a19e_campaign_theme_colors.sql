-- Public Campaign UI Refinements: separate Campaign (page theme) colors
-- from Team (identity) colors.
--
-- campaign_settings.primary_color / secondary_color remain the TEAM colors
-- (school branding — used for identity elements like Program Identity
-- swatches). These four new columns are the CAMPAIGN theme colors that
-- control the fundraising page's look and feel independently.
--
-- All four are nullable with no default. When unset, the public page and
-- campaign-stats API fall back to the team colors — so every existing
-- campaign renders exactly as it did before this migration, with zero
-- manual edits required.

ALTER TABLE campaign_settings
  ADD COLUMN IF NOT EXISTS theme_primary_color   text,
  ADD COLUMN IF NOT EXISTS theme_secondary_color text,
  ADD COLUMN IF NOT EXISTS theme_accent_color    text,
  ADD COLUMN IF NOT EXISTS theme_button_color    text;
