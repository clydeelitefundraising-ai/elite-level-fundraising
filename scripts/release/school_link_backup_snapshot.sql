-- School Linking (phase_o3) - PRE-RELEASE SNAPSHOT. READ-ONLY.
--
-- Two small exports to keep with the release record, taken right after the
-- pre-check and before phase_o3. Run each part on its own: Supabase -> SQL
-- Editor -> New query -> paste ONE part -> Run -> Export -> "Download CSV".
-- Contains school ids and team slugs only - no personal data.

-- Part A: which school each team-season is linked to now.
-- Save as school-links-before-phase-o3.csv
SELECT campaign_slug, organization_id
FROM public.campaign_settings
ORDER BY campaign_slug;

-- Part B: the exact completed-season guard phase_o3 replaces.
-- Save as season-write-guard-before-phase-o3.csv
-- (phase_o3_school_link_apply_down.sql restores this same definition.)
SELECT md5(prosrc) AS guard_md5, pg_get_functiondef(oid) AS guard_definition
FROM pg_proc
WHERE oid = 'public.season_write_guard()'::regprocedure;
