-- Complete Season Phase 4 (app "Phase 5A") behavior tests: the season
-- transition as the app server (service_role) calls it. Disposable local
-- database only. Real transitions run here — never against Supabase.
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
-- Whole-database fingerprint (every public table).
CREATE FUNCTION qa.dbhash() RETURNS text LANGUAGE plpgsql AS $$
DECLARE t text; h text; acc text := '';
BEGIN
  FOR t IN SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' ORDER BY 1 LOOP
    EXECUTE format('SELECT md5(coalesce(string_agg(x::text, %L ORDER BY x::text), %L)) FROM public.%I x', '|', '', t) INTO h;
    acc := acc || t || '=' || h || ';';
  END LOOP;
  RETURN md5(acc);
END $$;
-- Fingerprint of every team-scoped row that does NOT belong to the given
-- slugs (tables with a campaign_slug column).
CREATE FUNCTION qa.otherhash(p_exclude text[]) RETURNS text LANGUAGE plpgsql AS $$
DECLARE t text; h text; acc text := '';
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'campaign_slug' AND NOT a.attisdropped
           WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' ORDER BY 1 LOOP
    EXECUTE format('SELECT md5(coalesce(string_agg(x::text, %L ORDER BY x::text), %L)) FROM public.%I x WHERE x.campaign_slug IS NULL OR x.campaign_slug <> ALL (%L::text[])',
                   '|', '', t, p_exclude) INTO h;
    acc := acc || t || '=' || h || ';';
  END LOOP;
  RETURN md5(acc);
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA qa TO PUBLIC;
CREATE FUNCTION qa.pv(p_slug text, p_actor jsonb) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT format('SELECT public.team_season_preview(%L, %L::jsonb)', p_slug, p_actor::text) $$;
CREATE FUNCTION qa.cp(p_slug text, p_actor jsonb, p_fp text, p_key uuid, p_phrase text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT format('SELECT public.team_season_complete_checked(%L, %L::jsonb, NULL, NULL, %L, %L::uuid, %L)', p_slug, p_actor::text, p_fp, p_key, p_phrase) $$;

-- Actors (fixtures): c01 Hana Head (account a01, also Head Coach of
-- other-team-2027 and a Lions parent), c02 Assistant, c04 legacy Head Coach
-- (no account), c10 Bears Head Coach, pa1 platform admin.
SELECT qa.put('head', to_jsonb(jsonb_build_object('coach_id', qa.u('c01')))::text);

-- ═══ A. Exactly one new permission ════════════════════════════════════
SELECT qa.check('A1 service_role may execute ONLY the checked entry point; the raw transition stays owner-only; anon and authenticated get neither',
  has_function_privilege('service_role', 'public.team_season_complete_checked(text,jsonb,text,text,text,uuid,text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.team_season_complete_checked(text,jsonb,text,text,text,uuid,text)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.team_season_complete_checked(text,jsonb,text,text,text,uuid,text)', 'EXECUTE')
  AND NOT EXISTS (SELECT 1 FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) r
                  WHERE has_function_privilege(r, 'public.team_season_complete(text,jsonb,text,text,text,uuid,text)', 'EXECUTE')));
SELECT qa.as_role('raw_denied', 'service_role',
  $q$ SELECT public.team_season_complete('lions-track-2027', '{"coach_id":"00000000-0000-0000-0000-000000000000"}', NULL, NULL, md5('x'), gen_random_uuid(), 'x') $q$);
SELECT qa.check('A1b the server key is refused the raw transition (no unchecked replay path)',
  qa.get('raw_denied') ->> 'error' LIKE '%permission denied%', qa.get('raw_denied')::text);
SELECT qa.check('A2 the fingerprint, replay and every helper stay owner-only (no API role)',
  NOT EXISTS (SELECT 1 FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) r,
    unnest(ARRAY['team_season_fingerprint(text)', 'team_season_actor(jsonb,text)', 'team_season_athlete_plan(text)',
                 'team_season_member_plan(text)', 'team_season_replay(uuid,text)', 'season_new_join_code()',
                 'season_slug_valid(text)', 'season_flag_reason(text)', 'season_label_end_year(text)',
                 'season_write_guard()', 'season_is_completed(text)']) f
    WHERE has_function_privilege(r, 'public.' || f, 'EXECUTE')));
SELECT qa.check('A3 both run with owner rights and an empty search_path; the transition keeps its lock timeout',
  (SELECT prosecdef AND array_to_string(proconfig, ',') LIKE '%search_path=""%' AND array_to_string(proconfig, ',') LIKE '%lock_timeout=10s%'
   FROM pg_proc WHERE proname = 'team_season_complete')
  AND (SELECT prosecdef AND array_to_string(proconfig, ',') LIKE '%search_path=""%'
   FROM pg_proc WHERE proname = 'team_season_complete_checked'));
SELECT qa.check('A4 the audit log stays read-only to the server key (no insert/update/delete)',
  has_table_privilege('service_role', 'public.team_season_transitions', 'SELECT')
  AND NOT has_table_privilege('service_role', 'public.team_season_transitions', 'INSERT')
  AND NOT has_table_privilege('service_role', 'public.team_season_transitions', 'UPDATE')
  AND NOT has_table_privilege('service_role', 'public.team_season_transitions', 'DELETE'));
SELECT qa.as_role('anon', 'anon', qa.cp('lions-track-2027', qa.get('head'), md5('x'), gen_random_uuid(), 'COMPLETE 2027 SEASON'));
SELECT qa.as_role('authd', 'authenticated', qa.cp('lions-track-2027', qa.get('head'), md5('x'), gen_random_uuid(), 'COMPLETE 2027 SEASON'));
SELECT qa.check('A5 the public and signed-in API keys cannot start a transition',
  qa.get('anon') ->> 'error' LIKE '%permission denied%' AND qa.get('authd') ->> 'error' LIKE '%permission denied%',
  qa.get('anon')::text || qa.get('authd')::text);

-- ═══ B. Refusals change nothing ═══════════════════════════════════════
SELECT qa.as_role('pv', 'service_role', qa.pv('lions-track-2027', qa.get('head')));
SELECT qa.put('fp', to_jsonb(qa.get('pv') -> 'value' ->> 'fingerprint')::text);
SELECT qa.put('phrase', to_jsonb(qa.get('pv') -> 'value' -> 'proposed' ->> 'confirmation_phrase')::text);
SELECT qa.check('B0 the preview gives a fingerprint and the confirmation phrase',
  (qa.get('fp') #>> '{}') ~ '^[0-9a-f]{32}$' AND qa.get('phrase') #>> '{}' = 'COMPLETE 2027 SEASON', qa.get('pv')::text);
SELECT qa.put('hash0', to_jsonb(qa.dbhash())::text);

SELECT qa.as_role('asst', 'service_role', qa.cp('lions-track-2027', jsonb_build_object('coach_id', qa.u('c02')), qa.get('fp') #>> '{}', gen_random_uuid(), 'COMPLETE 2027 SEASON'));
SELECT qa.as_role('legacy', 'service_role', qa.cp('lions-track-2027', jsonb_build_object('coach_id', qa.u('c04')), qa.get('fp') #>> '{}', gen_random_uuid(), 'COMPLETE 2027 SEASON'));
SELECT qa.as_role('otherhead', 'service_role', qa.cp('lions-track-2027', jsonb_build_object('coach_id', qa.u('c10')), qa.get('fp') #>> '{}', gen_random_uuid(), 'COMPLETE 2027 SEASON'));
SELECT qa.as_role('member', 'service_role', qa.cp('lions-track-2027', jsonb_build_object('coach_id', qa.u('m01')), qa.get('fp') #>> '{}', gen_random_uuid(), 'COMPLETE 2027 SEASON'));
SELECT qa.check('B1 Assistant Coach, another team''s Head Coach and a member id are refused; a legacy Head Coach needs an account',
  qa.get('asst') ->> 'error' = 'season_actor_not_authorized' AND qa.get('otherhead') ->> 'error' = 'season_actor_not_authorized'
  AND qa.get('member') ->> 'error' = 'season_actor_not_authorized' AND qa.get('legacy') ->> 'error' = 'season_actor_account_required',
  qa.get('asst')::text || qa.get('otherhead')::text || qa.get('member')::text || qa.get('legacy')::text);

SELECT qa.as_role('wrongphrase', 'service_role', qa.cp('lions-track-2027', qa.get('head'), qa.get('fp') #>> '{}', gen_random_uuid(), 'COMPLETE 2026 SEASON'));
SELECT qa.as_role('nophrase', 'service_role', qa.cp('lions-track-2027', qa.get('head'), qa.get('fp') #>> '{}', gen_random_uuid(), ''));
SELECT qa.check('B2 a wrong or missing confirmation phrase is refused',
  qa.get('wrongphrase') ->> 'error' = 'season_confirmation_mismatch' AND qa.get('nophrase') ->> 'error' = 'season_confirmation_mismatch');

SELECT qa.as_role('badfp', 'service_role', qa.cp('lions-track-2027', qa.get('head'), md5('not the preview'), gen_random_uuid(), 'COMPLETE 2027 SEASON'));
SELECT qa.as_role('nofp', 'service_role', qa.cp('lions-track-2027', qa.get('head'), 'zz', gen_random_uuid(), 'COMPLETE 2027 SEASON'));
SELECT qa.check('B3 a fingerprint that is not the current preview is stale; a malformed one needs a preview',
  qa.get('badfp') ->> 'error' = 'season_preview_stale' AND qa.get('nofp') ->> 'error' = 'season_preview_required');

SELECT qa.as_role('bears_pv', 'service_role', qa.pv('bears-hoops-2027', jsonb_build_object('coach_id', qa.u('c10'))));
SELECT qa.as_role('bears', 'service_role', qa.cp('bears-hoops-2027', jsonb_build_object('coach_id', qa.u('c10')),
  qa.get('bears_pv') -> 'value' ->> 'fingerprint', gen_random_uuid(), qa.get('bears_pv') -> 'value' -> 'proposed' ->> 'confirmation_phrase'));
SELECT qa.check('B4 a season with blockers (pending requests, staff invitation) is refused with the first blocker',
  qa.get('bears') ->> 'error' = 'season_pending_athlete_requests', qa.get('bears')::text);

SELECT qa.check('B5 none of the refusals wrote anything', qa.dbhash() = qa.get('hash0') #>> '{}');

-- Stale: the roster changes after the coach previewed (then is restored).
INSERT INTO public.athletes (id, campaign_slug, name, class_year) VALUES (qa.u('late1'), 'lions-track-2027', 'Late Larry', 'Junior');
SELECT qa.as_role('stale', 'service_role', qa.cp('lions-track-2027', qa.get('head'), qa.get('fp') #>> '{}', gen_random_uuid(), 'COMPLETE 2027 SEASON'));
DELETE FROM public.athletes WHERE id = qa.u('late1');
SELECT qa.check('B6 a roster change after the preview makes it stale; nothing is transitioned',
  qa.get('stale') ->> 'error' = 'season_preview_stale'
  AND NOT EXISTS (SELECT 1 FROM public.campaign_settings WHERE campaign_slug = 'lions-track-2028'), qa.get('stale')::text);

-- ═══ C. The transition, as the app server calls it ════════════════════
SELECT qa.put('others0', to_jsonb(qa.otherhash(ARRAY['lions-track-2027', 'lions-track-2028']))::text);
SELECT qa.put('other_team0', to_jsonb((SELECT row_to_json(c)::text FROM public.campaign_settings c WHERE campaign_slug = 'other-team-2027'))::text);
SELECT qa.put('hana_other0', to_jsonb((SELECT row_to_json(c)::text FROM public.team_coaches c WHERE id = qa.u('c15')))::text);
SELECT qa.put('key1', to_jsonb(qa.u('key-1'))::text);
SELECT qa.as_role('done', 'service_role', qa.cp('lions-track-2027', qa.get('head'), qa.get('fp') #>> '{}', (qa.get('key1') #>> '{}')::uuid, '  complete   2027 season '));
SELECT qa.check('C1 the Head Coach completes the season (phrase case and spacing ignored); the result names both seasons',
  (qa.get('done') ->> 'ok')::boolean AND qa.get('done') -> 'value' ->> 'from_slug' = 'lions-track-2027'
  AND qa.get('done') -> 'value' ->> 'to_slug' = 'lions-track-2028' AND qa.get('done') -> 'value' ->> 'to_season_label' = '2028 Season'
  AND (qa.get('done') -> 'value' ->> 'replayed')::boolean = false, qa.get('done')::text);
SELECT qa.check('C1b the result carries no join code (the successor''s credential); the audit record still has it for the owner',
  NOT (qa.get('done') -> 'value' ? 'join_code')
  AND (SELECT result ? 'join_code' FROM public.team_season_transitions WHERE from_campaign_slug = 'lions-track-2027'));
SELECT qa.check('C2 the old season is archived and completed, linked to its successor',
  (SELECT archived AND season_completed_at IS NOT NULL AND successor_campaign_slug = 'lions-track-2028'
   FROM public.campaign_settings WHERE campaign_slug = 'lions-track-2027'));
SELECT qa.check('C3 the new season is active, linked back, and its fundraiser is OFF until a platform admin enables it',
  (SELECT NOT coalesce(archived, false) AND NOT fundraising_enabled AND predecessor_campaign_slug = 'lions-track-2027' AND season_completed_at IS NULL
   FROM public.campaign_settings WHERE campaign_slug = 'lions-track-2028'));
SELECT qa.check('C4 graduated seniors stay in the old season only; returning athletes moved up a grade',
  NOT EXISTS (SELECT 1 FROM public.athletes WHERE campaign_slug = 'lions-track-2028' AND previous_season_athlete_id = qa.u('s01'))
  AND EXISTS (SELECT 1 FROM public.athletes WHERE id = qa.u('s01') AND campaign_slug = 'lions-track-2027')
  AND (SELECT class_year FROM public.athletes WHERE campaign_slug = 'lions-track-2028' AND previous_season_athlete_id = qa.u('s02')) = 'Senior'
  AND (SELECT class_year FROM public.athletes WHERE campaign_slug = 'lions-track-2028' AND previous_season_athlete_id = qa.u('s04')) = 'Sophomore'
  AND (SELECT count(*) FROM public.athletes WHERE campaign_slug = 'lions-track-2028') = (qa.get('pv') -> 'value' -> 'roster' ->> 'returning')::int);
SELECT qa.check('C5 linked parents and eligible members carried exactly as previewed; no access requests carried',
  (SELECT count(*) FROM public.team_members WHERE campaign_slug = 'lions-track-2028' AND role = 'parent') = (qa.get('pv') -> 'value' -> 'members' ->> 'parents_carried')::int
  AND (SELECT count(*) FROM public.team_member_athletes l JOIN public.team_members m ON m.id = l.team_member_id WHERE m.campaign_slug = 'lions-track-2028')
      = (qa.get('pv') -> 'value' -> 'members' ->> 'parent_links_carried')::int
  AND NOT EXISTS (SELECT 1 FROM public.pending_athlete_requests WHERE campaign_slug = 'lions-track-2028')
  AND NOT EXISTS (SELECT 1 FROM public.parent_access_requests WHERE campaign_slug = 'lions-track-2028'));
SELECT qa.check('C6 history stays with the old season (members, athletes, donations untouched there)',
  (SELECT count(*) FROM public.athletes WHERE campaign_slug = 'lions-track-2027') = (qa.get('pv') -> 'value' -> 'roster' ->> 'total')::int
  AND (SELECT count(*) FROM public.donations WHERE campaign_slug = 'lions-track-2027') = (qa.get('pv') -> 'value' -> 'left_in_history' ->> 'donations')::int
  AND NOT EXISTS (SELECT 1 FROM public.donations WHERE campaign_slug = 'lions-track-2028'));
SELECT qa.check('C7 exactly one audit row, recording the actor, the preview fingerprint and the idempotency key',
  (SELECT count(*) FROM public.team_season_transitions WHERE from_campaign_slug = 'lions-track-2027') = 1
  AND (SELECT actor_kind = 'head_coach' AND actor_coach_id = qa.u('c01') AND preview_fingerprint = qa.get('fp') #>> '{}'
       AND idempotency_key = (qa.get('key1') #>> '{}')::uuid
       FROM public.team_season_transitions WHERE from_campaign_slug = 'lions-track-2027'));
SELECT qa.check('C8 no effect on unrelated teams (every team-scoped row outside the two Lions seasons is identical)',
  qa.otherhash(ARRAY['lions-track-2027', 'lions-track-2028']) = qa.get('others0') #>> '{}');
SELECT qa.check('C9 multi-team access kept: the Head Coach''s other team and coach row are unchanged, and both teams stay in their team list',
  (SELECT row_to_json(c)::text FROM public.campaign_settings c WHERE campaign_slug = 'other-team-2027') = qa.get('other_team0') #>> '{}'
  AND (SELECT row_to_json(c)::text FROM public.team_coaches c WHERE id = qa.u('c15')) = qa.get('hana_other0') #>> '{}'
  AND EXISTS (SELECT 1 FROM public.team_coaches WHERE campaign_slug = 'lions-track-2028' AND account_id = qa.u('a01') AND role = 'head_coach')
  AND (SELECT team_slugs @> ARRAY['other-team-2027', 'lions-track-2028'] FROM public.account_team_order WHERE account_id = qa.u('a01')));

-- ═══ D. Repeats and duplicates ════════════════════════════════════════
SELECT qa.put('hash1', to_jsonb(qa.dbhash())::text);
SELECT qa.as_role('replay', 'service_role', qa.cp('lions-track-2027', qa.get('head'), qa.get('fp') #>> '{}', (qa.get('key1') #>> '{}')::uuid, 'COMPLETE 2027 SEASON'));
SELECT qa.check('D1 a retry with the same key and request returns the same result as a replay, writing nothing',
  (qa.get('replay') ->> 'ok')::boolean AND (qa.get('replay') -> 'value' ->> 'replayed')::boolean
  AND qa.get('replay') -> 'value' ->> 'transition_id' = qa.get('done') -> 'value' ->> 'transition_id'
  AND NOT (qa.get('replay') -> 'value' ? 'join_code')
  AND qa.dbhash() = qa.get('hash1') #>> '{}', qa.get('replay')::text);

-- Replay authorization: knowing the confirmation id is not enough.
SELECT qa.as_role('replay_other', 'service_role', qa.cp('lions-track-2027', jsonb_build_object('coach_id', qa.u('c10')), qa.get('fp') #>> '{}', (qa.get('key1') #>> '{}')::uuid, 'COMPLETE 2027 SEASON'));
SELECT qa.as_role('replay_asst', 'service_role', qa.cp('lions-track-2027', jsonb_build_object('coach_id', qa.u('c02')), qa.get('fp') #>> '{}', (qa.get('key1') #>> '{}')::uuid, 'COMPLETE 2027 SEASON'));
SELECT qa.as_role('replay_ghost_admin', 'service_role', qa.cp('lions-track-2027', jsonb_build_object('platform_admin_id', qa.u('no-such-admin')), qa.get('fp') #>> '{}', (qa.get('key1') #>> '{}')::uuid, 'COMPLETE 2027 SEASON'));
SELECT qa.check('D1b another team''s Head Coach, the Assistant Coach or an unknown admin with the SAME confirmation id: refused as unauthorized (no receipt, not even a conflict)',
  qa.get('replay_other') ->> 'error' = 'season_actor_not_authorized' AND qa.get('replay_asst') ->> 'error' = 'season_actor_not_authorized'
  AND qa.get('replay_ghost_admin') ->> 'error' = 'season_actor_not_authorized'
  AND qa.dbhash() = qa.get('hash1') #>> '{}',
  qa.get('replay_other')::text || qa.get('replay_asst')::text || qa.get('replay_ghost_admin')::text);
-- Revocation: the original Head Coach loses the Head Coach role in the new season.
UPDATE public.team_coaches SET role = 'assistant_coach' WHERE campaign_slug = 'lions-track-2028' AND account_id = qa.u('a01');
SELECT qa.as_role('replay_revoked', 'service_role', qa.cp('lions-track-2027', qa.get('head'), qa.get('fp') #>> '{}', (qa.get('key1') #>> '{}')::uuid, 'COMPLETE 2027 SEASON'));
UPDATE public.team_coaches SET role = 'head_coach' WHERE campaign_slug = 'lions-track-2028' AND account_id = qa.u('a01');
SELECT qa.as_role('replay_restored', 'service_role', qa.cp('lions-track-2027', qa.get('head'), qa.get('fp') #>> '{}', (qa.get('key1') #>> '{}')::uuid, 'COMPLETE 2027 SEASON'));
SELECT qa.check('D1c a Head Coach no longer running the team (revoked in the new season) can''t retrieve the receipt; once restored, the replay works again',
  qa.get('replay_revoked') ->> 'error' = 'season_actor_not_authorized'
  AND (qa.get('replay_restored') -> 'value' ->> 'replayed')::boolean
  AND qa.get('replay_restored') -> 'value' ->> 'transition_id' = qa.get('done') -> 'value' ->> 'transition_id',
  qa.get('replay_revoked')::text || qa.get('replay_restored')::text);
SELECT qa.put('hash1', to_jsonb(qa.dbhash())::text);
SELECT qa.as_role('conflict', 'service_role', qa.cp('lions-track-2027', qa.get('head'), md5('other'), (qa.get('key1') #>> '{}')::uuid, 'COMPLETE 2027 SEASON'));
SELECT qa.check('D2 the same key with a different request is refused (idempotency conflict)',
  qa.get('conflict') ->> 'error' = 'season_idempotency_conflict', qa.get('conflict')::text);
SELECT qa.as_role('again', 'service_role', qa.cp('lions-track-2027', qa.get('head'), qa.get('fp') #>> '{}', gen_random_uuid(), 'COMPLETE 2027 SEASON'));
SELECT qa.as_role('admin_again', 'service_role', qa.cp('lions-track-2027', jsonb_build_object('platform_admin_id', qa.u('pa1')), qa.get('fp') #>> '{}', gen_random_uuid(), 'COMPLETE 2027 SEASON'));
SELECT qa.check('D3 a second completion with a new key (coach or platform admin) is refused: already completed',
  qa.get('again') ->> 'error' = 'season_already_completed' AND qa.get('admin_again') ->> 'error' = 'season_already_completed',
  qa.get('again')::text || qa.get('admin_again')::text);
SELECT qa.check('D4 still exactly one successor and one audit row; nothing written by D1–D3',
  (SELECT count(*) FROM public.campaign_settings WHERE predecessor_campaign_slug = 'lions-track-2027') = 1
  AND (SELECT count(*) FROM public.team_season_transitions WHERE from_campaign_slug = 'lions-track-2027') = 1
  AND qa.dbhash() = qa.get('hash1') #>> '{}');

-- ═══ E. The completed season stays read-only ══════════════════════════
SELECT qa.as_role('ro_athlete', 'service_role',
  $q$ WITH x AS (INSERT INTO public.athletes (campaign_slug, name, class_year) VALUES ('lions-track-2027', 'Too Late', 'Junior') RETURNING id) SELECT to_jsonb(x) FROM x $q$);
SELECT qa.check('E1 the archived season refuses new roster rows from the server key (season_completed_read_only)',
  qa.get('ro_athlete') ->> 'error' = 'season_completed_read_only', qa.get('ro_athlete')::text);
SELECT qa.as_role('new_athlete', 'service_role',
  $q$ WITH x AS (INSERT INTO public.athletes (campaign_slug, name, class_year) VALUES ('lions-track-2028', 'New Kid', 'Freshman') RETURNING id) SELECT to_jsonb(x) FROM x $q$);
SELECT qa.check('E2 the new season accepts changes normally', (qa.get('new_athlete') ->> 'ok')::boolean, qa.get('new_athlete')::text);

-- ═══ F. A platform admin can complete a season ════════════════════════
SELECT qa.as_role('pv_other', 'service_role', qa.pv('other-team-2027', jsonb_build_object('platform_admin_id', qa.u('pa1'))));
SELECT qa.as_role('admin_done', 'service_role', qa.cp('other-team-2027', jsonb_build_object('platform_admin_id', qa.u('pa1')),
  qa.get('pv_other') -> 'value' ->> 'fingerprint', qa.u('key-2'), qa.get('pv_other') -> 'value' -> 'proposed' ->> 'confirmation_phrase'));
SELECT qa.check('F1 platform admin: completes a season with no blockers; audit records the admin',
  CASE WHEN jsonb_array_length(qa.get('pv_other') -> 'value' -> 'blockers') = 0
    THEN (qa.get('admin_done') ->> 'ok')::boolean
         AND (SELECT actor_kind = 'platform_admin' FROM public.team_season_transitions WHERE from_campaign_slug = 'other-team-2027')
    ELSE qa.get('admin_done') ->> 'error' = qa.get('pv_other') -> 'value' -> 'blockers' ->> 0 END,
  qa.get('pv_other') -> 'value' ->> 'blockers' || ' ' || qa.get('admin_done')::text);
