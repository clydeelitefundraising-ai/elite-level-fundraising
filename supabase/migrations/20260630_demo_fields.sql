-- Phase A9: Demo Center — tag demo campaigns and track template used
ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS is_demo        boolean NOT NULL DEFAULT false;
ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS demo_template  text;

CREATE INDEX IF NOT EXISTS campaign_settings_is_demo_idx
  ON campaign_settings (is_demo)
  WHERE is_demo = true;
