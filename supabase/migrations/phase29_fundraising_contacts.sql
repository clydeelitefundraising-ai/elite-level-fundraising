-- Phase 29: Fundraising Contact Collection
--
-- Athletes and parents enter fan/donor contacts for future SMS/email blasts.
-- Coaches track progress, set goals, export CSV.

-- ── Contacts ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fundraising_contacts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_slug       text NOT NULL,
  athlete_id          uuid NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,

  -- Contact methods: at least one required
  phone               text CHECK (phone IS NULL OR length(trim(phone)) <= 30),
  email               text CHECK (email IS NULL OR length(trim(email)) <= 254),

  -- All optional fields
  first_name          text CHECK (first_name IS NULL OR length(first_name) <= 100),
  last_name           text CHECK (last_name IS NULL OR length(last_name) <= 100),
  relationship        text CHECK (relationship IS NULL OR relationship IN
                        ('Family','Friend','Coworker','Neighbor','Coach','Teacher','Business','Other')),
  relationship_other  text CHECK (relationship_other IS NULL OR length(relationship_other) <= 100),
  notes               text CHECK (notes IS NULL OR length(notes) <= 500),

  -- Attribution (set at create time, not changed on edit)
  added_by_type       text NOT NULL CHECK (added_by_type IN ('athlete','parent','coach')),
  added_by_member_id  uuid REFERENCES team_members(id) ON DELETE SET NULL,
  added_by_coach_id   uuid REFERENCES team_coaches(id) ON DELETE SET NULL,

  -- Future blast fields (Phase 30+): stored now, unused until then
  sms_opt_in          boolean,
  email_opt_in        boolean,
  blast_excluded      boolean NOT NULL DEFAULT false,
  consent_ip          text,
  consent_at          timestamptz,
  consent_source      text,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fc_contact_method_required CHECK (phone IS NOT NULL OR email IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS fc_slug_athlete_idx ON fundraising_contacts (campaign_slug, athlete_id);
CREATE INDEX IF NOT EXISTS fc_slug_idx         ON fundraising_contacts (campaign_slug);

-- ── Contact Goals ─────────────────────────────────────────────────────────────
-- One team-default row (athlete_id IS NULL) + optional per-athlete overrides.
-- Resolution order: per-athlete → team default → hard default (10).

CREATE TABLE IF NOT EXISTS fundraising_contact_goals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_slug   text NOT NULL,
  athlete_id      uuid REFERENCES athletes(id) ON DELETE CASCADE,
  goal            integer NOT NULL DEFAULT 10 CHECK (goal > 0),
  set_by_coach_id uuid NOT NULL REFERENCES team_coaches(id) ON DELETE CASCADE,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Partial unique indexes: one team default per campaign, one override per athlete
CREATE UNIQUE INDEX IF NOT EXISTS fcg_team_default_uniq
  ON fundraising_contact_goals (campaign_slug)
  WHERE athlete_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS fcg_athlete_uniq
  ON fundraising_contact_goals (campaign_slug, athlete_id)
  WHERE athlete_id IS NOT NULL;
