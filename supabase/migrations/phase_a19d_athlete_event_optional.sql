-- Admin Athlete Roster: make Event optional
--
-- athletes.event currently has a NOT NULL constraint (confirmed via direct
-- query — inserts/updates with event=null fail with a 23502 not-null
-- violation). Class (class_year) is now the required primary attribute;
-- Event/Position becomes optional. This only relaxes the constraint —
-- existing event values are untouched.

ALTER TABLE athletes ALTER COLUMN event DROP NOT NULL;
