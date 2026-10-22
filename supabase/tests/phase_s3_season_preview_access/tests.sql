-- Complete Season Phase 3 behavior tests: the read-only preview, as the app
-- server (service_role) calls it. Disposable local database only.
\set ON_ERROR_STOP on
SET client_min_messages = warning;

CREATE SCHEMA qa;
GRANT USAGE ON SCHEMA qa TO PUBLIC;
CREATE TABLE qa.results (n serial PRIMARY KEY, name text, ok boolean, detail text);
GRANT ALL ON qa.results TO PUBLIC;
GRANT ALL ON SEQUENCE qa.results_n_seq TO PUBLIC;
CREATE TABLE qa.vals (k text PRIMARY KEY, v text);
GRANT ALL ON qa.vals TO PUBLIC;
CREATE FUNCTION qa.check(p_name text, p_ok boolean, p_detail text DEFAULT NULL) RETURNS void
LANGUAGE sql AS $$ INSERT INTO qa.results (name, ok, detail) VALUES (p_name, coalesce(p_ok, false), p_detail) $$;
CREATE FUNCTION qa.u(p text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT md5(p)::uuid $$;
CREATE FUNCTION qa.put(p_k text, p_v text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO qa.vals VALUES (p_k, p_v) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v $$;
CREATE FUNCTION qa.get(p_k text) RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT v::jsonb FROM qa.vals WHERE k = p_k $$;
-- Run p_sql as p_role; store the result (or the error) under p_key.
CREATE FUNCTION qa.as_role(p_key text, p_role text, p_sql text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  BEGIN
    EXECUTE format('SET LOCAL ROLE %I', p_role);
    EXECUTE p_sql INTO r;
    RESET ROLE;
    PERFORM qa.put(p_key, jsonb_build_object('ok', true, 'value', r)::text);
  EXCEPTION WHEN others THEN
    PERFORM qa.put(p_key, jsonb_build_object('ok', false, 'error', SQLERRM)::text);
  END;
END $$;
CREATE FUNCTION qa.dbhash() RETURNS text LANGUAGE plpgsql AS $$
DECLARE t text; h text; acc text := '';
BEGIN
  FOR t IN SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' ORDER BY 1 LOOP
    EXECUTE format('SELECT md5(coalesce(string_agg(x::text, %L ORDER BY x::text), %L)) FROM public.%I x', '|', '', t) INTO h;
    acc := acc || t || '=' || h || ';';
  END LOOP;
  RETURN md5(acc);
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA qa TO PUBLIC;
CREATE FUNCTION qa.pv(p_slug text, p_actor jsonb) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT format('SELECT public.team_season_preview(%L, %L::jsonb)', p_slug, p_actor::text) $$;

-- ═══ A. Exactly one new permission ════════════════════════════════════
SELECT qa.check('A1 service_role may execute team_season_preview; anon and authenticated may not',
  has_function_privilege('service_role', 'public.team_season_preview(text,jsonb,text,text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.team_season_preview(text,jsonb,text,text)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.team_season_preview(text,jsonb,text,text)', 'EXECUTE'));
SELECT qa.check('A2 no API role may execute team_season_complete, the fingerprint or any helper (no transition can start from the app)',
  NOT EXISTS (SELECT 1 FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) r,
    unnest(ARRAY['team_season_complete(text,jsonb,text,text,text,uuid,text)', 'team_season_fingerprint(text)',
                 'team_season_actor(jsonb,text)', 'team_season_athlete_plan(text)', 'team_season_member_plan(text)',
                 'team_season_replay(uuid,text)', 'season_new_join_code()', 'season_slug_valid(text)', 'season_flag_reason(text)',
                 'season_label_end_year(text)', 'season_write_guard()', 'season_is_completed(text)']) f
    WHERE has_function_privilege(r, 'public.' || f, 'EXECUTE')));
SELECT qa.check('A3 the preview runs with owner rights, an empty search_path, and is still STABLE (cannot write)',
  (SELECT prosecdef AND provolatile = 's' AND array_to_string(proconfig, ',') LIKE '%search_path=""%'
   FROM pg_proc WHERE proname = 'team_season_preview'));
SELECT qa.as_role('complete_denied', 'service_role',
  $q$ SELECT public.team_season_complete('lions-track-2027', '{"coach_id":"00000000-0000-0000-0000-000000000000"}', NULL, NULL, md5('x'), gen_random_uuid(), 'x') $q$);
SELECT qa.check('A4 the server key is refused team_season_complete', NOT (qa.get('complete_denied') ->> 'ok')::boolean
  AND qa.get('complete_denied') ->> 'error' LIKE '%permission denied%', qa.get('complete_denied')::text);

-- ═══ B. The preview as the app server calls it ════════════════════════
SELECT qa.put('hash_before', to_jsonb(qa.dbhash())::text);
SELECT qa.as_role('head', 'service_role', qa.pv('lions-track-2027', jsonb_build_object('coach_id', qa.u('c01'))));
SELECT qa.check('B1 Head Coach (account-linked): the preview is returned',
  (qa.get('head') ->> 'ok')::boolean AND qa.get('head') -> 'value' -> 'actor' ->> 'kind' = 'head_coach', qa.get('head')::text);
SELECT qa.check('B2 accurate: next season, grade moves, carryover, history, open items',
  qa.get('head') -> 'value' -> 'proposed' ->> 'slug' = 'lions-track-2028'
  AND qa.get('head') -> 'value' -> 'proposed' ->> 'season_label' = '2028 Season'
  AND (qa.get('head') -> 'value' -> 'roster') - 'flagged' = jsonb_build_object('total', 10, 'graduating', 2, 'returning', 8,
        'freshman_to_sophomore', 1, 'sophomore_to_junior', 1, 'junior_to_senior', 2, 'unchanged_middle_school', 1)
  AND (qa.get('head') -> 'value' -> 'members' ->> 'parents_carried')::int = 3
  AND (qa.get('head') -> 'value' -> 'members' ->> 'parent_links_carried')::int = 4
  AND (qa.get('head') -> 'value' -> 'coaches' ->> 'booster_carried')::int = 1
  AND (qa.get('head') -> 'value' -> 'calendar' ->> 'future_events_to_copy')::int = 3
  AND (qa.get('head') -> 'value' -> 'left_in_history' ->> 'team_sponsors')::int = 2
  AND (qa.get('head') -> 'value' -> 'open_items' ->> 'donations_last_24h')::int = 1,
  qa.get('head') ->> 'value');
SELECT qa.check('B3 unknown/nonstandard grades are flagged with names, for the authorized viewer only',
  jsonb_array_length(qa.get('head') -> 'value' -> 'roster' -> 'flagged') = 3
  AND qa.get('head') -> 'value' -> 'warnings' ? 'season_flagged_grades'
  AND (qa.get('head') -> 'value' -> 'roster' -> 'flagged')::text LIKE '%Rhys Redshirt%');
SELECT qa.check('B4 members without accounts are listed to rejoin',
  jsonb_array_length(qa.get('head') -> 'value' -> 'members' -> 'must_rejoin') = 3
  AND jsonb_array_length(qa.get('head') -> 'value' -> 'coaches' -> 'must_rejoin') = 2);
SELECT qa.as_role('admin', 'service_role', qa.pv('lions-track-2027', jsonb_build_object('platform_admin_id', qa.u('pa1'))));
SELECT qa.check('B5 platform admin: the preview is returned', (qa.get('admin') ->> 'ok')::boolean
  AND qa.get('admin') -> 'value' -> 'actor' ->> 'kind' = 'platform_admin');
SELECT qa.as_role('bears', 'service_role', qa.pv('bears-hoops-2027', jsonb_build_object('coach_id', qa.u('c10'))));
SELECT qa.check('B6 pending athlete/parent requests and staff invitations show as blockers',
  qa.get('bears') -> 'value' -> 'blockers' = '["season_pending_athlete_requests","season_pending_parent_requests","season_pending_staff_invitations"]'::jsonb,
  qa.get('bears') ->> 'value');
SELECT qa.check('B7 the preview wrote nothing', qa.dbhash() = qa.get('hash_before') #>> '{}');

-- ═══ C. The function still refuses everyone else ══════════════════════
SELECT qa.as_role('asst', 'service_role', qa.pv('lions-track-2027', jsonb_build_object('coach_id', qa.u('c02'))));
SELECT qa.as_role('booster', 'service_role', qa.pv('lions-track-2027', jsonb_build_object('coach_id', qa.u('c03'))));
SELECT qa.as_role('legacy', 'service_role', qa.pv('lions-track-2027', jsonb_build_object('coach_id', qa.u('c04'))));
SELECT qa.as_role('member', 'service_role', qa.pv('lions-track-2027', jsonb_build_object('coach_id', qa.u('m01'))));
SELECT qa.as_role('other', 'service_role', qa.pv('lions-track-2027', jsonb_build_object('coach_id', qa.u('c10'))));
SELECT qa.as_role('bad', 'service_role', qa.pv('lions-track-2027', '{"coach_id":"x","platform_admin_id":"y"}'::jsonb));
SELECT qa.check('C1 Assistant Coach, booster, a member id, another team''s Head Coach: refused (no names returned)',
  NOT (qa.get('asst') ->> 'ok')::boolean AND qa.get('asst') ->> 'error' = 'season_actor_not_authorized'
  AND NOT (qa.get('booster') ->> 'ok')::boolean AND qa.get('booster') ->> 'error' = 'season_actor_not_authorized'
  AND NOT (qa.get('member') ->> 'ok')::boolean AND qa.get('member') ->> 'error' = 'season_actor_not_authorized'
  AND NOT (qa.get('other') ->> 'ok')::boolean AND qa.get('other') ->> 'error' = 'season_actor_not_authorized');
SELECT qa.check('C2 a legacy Head Coach without an account gets its own code; a malformed actor is refused',
  qa.get('legacy') ->> 'error' = 'season_actor_account_required' AND qa.get('bad') ->> 'error' = 'season_actor_invalid');
SELECT qa.as_role('anon', 'anon', qa.pv('lions-track-2027', jsonb_build_object('coach_id', qa.u('c01'))));
SELECT qa.check('C3 anon (the public API key) cannot run the preview at all',
  NOT (qa.get('anon') ->> 'ok')::boolean AND qa.get('anon') ->> 'error' LIKE '%permission denied%');
