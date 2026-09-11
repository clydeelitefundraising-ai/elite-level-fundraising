-- Phase A35: Coach Fundraising Participation.
--
-- Lets a Head Coach / Platform Admin optionally allow COACHES to
-- participate in a campaign's fundraiser alongside athletes — own
-- leaderboard entry, own share link, own donation attribution, own
-- fundraising contacts/outreach, own personal goal.
--
-- Deliberately NOT a generalized "fundraising_participants" table.
-- donations.athlete_id already has no FK and is loosely coupled; the only
-- real friction was the two NOT NULL athlete_id tables below. This mirrors
-- the polymorphic sibling-column pattern already proven by
-- post_likes/announcement_comments (author_type + author_coach_id/
-- author_member_id) — adding a nullable coach_id next to the existing
-- athlete_id everywhere a donation/contact/outreach-subject needs to be
-- "owned by an athlete OR a coach", plus one small new participation
-- table. Zero backfill: every existing row already has a non-null
-- athlete_id and a null coach_id, satisfying every new CHECK below
-- trivially. Existing athlete campaigns are completely unaffected.
--
-- Additive only; safe for existing teams.

-- ── 1. Campaign-level feature gate ──────────────────────────────────────
-- Coach participation must NEVER be inferred solely from the existence of
-- campaign_coach_fundraisers rows — every read/write path must also check
-- this flag. Defaults false so no existing or newly-created campaign
-- exposes coach fundraising unless a Head Coach/Admin explicitly opts in.
ALTER TABLE campaign_settings
  ADD COLUMN IF NOT EXISTS allow_coach_fundraising boolean NOT NULL DEFAULT false;

-- ── 2. Coach participation / selection ──────────────────────────────────
-- Row existence = "selected by Head Coach/Admin". active=false = deselected
-- /deactivated WITHOUT deleting the row or losing donation/contact/outreach
-- history — the coach simply stops accepting new attributed donations and
-- disappears from the live public leaderboard/donation selector.
-- goal_cents is the coach's personal fundraising goal (nullable — no goal
-- set yet), mirroring athletes.goal_cents.
CREATE TABLE IF NOT EXISTS campaign_coach_fundraisers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_slug  text NOT NULL,
  coach_id       uuid NOT NULL REFERENCES team_coaches(id) ON DELETE CASCADE,
  active         boolean NOT NULL DEFAULT true,
  goal_cents     integer,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS campaign_coach_fundraisers_unique
  ON campaign_coach_fundraisers (campaign_slug, coach_id);

CREATE INDEX IF NOT EXISTS campaign_coach_fundraisers_slug_idx
  ON campaign_coach_fundraisers (campaign_slug);

-- ── 3. Donation attribution ─────────────────────────────────────────────
-- FK here (unlike the existing unconstrained athlete_id) is safe: coach
-- rows are never hard-deleted per the "don't orphan financial records"
-- requirement, and ON DELETE SET NULL preserves the donation row even in
-- that edge case. The CHECK guarantees a donation is never double-
-- attributed to both an athlete and a coach.
ALTER TABLE donations
  ADD COLUMN IF NOT EXISTS coach_id uuid REFERENCES team_coaches(id) ON DELETE SET NULL;

ALTER TABLE donations
  DROP CONSTRAINT IF EXISTS donations_athlete_or_coach_check;
ALTER TABLE donations
  ADD CONSTRAINT donations_athlete_or_coach_check
  CHECK (athlete_id IS NULL OR coach_id IS NULL);

CREATE INDEX IF NOT EXISTS donations_coach_id_idx
  ON donations (coach_id) WHERE coach_id IS NOT NULL;

-- ── 4. Fundraising contacts — coach ownership ───────────────────────────
-- athlete_id relaxed to nullable so a contact can instead belong to a
-- coach. Exactly one of athlete_id/coach_id must be set — same shape as
-- the polymorphic author CHECK already used by post_likes.
ALTER TABLE fundraising_contacts
  ALTER COLUMN athlete_id DROP NOT NULL;

ALTER TABLE fundraising_contacts
  ADD COLUMN IF NOT EXISTS coach_id uuid REFERENCES team_coaches(id) ON DELETE CASCADE;

ALTER TABLE fundraising_contacts
  DROP CONSTRAINT IF EXISTS fundraising_contacts_owner_check;
ALTER TABLE fundraising_contacts
  ADD CONSTRAINT fundraising_contacts_owner_check
  CHECK (
    (athlete_id IS NOT NULL AND coach_id IS NULL) OR
    (athlete_id IS NULL AND coach_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS fundraising_contacts_coach_id_idx
  ON fundraising_contacts (coach_id) WHERE coach_id IS NOT NULL;

-- ── 5. Outreach — subject vs. actor ─────────────────────────────────────
-- athlete_outreach.coach_id ALREADY EXISTS and means "which coach
-- performed this outreach action" (the actor) — that column is untouched.
-- subject_coach_id is a new, distinct column meaning "which coach this
-- outreach is ABOUT" (the fundraising subject), exactly parallel to
-- athlete_id's existing meaning. Never conflate the two.
ALTER TABLE athlete_outreach
  ALTER COLUMN athlete_id DROP NOT NULL;

ALTER TABLE athlete_outreach
  ADD COLUMN IF NOT EXISTS subject_coach_id uuid REFERENCES team_coaches(id) ON DELETE CASCADE;

ALTER TABLE athlete_outreach
  DROP CONSTRAINT IF EXISTS athlete_outreach_subject_check;
ALTER TABLE athlete_outreach
  ADD CONSTRAINT athlete_outreach_subject_check
  CHECK (
    (athlete_id IS NOT NULL AND subject_coach_id IS NULL) OR
    (athlete_id IS NULL AND subject_coach_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS athlete_outreach_subject_coach_id_idx
  ON athlete_outreach (subject_coach_id) WHERE subject_coach_id IS NOT NULL;

-- ── 6. Per-coach fundraising-contact goals (optional, same precedent as
--       fundraising_contact_goals.athlete_id already being nullable for
--       "team default") ──────────────────────────────────────────────────
ALTER TABLE fundraising_contact_goals
  ADD COLUMN IF NOT EXISTS coach_id uuid REFERENCES team_coaches(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS fundraising_contact_goals_coach_id_idx
  ON fundraising_contact_goals (coach_id) WHERE coach_id IS NOT NULL;
