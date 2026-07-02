-- Phase A12: Coach CRM
--
-- Tracks sales prospects, active coaches, follow-ups, demos, proposals,
-- signed teams, returning customers, and revenue opportunities.
-- Admin-only, service-role access (same convention as all other admin tables — no RLS policies).

CREATE TABLE IF NOT EXISTS coach_crm_contacts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL,
  email                text,
  phone                text,
  school_name          text,
  sport                text,
  city                 text,
  state                text DEFAULT 'AZ',
  status               text NOT NULL DEFAULT 'prospect' CHECK (status IN
                         ('prospect','contacted','demo_scheduled','proposal_sent','signed','active','returning','lost')),
  source               text,
  estimated_value      numeric,
  expected_close_date  date,
  last_contacted_at    timestamptz,
  next_follow_up_at    timestamptz,
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coach_crm_contacts_status_idx           ON coach_crm_contacts (status);
CREATE INDEX IF NOT EXISTS coach_crm_contacts_next_follow_up_idx   ON coach_crm_contacts (next_follow_up_at);
CREATE INDEX IF NOT EXISTS coach_crm_contacts_school_name_idx      ON coach_crm_contacts (school_name);
CREATE INDEX IF NOT EXISTS coach_crm_contacts_sport_idx            ON coach_crm_contacts (sport);

CREATE TABLE IF NOT EXISTS coach_crm_activities (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id     uuid NOT NULL REFERENCES coach_crm_contacts(id) ON DELETE CASCADE,
  activity_type  text NOT NULL CHECK (activity_type IN
                   ('note','call','email','text','demo','proposal','follow_up','status_change')),
  title          text NOT NULL,
  body           text,
  activity_at    timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coach_crm_activities_contact_id_idx ON coach_crm_activities (contact_id);
