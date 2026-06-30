-- Phase A8: Organization Center
-- Run this in Supabase SQL Editor before deploying Phase A8.
-- Requires Phase A7 migration (audit_logs) to have been run first.

-- ── organizations ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id                              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at                      timestamptz DEFAULT now() NOT NULL,
  updated_at                      timestamptz DEFAULT now() NOT NULL,

  -- Identity
  slug                            text        NOT NULL DEFAULT 'default' UNIQUE,
  school_name                     text        NOT NULL DEFAULT '',
  nickname                        text        NOT NULL DEFAULT '',

  -- Branding
  logo_url                        text        NOT NULL DEFAULT '',
  primary_color                   text        NOT NULL DEFAULT '#1B4FA8',
  secondary_color                 text        NOT NULL DEFAULT '#C4A35A',
  default_team_photo_url          text        NOT NULL DEFAULT '',
  default_layout                  text        NOT NULL DEFAULT 'classic',

  -- Location & contact
  address                         text        NOT NULL DEFAULT '',
  city                            text        NOT NULL DEFAULT '',
  state                           text        NOT NULL DEFAULT '',
  zip                             text        NOT NULL DEFAULT '',
  website                         text        NOT NULL DEFAULT '',
  short_description               text        NOT NULL DEFAULT '',

  -- Athletic director
  athletic_director               text        NOT NULL DEFAULT '',
  athletic_director_email         text        NOT NULL DEFAULT '',
  athletic_director_phone         text        NOT NULL DEFAULT '',

  -- Feature toggle defaults (used to pre-populate Campaign Creation Wizard)
  default_show_leaderboard        boolean     NOT NULL DEFAULT true,
  default_show_program_identity   boolean     NOT NULL DEFAULT true,
  default_show_share_section      boolean     NOT NULL DEFAULT true,
  default_show_fund_uses          boolean     NOT NULL DEFAULT true,
  default_show_recent_donations   boolean     NOT NULL DEFAULT true,
  default_show_sponsors           boolean     NOT NULL DEFAULT true,
  default_show_donation_card      boolean     NOT NULL DEFAULT true,

  -- Campaign defaults
  default_fundraising_goal_cents  integer     NOT NULL DEFAULT 0,
  default_athlete_goal_cents      integer     NOT NULL DEFAULT 0,
  default_contact_goal            integer     NOT NULL DEFAULT 10,
  default_campaign_length_days    integer     NOT NULL DEFAULT 30
);

-- ── communication_templates ───────────────────────────────────────────────────
-- Editable templates for future email delivery integration.
-- type values: coach_welcome | parent_welcome | athlete_welcome |
--              donation_thank_you | registration_confirmation
CREATE TABLE IF NOT EXISTS communication_templates (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at       timestamptz DEFAULT now() NOT NULL,
  updated_at       timestamptz DEFAULT now() NOT NULL,
  type             text        NOT NULL,
  subject          text        NOT NULL DEFAULT '',
  body_text        text        NOT NULL DEFAULT '',
  UNIQUE (organization_id, type)
);

-- ── sponsor_packages ──────────────────────────────────────────────────────────
-- Reusable sponsor package templates that will populate new campaign sponsor tiers.
CREATE TABLE IF NOT EXISTS sponsor_packages (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at       timestamptz DEFAULT now() NOT NULL,
  name             text        NOT NULL DEFAULT '',
  tier             text        NOT NULL DEFAULT 'gold',
  description      text        NOT NULL DEFAULT '',
  amount_cents     integer     NOT NULL DEFAULT 0,
  sort_order       integer     NOT NULL DEFAULT 0
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS comm_templates_org_idx   ON communication_templates (organization_id);
CREATE INDEX IF NOT EXISTS sponsor_packages_org_idx ON sponsor_packages (organization_id, sort_order);

-- ── Seed the default organization ────────────────────────────────────────────
-- Creates the single org row. Re-running is safe (ON CONFLICT DO NOTHING).
INSERT INTO organizations (slug, school_name)
VALUES ('default', '')
ON CONFLICT (slug) DO NOTHING;

-- ── Future expansion notes ────────────────────────────────────────────────────
-- To add multi-sport support, add:
--   CREATE TABLE sports (id uuid PK, organization_id uuid FK → organizations, name text, ...);
--   ALTER TABLE campaign_settings ADD COLUMN organization_id uuid REFERENCES organizations(id);
--   ALTER TABLE campaign_settings ADD COLUMN sport_id uuid REFERENCES sports(id);
-- Existing campaigns get organization_id = NULL until backfilled, staying fully functional.
