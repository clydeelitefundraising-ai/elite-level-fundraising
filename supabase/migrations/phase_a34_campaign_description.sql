-- Phase A34: Campaign story/description field for the public fundraising
-- page's "Why We're Raising Funds" section.
--
-- Previously that section was a hardcoded template string
-- ("Support the {school} {sport} program...") with no admin-editable
-- content behind it at all. Nullable and purely additive — every existing
-- campaign is unaffected and the public page falls back to the same
-- dynamic template sentence when this is null, so the redesigned page
-- works correctly before any admin ever fills this in.
ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS description text;
