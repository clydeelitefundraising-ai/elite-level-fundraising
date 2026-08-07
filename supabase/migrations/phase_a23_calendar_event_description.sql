-- Phase A23: Calendar Event Description
--
-- Adds a nullable `description` column to `calendar_events`. Purely additive:
-- existing columns (title, event_date, event_time, location, type, coach_id)
-- are untouched, existing rows get description = NULL, and the existing UI
-- continues to work unmodified since it never selects/renders this column.
-- Backward compatible in both directions — no backfill needed/attempted.

ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS description text;
