-- Stage F1 — read-only "before" baseline for the Complete Season test run.
-- One SELECT; changes nothing (query_to_xml only runs SELECTs). Shows
-- counts, flags and 12-character md5 fingerprints of whole row sets only —
-- no names, emails, codes, passwords, password hashes, salts or tokens.
--
-- Run it again unchanged after Stage F3 and compare:
--   team     one row per team: season state, flags, rows across every table
--            with a campaign_slug, a hash of the team's settings row and a
--            hash of all its rows. For the 44 other teams the season fields
--            must be identical; a hash may change only through that team's
--            normal day-to-day use between the two runs.
--   test     the test team's row count per table (and its parent links).
--   table    row count of every public table.
--   global   teams, completed seasons, transitions, accounts.
WITH
tbls AS (
  SELECT c.relname
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'campaign_slug' AND NOT a.attisdropped)
),
per AS (
  SELECT t.relname, x.slug, x.n, x.h
  FROM tbls t,
  LATERAL xmltable('/table/row' PASSING query_to_xml(format(
      'SELECT campaign_slug AS slug, count(*) AS n, md5(string_agg(x::text, %L ORDER BY x::text)) AS h FROM public.%I x GROUP BY 1',
      '|', t.relname), false, false, '')
    COLUMNS slug text, n bigint, h text) x
),
all_tables AS (
  SELECT c.relname,
         (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM public.%I', c.relname), false, true, '')))[1]::text AS n
  FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
  WHERE ns.nspname = 'public' AND c.relkind = 'r'
),
rows AS (
  SELECT 1 AS sec, 'team' AS section, cs.campaign_slug AS k,
         'demo=' || coalesce(cs.is_demo::text, 'null')
         || ' season=' || coalesce(cs.season, '(none)')
         || ' completed=' || (cs.season_completed_at IS NOT NULL)::text
         || ' archived=' || coalesce(cs.archived, false)::text
         || ' fundraising=' || coalesce(cs.fundraising_enabled::text, 'null')
         || ' rows=' || coalesce((SELECT sum(p.n) FROM per p WHERE p.slug = cs.campaign_slug), 0)
         || ' settings_md5=' || left(md5(cs::text), 12)
         || ' data_md5=' || left(coalesce((SELECT md5(string_agg(p.relname || ':' || p.h, ',' ORDER BY p.relname)) FROM per p WHERE p.slug = cs.campaign_slug), '-'), 12) AS v
  FROM public.campaign_settings cs
  UNION ALL
  SELECT 2, 'test', p.relname, p.n::text
  FROM per p WHERE p.slug = 'elf-season-test-2026'
  UNION ALL
  SELECT 2, 'test', 'team_member_athletes (via members)',
         (SELECT count(*) FROM public.team_member_athletes t JOIN public.team_members m ON m.id = t.team_member_id
           WHERE m.campaign_slug = 'elf-season-test-2026')::text
  UNION ALL
  SELECT 3, 'table', relname, n FROM all_tables
  UNION ALL
  SELECT 4, 'global', 'teams / completed / transitions / elf_accounts',
         (SELECT count(*) FROM public.campaign_settings)::text || ' / '
         || (SELECT count(*) FROM public.campaign_settings WHERE season_completed_at IS NOT NULL)::text || ' / '
         || (SELECT count(*) FROM public.team_season_transitions)::text || ' / '
         || (SELECT count(*) FROM public.elf_accounts)::text
  UNION ALL
  SELECT 4, 'global', 'taken at (UTC)', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
)
SELECT section, k AS item, v AS value FROM rows ORDER BY sec, k;
