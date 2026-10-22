-- ELF QA: complete the Hawks 2027 season (a season transition), so QA has a
-- completed, read-only season to test: historical messages, refused edits,
-- the new 2028 season, and account deletion reaching a completed season.
-- Run ONLY through scripts/qa/apply-seed.sh with the explicit transition
-- confirmation (ELF_QA_ALLOW_TRANSITION=hawks-track-2027). Runs as the
-- table owner — team_season_complete() is not callable by any API role.
\set ON_ERROR_STOP on
CREATE FUNCTION pg_temp.u(p text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT md5('elf-qa-seed:' || p)::uuid $$;
SELECT public.team_season_complete(
  'hawks-track-2027',
  jsonb_build_object('coach_id', pg_temp.u('c_hawks_head')),
  NULL, NULL,
  public.team_season_fingerprint('hawks-track-2027'),
  pg_temp.u('qa-hawks-transition'),
  'COMPLETE 2027 SEASON') ->> 'to_slug' AS hawks_successor \gset
\echo completed hawks-track-2027 -> :hawks_successor
