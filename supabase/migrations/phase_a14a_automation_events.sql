-- Phase A14A: Automation Rules Engine
--
-- Rule evaluation writes/resolves rows here. This phase only records events —
-- no emails, push, or SMS are sent from this table yet.

CREATE TABLE IF NOT EXISTS automation_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key       text NOT NULL,
  severity       text NOT NULL CHECK (severity IN ('info','warning','critical')),
  campaign_slug  text,
  coach_id       uuid REFERENCES team_coaches(id) ON DELETE SET NULL,
  crm_contact_id uuid REFERENCES coach_crm_contacts(id) ON DELETE SET NULL,
  title          text NOT NULL,
  description    text,
  status         text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  resolved_at    timestamptz
);

CREATE INDEX IF NOT EXISTS automation_events_status_idx        ON automation_events (status);
CREATE INDEX IF NOT EXISTS automation_events_rule_key_idx      ON automation_events (rule_key);
CREATE INDEX IF NOT EXISTS automation_events_campaign_slug_idx ON automation_events (campaign_slug);
CREATE INDEX IF NOT EXISTS automation_events_coach_id_idx      ON automation_events (coach_id);
CREATE INDEX IF NOT EXISTS automation_events_crm_contact_idx   ON automation_events (crm_contact_id);
CREATE INDEX IF NOT EXISTS automation_events_created_at_idx    ON automation_events (created_at DESC);

-- One open event per rule + target (campaign/coach/contact). Coalesce so
-- rules keyed on different target columns don't collide via shared NULLs.
CREATE UNIQUE INDEX IF NOT EXISTS automation_events_open_dedup_idx
  ON automation_events (
    rule_key,
    COALESCE(campaign_slug, ''),
    COALESCE(coach_id::text, ''),
    COALESCE(crm_contact_id::text, '')
  )
  WHERE status = 'open';
