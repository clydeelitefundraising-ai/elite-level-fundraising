-- Phase T6: Team -> Overview page (banner, location, About Our Team).
--
-- Purely additive: four nullable columns on campaign_settings, no defaults,
-- no backfill, no constraint on existing data. Every existing team is
-- unaffected — the Overview page treats NULL as "not set yet" (default
-- banner background, location from the existing `location` column or the
-- school's organizations address, About empty state).
--
-- Reused, NOT duplicated:
--   - school_name / sport_name / season / logo_url (banner text + logo)
--   - location ("City, ST" — still the team's city/state; the Overview
--     location editor writes it too)
--   - organizations.address/city/state/zip (read-only fallback)
--
-- Writes go only through the Head-Coach-only /api/team/[slug]/overview
-- routes (service role), which refuse completed seasons
-- (seasonWriteBlocked); the phase_s2 completed-season guard on
-- campaign_settings covers these columns like every other column on the row.
--
-- Banner images live in the existing public `team-branding-logos` bucket
-- under `<campaign_slug>/banner/` — no new bucket or storage policy.

ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS team_banner_url text;
ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS team_about      text;
ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS location_street text;
ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS location_zip    text;

-- Length caps mirror src/lib/teamOverview.ts (the API validates first;
-- these are the backstop). NOT VALID: existing rows are all NULL anyway,
-- and this keeps the ALTER from scanning the table.
ALTER TABLE campaign_settings DROP CONSTRAINT IF EXISTS campaign_settings_team_about_len;
ALTER TABLE campaign_settings ADD  CONSTRAINT campaign_settings_team_about_len
  CHECK (team_about IS NULL OR char_length(team_about) <= 3000) NOT VALID;
ALTER TABLE campaign_settings DROP CONSTRAINT IF EXISTS campaign_settings_location_street_len;
ALTER TABLE campaign_settings ADD  CONSTRAINT campaign_settings_location_street_len
  CHECK (location_street IS NULL OR char_length(location_street) <= 120) NOT VALID;
ALTER TABLE campaign_settings DROP CONSTRAINT IF EXISTS campaign_settings_location_zip_len;
ALTER TABLE campaign_settings ADD  CONSTRAINT campaign_settings_location_zip_len
  CHECK (location_zip IS NULL OR char_length(location_zip) <= 10) NOT VALID;
