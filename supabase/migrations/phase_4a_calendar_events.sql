-- Phase 4A: baseline declaration for the pre-existing calendar_events
-- table (no migration in history currently creates it — confirmed via
-- exhaustive grep across every tracked migration file, it predates the
-- migration history) + additive start_time/end_time columns.
--
-- CREATE TABLE IF NOT EXISTS is a no-op on the current production
-- database (the table already exists there, with 40 live rows across 5
-- campaigns) and creates the table on a fresh database that has never
-- seen calendar_events before. Column types/defaults below are a
-- best-effort reconstruction from live data (verified via a read-only
-- `select=*` dump of every row) and application code. Since IF NOT
-- EXISTS makes this a no-op on production, any imprecision here has zero
-- effect on production — it only affects what a brand-new dev/fresh
-- database would look like.
--
-- description and coach_id already exist live and are included here for
-- baseline accuracy; description already contains real, meaningful data
-- for 32 of 40 rows (populated by whatever out-of-band process created
-- the Monroe Valley demo calendar) and is being surfaced by the
-- application for the first time in this phase — this migration does
-- NOT add, recreate, or touch that column's data in any way.
CREATE TABLE IF NOT EXISTS calendar_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_slug text NOT NULL,
  title         text NOT NULL,
  event_date    date NOT NULL,
  event_time    text NOT NULL DEFAULT '',
  location      text NOT NULL DEFAULT '',
  type          text NOT NULL DEFAULT 'team',
  coach_id      uuid,
  description   text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Additive only. On production: these columns do not exist yet, so this
-- adds them as nullable, touching zero existing rows/values (all 40
-- current rows get NULL for both, which the app treats as "no
-- structured time set, fall back to the legacy event_time text" — see
-- displayEventTime() in src/lib/calendarShared.ts). On a fresh database:
-- the table was just created above without these columns, so this adds
-- them identically. Either way, event_date and event_time are never
-- renamed, retyped, or otherwise touched.
ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS start_time time,
  ADD COLUMN IF NOT EXISTS end_time   time;
