-- Phase A24: Sponsor Industry
--
-- Adds a nullable `industry` column to `sponsors` (the campaign-specific
-- table that actually renders on the public campaign page — distinct from
-- the separate sponsor_businesses CRM table, which already has its own
-- `industry` column and is untouched by this migration). Purely additive:
-- existing rows get industry = NULL, existing UI continues to work
-- unmodified since it never selects/renders this column.

ALTER TABLE sponsors ADD COLUMN IF NOT EXISTS industry text;
