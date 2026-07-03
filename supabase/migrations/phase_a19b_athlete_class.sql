-- Team App UX Cleanup: Athlete Class
--
-- Adds a separate `class_year` column (Freshman/Sophomore/Junior/Senior) as
-- the new primary displayed attribute for athletes. This is purely additive:
-- the existing `event` column (sport event/position, e.g. "Sprints") is
-- untouched and keeps all existing data — it simply becomes a secondary
-- field in the UI. No backfill is attempted since class level can't be
-- reliably derived from existing columns (grad_year alone doesn't determine
-- current class without knowing the current school year).

ALTER TABLE athletes ADD COLUMN IF NOT EXISTS class_year text;
