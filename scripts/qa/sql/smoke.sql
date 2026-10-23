-- ELF QA smoke test — READ-ONLY: everything runs in a transaction that is
-- always rolled back. Run through scripts/qa/smoke.sh (marker check first).
-- Raises on the first failure; prints one PASS line per check.
\set ON_ERROR_STOP on
SET client_min_messages = notice;
BEGIN;
CREATE FUNCTION pg_temp.u(p text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT md5('elf-qa-seed:' || p)::uuid $$;
CREATE FUNCTION pg_temp.ok(p_name text, p_ok boolean, p_detail text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(p_ok, false) THEN RAISE NOTICE 'PASS  %', p_name;
  ELSE RAISE EXCEPTION 'FAIL  % %', p_name, coalesce(p_detail, ''); END IF;
END $$;
-- Run p_sql as p_role and return {ok, value|error}.
CREATE FUNCTION pg_temp.as_role(p_role text, p_sql text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  BEGIN
    EXECUTE format('SET LOCAL ROLE %I', p_role);
    EXECUTE p_sql INTO r;
    RESET ROLE;
    RETURN jsonb_build_object('ok', true, 'value', r);
  EXCEPTION WHEN others THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
  END;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.u(text) TO service_role;

SELECT pg_temp.ok('marker: this database is the expected QA project (never production)',
  (SELECT project_ref <> 'nggabucgcoaffpppchsp' FROM elf_qa.marker));
SELECT pg_temp.ok('install: baseline, 27 migrations, Complete Season 1-4 and buckets all recorded',
  (SELECT count(*) FROM elf_qa.applied WHERE step <> 'seed' AND step NOT LIKE 'season_transition%') = 33);
SELECT pg_temp.ok('install: Complete Season schema present (lineage, audit log, guards, preview and completion grants)',
  to_regclass('public.team_season_transitions') IS NOT NULL
  AND (SELECT count(*) FROM pg_trigger WHERE tgname = 'season_write_guard') = 34
  AND has_function_privilege('service_role', 'public.team_season_preview(text,jsonb,text,text)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.team_season_complete(text,jsonb,text,text,text,uuid,text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.team_season_complete(text,jsonb,text,text,text,uuid,text)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.team_season_complete(text,jsonb,text,text,text,uuid,text)', 'EXECUTE'));
SELECT pg_temp.ok('storage: 9 buckets; message-attachments and team-files private, the rest public',
  (SELECT count(*) FROM storage.buckets WHERE id IN ('message-attachments', 'team-files', 'athlete-photos', 'community-partner-logos',
     'profile-photos', 'shop-images', 'sponsor-logos', 'team-branding-logos', 'team-logos')) = 9
  AND NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id IN ('message-attachments', 'team-files') AND public)
  AND NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id IN ('athlete-photos', 'community-partner-logos', 'profile-photos',
     'shop-images', 'sponsor-logos', 'team-branding-logos', 'team-logos') AND NOT public));
SELECT pg_temp.ok('seed: only synthetic @example.test accounts',
  NOT EXISTS (SELECT 1 FROM public.elf_accounts WHERE email NOT LIKE '%@example.test'));

-- Preview as the app server calls it.
DO $$
DECLARE v jsonb := pg_temp.as_role('service_role', format('SELECT public.team_season_preview(%L, %L::jsonb)',
  'lions-track-2027', jsonb_build_object('coach_id', pg_temp.u('c_lions_head'))::text));
BEGIN
  PERFORM pg_temp.ok('preview (Lions Head Coach, as service_role): grade moves, flagged grades, must-rejoin, carryover',
    (v -> 'value' -> 'roster' ->> 'graduating')::int = 2 AND (v -> 'value' -> 'roster' ->> 'returning')::int = 8
    AND jsonb_array_length(v -> 'value' -> 'roster' -> 'flagged') = 3
    AND jsonb_array_length(v -> 'value' -> 'members' -> 'must_rejoin') = 3
    AND (v -> 'value' -> 'members' ->> 'parents_carried')::int = 3
    AND v -> 'value' -> 'proposed' ->> 'slug' = 'lions-track-2028'
    AND v -> 'value' -> 'blockers' = '[]'::jsonb,
    left(coalesce(v ->> 'error', jsonb_build_object('roster', (v -> 'value' -> 'roster') - 'flagged', 'members', (v -> 'value' -> 'members') - 'must_rejoin',
      'must_rejoin', jsonb_array_length(v -> 'value' -> 'members' -> 'must_rejoin'), 'blockers', v -> 'value' -> 'blockers')::text), 600));
END $$;
SELECT pg_temp.ok('preview (Bears): pending requests and invitation are blockers',
  (SELECT v -> 'value' -> 'blockers' = '["season_pending_athlete_requests","season_pending_parent_requests","season_pending_staff_invitations"]'::jsonb
   FROM (SELECT pg_temp.as_role('service_role', format('SELECT public.team_season_preview(%L, %L::jsonb)',
          'bears-hoops-2027', jsonb_build_object('coach_id', pg_temp.u('c_bears_head'))::text)) v) x));
SELECT pg_temp.ok('preview (Owls): new address and season name must be entered',
  (SELECT v -> 'value' -> 'blockers' = '["season_successor_slug_required","season_label_required"]'::jsonb
   FROM (SELECT pg_temp.as_role('service_role', format('SELECT public.team_season_preview(%L, %L::jsonb)',
          'owls-soccer-fall', jsonb_build_object('coach_id', pg_temp.u('c_owls_head'))::text)) v) x));
SELECT pg_temp.ok('preview refuses the Assistant Coach',
  (SELECT v ->> 'error' = 'season_actor_not_authorized'
   FROM (SELECT pg_temp.as_role('service_role', format('SELECT public.team_season_preview(%L, %L::jsonb)',
          'lions-track-2027', jsonb_build_object('coach_id', pg_temp.u('c_lions_asst'))::text)) v) x));

-- The completed Hawks season (only once the transition step has run).
DO $$
DECLARE v jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM elf_qa.applied WHERE step = 'season_transition_hawks') THEN
    RAISE NOTICE 'SKIP  completed-season checks (Hawks transition not applied)';
    RETURN;
  END IF;
  PERFORM pg_temp.ok('Hawks 2027 completed and archived; Hawks 2028 active',
    (SELECT archived AND season_completed_at IS NOT NULL AND successor_campaign_slug = 'hawks-track-2028'
     FROM public.campaign_settings WHERE campaign_slug = 'hawks-track-2027')
    AND (SELECT NOT coalesce(archived, false) AND NOT fundraising_enabled FROM public.campaign_settings WHERE campaign_slug = 'hawks-track-2028'));
  PERFORM pg_temp.ok('completed season: history readable, thread not hidden',
    (SELECT count(*) FROM public.messages m JOIN public.message_threads t ON t.id = m.thread_id
     WHERE t.campaign_slug = 'hawks-track-2027' AND t.archived_at IS NULL) = 2);
  v := pg_temp.as_role('service_role', format(
    'WITH m AS (INSERT INTO public.messages (thread_id, sender_type, sender_coach_id, body, sender_name, sender_role) VALUES (%L, %L, %L, %L, %L, %L) RETURNING id) SELECT to_jsonb(m) FROM m',
    pg_temp.u('th_hawks_dm'), 'coach', pg_temp.u('c_hawks_head'), 'late', 'Hal Hawk', 'head_coach'));
  PERFORM pg_temp.ok('completed season: a new message is refused (season_completed_read_only)',
    NOT (v ->> 'ok')::boolean AND v ->> 'error' = 'season_completed_read_only', v::text);
  PERFORM pg_temp.ok('Hawks 2028: returning athlete carried, graduating senior not',
    EXISTS (SELECT 1 FROM public.athletes WHERE campaign_slug = 'hawks-track-2028' AND previous_season_athlete_id = pg_temp.u('a_hank') AND class_year = 'Junior')
    AND NOT EXISTS (SELECT 1 FROM public.athletes WHERE campaign_slug = 'hawks-track-2028' AND previous_season_athlete_id = pg_temp.u('a_hope')));
END $$;

ROLLBACK;
\echo SMOKE PASSED (all changes rolled back)
