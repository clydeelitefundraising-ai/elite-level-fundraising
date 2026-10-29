-- Phase T7: team-level permission for public athlete photos.
--
-- The personalized athlete fundraising page (/campaign/<slug>?athlete=<id>)
-- may show the athlete's ELF Team App profile photo ONLY when the team's
-- Head Coach has turned this on (after confirming media permissions), and
-- never for an athlete the Head Coach has hidden. Purely additive:
--   - campaign_settings.public_athlete_photos       OFF for every existing
--     and future team (NOT NULL DEFAULT false — a fast default, no rewrite)
--   - campaign_settings.public_athlete_photos_changed_at / _changed_by
--     who last turned it on/off and when (full history: audit_logs,
--     actions team_settings.public_athlete_photos_*)
--   - athletes.public_photo_excluded               per-athlete "hide my
--     photo" even while the team setting is on (default false)
--
-- Writes go only through the Head-Coach-only (platform admins included)
-- /api/team/[slug]/settings/public-athlete-photos routes, which refuse
-- completed seasons; the phase_s2 completed-season triggers on
-- campaign_settings and athletes cover these columns like every other.
-- The public photo route (/api/campaign-photo/...) fails closed: until this
-- migration runs, or whenever a value is not exactly true, no photo is shown.

ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS public_athlete_photos            boolean NOT NULL DEFAULT false;
ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS public_athlete_photos_changed_at timestamptz;
ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS public_athlete_photos_changed_by text;

ALTER TABLE athletes ADD COLUMN IF NOT EXISTS public_photo_excluded boolean NOT NULL DEFAULT false;

ALTER TABLE campaign_settings DROP CONSTRAINT IF EXISTS campaign_settings_public_athlete_photos_changed_by_len;
ALTER TABLE campaign_settings ADD  CONSTRAINT campaign_settings_public_athlete_photos_changed_by_len
  CHECK (public_athlete_photos_changed_by IS NULL OR char_length(public_athlete_photos_changed_by) <= 200) NOT VALID;
