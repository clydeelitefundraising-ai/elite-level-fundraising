-- Phase A16A: Sponsor CRM & Business Directory
--
-- Internal/admin sponsor relationship tracking — separate from the public
-- `sponsors` table (which powers the campaign sponsor display). This is the
-- business-development side: prospects, renewals, sponsorship history.

CREATE TABLE IF NOT EXISTS sponsor_businesses (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name               text NOT NULL,
  contact_name                text,
  contact_email               text,
  contact_phone               text,
  website                     text,
  industry                    text,
  city                        text,
  state                       text DEFAULT 'AZ',
  address                     text,
  preferred_sports            text[] DEFAULT '{}',
  preferred_sponsorship_level text,
  estimated_annual_budget     numeric,
  lifetime_value              numeric DEFAULT 0,
  last_sponsored_at           timestamptz,
  next_renewal_at             timestamptz,
  status                      text NOT NULL DEFAULT 'prospect' CHECK (status IN
                                ('prospect','contacted','active','recurring','paused','lost')),
  source                      text,
  notes                       text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sponsor_businesses_status_idx       ON sponsor_businesses (status);
CREATE INDEX IF NOT EXISTS sponsor_businesses_city_idx         ON sponsor_businesses (city);
CREATE INDEX IF NOT EXISTS sponsor_businesses_industry_idx     ON sponsor_businesses (industry);
CREATE INDEX IF NOT EXISTS sponsor_businesses_next_renewal_idx ON sponsor_businesses (next_renewal_at);

CREATE TABLE IF NOT EXISTS sponsor_activities (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid NOT NULL REFERENCES sponsor_businesses(id) ON DELETE CASCADE,
  activity_type text NOT NULL CHECK (activity_type IN
                  ('note','call','email','meeting','sponsorship','renewal','status_change')),
  title         text NOT NULL,
  body          text,
  activity_at   timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sponsor_activities_business_id_idx ON sponsor_activities (business_id);

CREATE TABLE IF NOT EXISTS sponsor_relationships (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id         uuid NOT NULL REFERENCES sponsor_businesses(id) ON DELETE CASCADE,
  campaign_slug       text,
  sponsorship_amount  numeric,
  sponsorship_level   text,
  sponsored_at        timestamptz NOT NULL DEFAULT now(),
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sponsor_relationships_business_id_idx   ON sponsor_relationships (business_id);
CREATE INDEX IF NOT EXISTS sponsor_relationships_campaign_slug_idx ON sponsor_relationships (campaign_slug);
