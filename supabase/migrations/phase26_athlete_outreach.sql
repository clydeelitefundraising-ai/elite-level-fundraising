-- Phase 26: Athlete outreach log (append-only)
-- Every coach action inserts a new row. Current status = latest row per athlete.
-- The view surfaces the current state without application-layer deduplication.

CREATE TABLE IF NOT EXISTS athlete_outreach (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id    uuid        NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  campaign_slug text        NOT NULL,
  status        text        NOT NULL
                            CHECK (status IN ('contacted', 'needs_follow_up', 'resolved')),
  note          text,
  contacted_by  text,
  coach_id      uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Lookup index: campaign → athlete → most recent first
CREATE INDEX IF NOT EXISTS athlete_outreach_lookup_idx
  ON athlete_outreach (campaign_slug, athlete_id, created_at DESC);

-- Current-status view: latest row per (athlete_id, campaign_slug)
CREATE OR REPLACE VIEW athlete_outreach_current AS
SELECT DISTINCT ON (athlete_id, campaign_slug)
  id, athlete_id, campaign_slug, status, note, contacted_by, coach_id, created_at
FROM athlete_outreach
ORDER BY athlete_id, campaign_slug, created_at DESC;
