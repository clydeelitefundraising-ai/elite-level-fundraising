-- Phase A29b: Backfill campaign_settings.organization_id
-- Run AFTER phase_a29_platform_admin.sql.
--
-- Supersedes the earlier single-school draft of this file. A read-only
-- production check (2026-08-24) confirmed 6 distinct non-empty
-- campaign_settings.school_name values:
--   Chino Valley High School, ELF Production QA, Monroe Valley High School,
--   Paradise Valley Community College, QA Test Panthers, Riverside High School
--
-- This migration creates one organizations row per distinct school_name
-- (exact string match only — no fuzzy/similar-name merging), including the
-- two QA/test names, which are kept as their own separate organizations and
-- are neither deleted nor consolidated. It never touches campaign_slug and
-- never deletes a campaign_settings row.
--
-- Idempotent: safe to re-run. Step 1 only inserts an organizations row for a
-- school_name that doesn't already have one (matched by exact school_name,
-- not by slug), so re-running never creates a duplicate. Step 2 only updates
-- campaign_settings rows where organization_id IS NULL, so re-running is a
-- no-op once every row is backfilled.

-- ── Step 1: one organizations row per distinct school_name ─────────────────
-- Explicit VALUES list (not a dynamic slugify) so the exact slug/name
-- mapping is auditable before this ever runs against production.
INSERT INTO organizations (slug, school_name)
SELECT v.slug, v.school_name
FROM (VALUES
  ('chino-valley-high-school',           'Chino Valley High School'),
  ('elf-production-qa',                  'ELF Production QA'),
  ('monroe-valley-high-school',          'Monroe Valley High School'),
  ('paradise-valley-community-college',  'Paradise Valley Community College'),
  ('qa-test-panthers',                   'QA Test Panthers'),
  ('riverside-high-school',              'Riverside High School')
) AS v(slug, school_name)
WHERE NOT EXISTS (
  SELECT 1 FROM organizations o WHERE o.school_name = v.school_name
);

-- ── Step 2: link each campaign to its organization by exact school_name ────
-- Only touches rows not yet linked; never modifies campaign_slug or any
-- other column, never deletes a row.
UPDATE campaign_settings cs
SET organization_id = o.id
FROM organizations o
WHERE cs.organization_id IS NULL
  AND cs.school_name IS NOT NULL
  AND trim(cs.school_name) <> ''
  AND cs.school_name = o.school_name;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION — run all of these after Step 1/2. Every query should return
-- ZERO rows except the two informational SELECTs, which are for eyeballing.
-- ═══════════════════════════════════════════════════════════════════════════

-- (a) Every non-null/non-empty school_name now has organization_id set.
--     Expect: 0 rows.
SELECT campaign_slug, school_name
FROM campaign_settings
WHERE school_name IS NOT NULL
  AND trim(school_name) <> ''
  AND organization_id IS NULL;

-- (b) Each campaign's organization_id resolves back to the SAME school_name
--     text it started with — proves no cross-mapping / no accidental merge.
--     Expect: 0 rows.
SELECT cs.campaign_slug, cs.school_name AS campaign_school_name, o.school_name AS org_school_name
FROM campaign_settings cs
JOIN organizations o ON o.id = cs.organization_id
WHERE cs.school_name IS DISTINCT FROM o.school_name;

-- (c) No duplicate organization rows were created for the same school_name.
--     Expect: 0 rows.
SELECT school_name, count(*) AS org_row_count
FROM organizations
WHERE school_name IS NOT NULL AND trim(school_name) <> ''
GROUP BY school_name
HAVING count(*) > 1;

-- (d) Informational — full before/after-style mapping to eyeball manually,
--     one row per organization with its linked campaigns and slugs.
SELECT o.school_name, o.id AS organization_id,
       array_agg(cs.campaign_slug ORDER BY cs.campaign_slug) AS campaign_slugs,
       count(cs.campaign_slug) AS team_count
FROM organizations o
LEFT JOIN campaign_settings cs ON cs.organization_id = o.id
GROUP BY o.school_name, o.id
ORDER BY o.school_name;

-- (e) campaign_slug integrity and row-count checks — these require a
-- "before" snapshot since this session has no live DB access. Run BOTH
-- snapshot queries yourself, once immediately BEFORE Step 1/2 and once
-- immediately AFTER, and diff the results by eye (or via `EXCEPT`, shown
-- below assuming you save each result as a temp table):
--
--   Before:
--     CREATE TEMP TABLE cs_before AS SELECT campaign_slug, school_name FROM campaign_settings ORDER BY campaign_slug;
--     SELECT count(*) FROM cs_before;                 -- record this row count
--
--   (run Step 1 + Step 2 here)
--
--   After:
--     SELECT count(*) FROM campaign_settings;         -- must equal the row count recorded above
--     SELECT * FROM cs_before
--     EXCEPT
--     SELECT campaign_slug, school_name FROM campaign_settings;
--     -- must return 0 rows: proves no campaign_slug or school_name value changed or disappeared
--
--     DROP TABLE cs_before;
