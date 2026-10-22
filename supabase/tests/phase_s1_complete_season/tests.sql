-- Complete Season Phase 1 behavior tests. Disposable local database only.
-- Run as superuser after baseline + later migrations + fixtures.sql +
-- phase_s1. Each check writes a row to qa.results; the runner prints
-- failures and a summary. Dates are relative to the team's real "today"
-- (America/Phoenix), so the suite is valid on any day.
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
CREATE FUNCTION qa.expect_error(p_name text, p_sql text, p_needle text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
    PERFORM qa.check(p_name, false, 'no error raised');
  EXCEPTION WHEN others THEN
    PERFORM qa.check(p_name, position(p_needle in SQLERRM) > 0, SQLERRM);
  END;
END $$;
-- p_sql run as p_role must be refused with "permission denied".
CREATE FUNCTION qa.denied(p_name text, p_role text, p_sql text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE format('SET LOCAL ROLE %I', p_role);
    EXECUTE p_sql;
    RAISE EXCEPTION 'qa_no_error';
  EXCEPTION WHEN others THEN
    PERFORM qa.check(p_name, position('permission denied' in SQLERRM) > 0, SQLERRM);
  END;
END $$;
CREATE FUNCTION qa.put(p_k text, p_v text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO qa.vals VALUES (p_k, p_v) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v $$;
CREATE FUNCTION qa.get(p_k text) RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT v::jsonb FROM qa.vals WHERE k = p_k $$;
CREATE FUNCTION qa.u(p text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT md5(p)::uuid $$;
CREATE FUNCTION qa.coach(p text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$ SELECT jsonb_build_object('coach_id', qa.u(p)) $$;
CREATE FUNCTION qa.admin(p text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$ SELECT jsonb_build_object('platform_admin_id', qa.u(p)) $$;
CREATE FUNCTION qa.prev(p_slug text, p_actor jsonb, p_to text DEFAULT NULL, p_label text DEFAULT NULL) RETURNS jsonb
LANGUAGE sql AS $$ SELECT public.team_season_preview(p_slug, p_actor, p_to, p_label) $$;
CREATE FUNCTION qa.go(p_slug text, p_actor jsonb, p_key text, p_phrase text, p_to text DEFAULT NULL, p_label text DEFAULT NULL) RETURNS jsonb
LANGUAGE sql AS $$ SELECT public.team_season_complete(p_slug, p_actor, p_to, p_label,
  public.team_season_fingerprint(p_slug), qa.u(p_key), p_phrase) $$;
-- New-season ids: the athlete whose previous season was <code>; the
-- member / coach row of account <code> on <slug>.
CREATE FUNCTION qa.na(p_code text) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT id FROM public.athletes WHERE previous_season_athlete_id = qa.u(p_code) $$;
CREATE FUNCTION qa.nm(p_acct text, p_slug text) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT id FROM public.team_members WHERE account_id = qa.u(p_acct) AND campaign_slug = p_slug $$;
CREATE FUNCTION qa.nc(p_acct text, p_slug text) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT id FROM public.team_coaches WHERE account_id = qa.u(p_acct) AND campaign_slug = p_slug $$;
-- Hash of EVERY row of EVERY public table (for "nothing was written").
CREATE FUNCTION qa.dbhash() RETURNS text LANGUAGE plpgsql AS $$
DECLARE t text; h text; acc text := '';
BEGIN
  FOR t IN SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' ORDER BY 1 LOOP
    EXECUTE format('SELECT md5(coalesce(string_agg(x::text, %L ORDER BY x::text), %L)) FROM public.%I x', '|', '', t) INTO h;
    acc := acc || t || '=' || h || ';';
  END LOOP;
  RETURN md5(acc);
END $$;
-- Hash of one team's rows in one table (rows keyed by campaign_slug).
CREATE FUNCTION qa.th(p_table text, p_slug text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE h text;
BEGIN
  EXECUTE format('SELECT md5(coalesce(string_agg(x::text, %L ORDER BY x::text), %L)) FROM public.%I x WHERE x.campaign_slug = %L',
                 '|', '', p_table, p_slug) INTO h;
  RETURN h;
END $$;
-- The old season's history, all in one hash.
CREATE FUNCTION qa.history(p_slug text) RETURNS text LANGUAGE sql AS $$
  SELECT md5(concat_ws('|',
    qa.th('announcements', p_slug), qa.th('message_threads', p_slug), qa.th('donations', p_slug) ,
    qa.th('team_attendance_sessions', p_slug), qa.th('team_attendance_records', p_slug),
    qa.th('sponsors', p_slug), qa.th('team_tasks', p_slug), qa.th('clearance_resources', p_slug),
    qa.th('calendar_events', p_slug), qa.th('fund_uses', p_slug), qa.th('team_products', p_slug),
    qa.th('fundraising_contact_goals', p_slug), qa.th('user_blocks', p_slug),
    qa.th('athletes', p_slug), qa.th('team_members', p_slug), qa.th('team_coaches', p_slug),
    (SELECT md5(coalesce(string_agg(m::text, '|' ORDER BY m::text), '')) FROM public.messages m
      JOIN public.message_threads t ON t.id = m.thread_id AND t.campaign_slug = p_slug),
    (SELECT md5(coalesce(string_agg(p::text, '|' ORDER BY p::text), '')) FROM public.message_thread_participants p
      JOIN public.message_threads t ON t.id = p.thread_id AND t.campaign_slug = p_slug),
    (SELECT md5(coalesce(string_agg(l::text, '|' ORDER BY l::text), '')) FROM public.team_member_athletes l
      JOIN public.team_members m ON m.id = l.team_member_id AND m.campaign_slug = p_slug))) $$;
-- campaign_settings columns whose values differ between two rows.
CREATE FUNCTION qa.diffcols(a jsonb, b jsonb) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(array_agg(k ORDER BY k), '{}') FROM jsonb_object_keys(a) k WHERE a -> k IS DISTINCT FROM b -> k $$;
CREATE FUNCTION qa.cs(p_slug text) RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT to_jsonb(c) FROM public.campaign_settings c WHERE c.campaign_slug = p_slug $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA qa TO PUBLIC;

-- ═══ A. Objects and privileges ═════════════════════════════════════════
SELECT qa.check('A1 team_season_transitions has RLS enabled and no policies',
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'team_season_transitions')
  AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'team_season_transitions'));
SELECT qa.check('A2 anon/authenticated: no privilege of any kind on team_season_transitions',
  NOT EXISTS (SELECT 1 FROM unnest(ARRAY['anon', 'authenticated']) r,
    unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
    WHERE has_table_privilege(r, 'public.team_season_transitions', p)));
SELECT qa.check('A3 service_role: SELECT only on team_season_transitions',
  has_table_privilege('service_role', 'public.team_season_transitions', 'SELECT')
  AND NOT EXISTS (SELECT 1 FROM unnest(ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
    WHERE has_table_privilege('service_role', 'public.team_season_transitions', p)));
SELECT qa.check('A4 dormant: anon, authenticated AND service_role cannot execute any data function (preview, complete, fingerprint, plans, helpers)',
  NOT EXISTS (SELECT 1 FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) r,
    unnest(ARRAY['team_season_preview(text,jsonb,text,text)', 'team_season_complete(text,jsonb,text,text,text,uuid,text)',
                 'team_season_fingerprint(text)', 'team_season_athlete_plan(text)', 'team_season_member_plan(text)',
                 'team_season_actor(jsonb,text)', 'team_season_replay(uuid,text)', 'season_new_join_code()',
                 'team_season_transitions_guard()', 'season_slug_valid(text)', 'season_flag_reason(text)',
                 'season_label_end_year(text)']) f
    WHERE has_function_privilege(r, 'public.' || f, 'EXECUTE')));
SELECT qa.check('A5 pure rules: service_role may execute; anon/authenticated may not',
  (SELECT bool_and(has_function_privilege('service_role', 'public.' || f, 'EXECUTE')
               AND NOT has_function_privilege('anon', 'public.' || f, 'EXECUTE')
               AND NOT has_function_privilege('authenticated', 'public.' || f, 'EXECUTE'))
   FROM unnest(ARRAY['season_next_label(text)', 'season_next_slug(text)', 'season_next_class(text)']) f));
SELECT qa.denied('A6 service_role (the server key) is refused team_season_complete', 'service_role',
  $q$ SELECT public.team_season_complete('lions-track-2027', '{}'::jsonb, NULL, NULL, md5('x'), gen_random_uuid(), 'x') $q$);
SELECT qa.denied('A7 service_role is refused team_season_preview', 'service_role',
  $q$ SELECT public.team_season_preview('lions-track-2027', '{}'::jsonb) $q$);
SELECT qa.denied('A8 anon is refused team_season_complete', 'anon',
  $q$ SELECT public.team_season_complete('lions-track-2027', '{}'::jsonb, NULL, NULL, md5('x'), gen_random_uuid(), 'x') $q$);
SELECT qa.denied('A9 authenticated is refused team_season_preview', 'authenticated',
  $q$ SELECT public.team_season_preview('lions-track-2027', '{}'::jsonb) $q$);
SELECT qa.check('A10 every Phase 1 function pins an empty search_path',
  (SELECT bool_and(array_to_string(proconfig, ',') LIKE '%search_path=""%') FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace AND (proname LIKE 'season\_%' OR proname LIKE 'team\_season\_%')));
SELECT qa.check('A11 only team_season_complete is SECURITY DEFINER among Phase 1 functions; it bounds lock waits (lock_timeout=10s)',
  (SELECT array_agg(proname::text ORDER BY proname) FROM pg_proc WHERE pronamespace = 'public'::regnamespace
     AND (proname LIKE 'season\_%' OR proname LIKE 'team\_season\_%')
     AND proname <> 'season_write_guard'  -- Phase 2's trigger function (owner rights by design)
     AND prosecdef) = ARRAY['team_season_complete']
  AND (SELECT 'lock_timeout=10s' = ANY (proconfig) FROM pg_proc WHERE proname = 'team_season_complete'));
SELECT qa.check('A12 program_id backfilled = team_id for every existing team; NOT NULL with a random default',
  NOT EXISTS (SELECT 1 FROM public.campaign_settings WHERE program_id IS DISTINCT FROM team_id)
  AND (SELECT is_nullable = 'NO' AND column_default = 'gen_random_uuid()' FROM information_schema.columns
       WHERE table_name = 'campaign_settings' AND column_name = 'program_id'));
SELECT qa.check('A13 lineage FKs clear (ON DELETE SET NULL), never cascade or block',
  (SELECT bool_and(confdeltype = 'n') FROM pg_constraint WHERE conname IN
    ('campaign_settings_predecessor_campaign_slug_fkey', 'campaign_settings_successor_campaign_slug_fkey', 'athletes_previous_season_athlete_id_fkey'))
  AND (SELECT count(*) FROM pg_constraint WHERE conname IN
    ('campaign_settings_predecessor_campaign_slug_fkey', 'campaign_settings_successor_campaign_slug_fkey', 'athletes_previous_season_athlete_id_fkey')) = 3);
SELECT qa.expect_error('A14 a team cannot be its own successor',
  $q$ UPDATE public.campaign_settings SET successor_campaign_slug = campaign_slug WHERE campaign_slug = 'other-team-2027' $q$,
  'campaign_settings_not_own_successor');
SELECT qa.expect_error('A15 direct INSERT into team_season_transitions is refused (even for the superuser)',
  $q$ INSERT INTO public.team_season_transitions (idempotency_key, request_hash, program_id, from_campaign_slug, to_campaign_slug,
      from_season_label, to_season_label, preview_fingerprint, actor_kind, actor_name, summary, result)
      VALUES (gen_random_uuid(), md5('x'), gen_random_uuid(), 'a', 'b', 'x', 'y', md5('x'), 'head_coach', 'x', '{}', '{}') $q$,
  'team_season_transitions_write_via_function_only');

-- ═══ B. Rules ═════════════════════════════════════════════════════════
SELECT qa.check('B1 season labels: every supported format advances one year; anything else needs the coach',
  NOT EXISTS (SELECT 1 FROM (VALUES
    ('2027 Season', '2028 Season'), ('2027', '2028'), ('26-27 Season', '27-28 Season'), ('26-27', '27-28'),
    ('2026-27', '2027-28'), ('2026-27 Season', '2027-28 Season'), ('2026-2027 season', '2027-2028 season'),
    ('2026/27 Season', '2027/28 Season'), ('2026 – 27 Season', '2027 – 28 Season'), ('99-00', '00-01'),
    ('2099-00 Season', '2100-01 Season'), ('  2027 SEASON  ', '2028 SEASON'), ('2027  Season', '2028  Season'),
    ('Fall 2027', NULL), ('2027 Spring', NULL), ('Season', NULL), ('', NULL), ('   ', NULL), ('9999', NULL),
    ('27', NULL), ('2027-2028-2029', NULL)) v(i, e)
    WHERE public.season_next_label(v.i) IS DISTINCT FROM v.e)
  AND public.season_next_label(NULL) IS NULL,
  (SELECT string_agg(i || ' -> ' || coalesce(public.season_next_label(i), 'NULL'), '; ') FROM unnest(ARRAY['2027 Season', '26-27 Season', '2026 – 27 Season', '99-00']) i));
SELECT qa.check('B2 slugs: a trailing -YYYY advances; anything else needs the coach',
  NOT EXISTS (SELECT 1 FROM (VALUES
    ('monroe-valley-track-and-field-2027', 'monroe-valley-track-and-field-2028'), ('ab-2027', 'ab-2028'),
    ('team-1999', 'team-2000'), ('paradise-valley-track-field-live', NULL), ('team-2027x', NULL), ('team-27', NULL),
    ('x-9999', NULL), ('2027', NULL), ('Team-2027', NULL), ('-2027', NULL)) v(i, e)
    WHERE public.season_next_slug(v.i) IS DISTINCT FROM v.e)
  AND public.season_next_slug(NULL) IS NULL);
SELECT qa.check('B3 grades: high school advances, seniors graduate, middle school unchanged, the rest unchanged + flagged; case/space-insensitive',
  NOT EXISTS (SELECT 1 FROM (VALUES
    ('Freshman', 'Sophomore', 'advance'), ('Sophomore', 'Junior', 'advance'), ('Junior', 'Senior', 'advance'),
    ('Senior', NULL, 'graduate'), ('  senior ', NULL, 'graduate'), ('FRESHMAN', 'Sophomore', 'advance'), (' junior', 'Senior', 'advance'),
    ('6th Grade', '6th Grade', 'unchanged'), ('7th grade', '7th Grade', 'unchanged'), (' 8TH GRADE ', '8th Grade', 'unchanged'),
    ('Other', 'Other', 'flag'), (' other ', ' other ', 'flag'), ('RS Sophomore', 'RS Sophomore', 'flag'),
    ('', '', 'flag'), ('  ', '  ', 'flag'), ('Senior Captain', 'Senior Captain', 'flag'), ('Fresh man', 'Fresh man', 'flag')) v(i, e, o)
    WHERE (public.season_next_class(v.i)).next_class IS DISTINCT FROM v.e OR (public.season_next_class(v.i)).outcome IS DISTINCT FROM v.o)
  AND (public.season_next_class(NULL)).next_class IS NULL AND (public.season_next_class(NULL)).outcome = 'flag');
SELECT qa.check('B4 flag reasons: blank / other / nonstandard',
  public.season_flag_reason(NULL) = 'blank' AND public.season_flag_reason('  ') = 'blank'
  AND public.season_flag_reason(' OTHER ') = 'other' AND public.season_flag_reason('RS Sophomore') = 'nonstandard');
SELECT qa.check('B5 slug validity: lowercase letters, digits, hyphens, 3-80 chars, starting with a letter or digit',
  public.season_slug_valid('ab-2028') AND public.season_slug_valid(repeat('a', 80)) AND NOT public.season_slug_valid(repeat('a', 81))
  AND NOT public.season_slug_valid('ab') AND NOT public.season_slug_valid('Bad-Slug') AND NOT public.season_slug_valid('-ab')
  AND NOT public.season_slug_valid('a b c') AND NOT public.season_slug_valid(NULL));
SELECT qa.check('B6 join codes: 6 characters from the app alphabet (no 0/O/1/I), unique',
  (SELECT bool_and(c ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$') AND count(DISTINCT c) = 300
   FROM (SELECT public.season_new_join_code() c FROM generate_series(1, 300)) x));

-- ═══ C. Authorization ═════════════════════════════════════════════════
SELECT qa.check('C1 the team''s account-linked Head Coach may preview',
  qa.prev('lions-track-2027', qa.coach('c01')) -> 'actor' ->> 'kind' = 'head_coach');
SELECT qa.check('C2 a platform admin may preview any team',
  qa.prev('lions-track-2027', qa.admin('pa1')) -> 'actor' ->> 'kind' = 'platform_admin');
SELECT qa.expect_error('C3 Assistant Coach refused', $q$ SELECT qa.prev('lions-track-2027', qa.coach('c02')) $q$, 'season_actor_not_authorized');
SELECT qa.expect_error('C4 booster (coach row) refused', $q$ SELECT qa.prev('lions-track-2027', qa.coach('c03')) $q$, 'season_actor_not_authorized');
SELECT qa.expect_error('C5 legacy Head Coach without an account refused with its own code', $q$ SELECT qa.prev('lions-track-2027', qa.coach('c04')) $q$, 'season_actor_account_required');
SELECT qa.expect_error('C6 another team''s Head Coach refused', $q$ SELECT qa.prev('lions-track-2027', qa.coach('c10')) $q$, 'season_actor_not_authorized');
SELECT qa.expect_error('C7 same account''s coach row on a DIFFERENT team refused', $q$ SELECT qa.prev('lions-track-2027', qa.coach('c15')) $q$, 'season_actor_not_authorized');
SELECT qa.expect_error('C8 a member id passed as coach_id refused', $q$ SELECT qa.prev('lions-track-2027', qa.coach('m01')) $q$, 'season_actor_not_authorized');
SELECT qa.expect_error('C9 unknown platform admin refused', $q$ SELECT qa.prev('lions-track-2027', qa.admin('nobody')) $q$, 'season_actor_not_authorized');
SELECT qa.expect_error('C10a actor {} refused', $q$ SELECT qa.prev('lions-track-2027', '{}'::jsonb) $q$, 'season_actor_invalid');
SELECT qa.expect_error('C10b both keys refused', $q$ SELECT qa.prev('lions-track-2027', qa.coach('c01') || qa.admin('pa1')) $q$, 'season_actor_invalid');
SELECT qa.expect_error('C10c extra key refused', $q$ SELECT qa.prev('lions-track-2027', qa.coach('c01') || '{"role":"head_coach"}') $q$, 'season_actor_invalid');
SELECT qa.expect_error('C10d non-uuid refused', $q$ SELECT qa.prev('lions-track-2027', '{"coach_id":"not-a-uuid"}') $q$, 'season_actor_invalid');
SELECT qa.expect_error('C10e array refused', $q$ SELECT qa.prev('lions-track-2027', '[]'::jsonb) $q$, 'season_actor_invalid');
SELECT qa.expect_error('C10f null refused', $q$ SELECT qa.prev('lions-track-2027', NULL) $q$, 'season_actor_invalid');
SELECT qa.expect_error('C11 unknown team', $q$ SELECT qa.prev('no-such-team', qa.admin('pa1')) $q$, 'season_team_not_found');

-- ═══ D. Preview (Lions) ══════════════════════════════════════════════
SELECT qa.put('hash_before_preview', to_jsonb(qa.dbhash())::text);
SELECT qa.put('lions_prev', qa.prev('lions-track-2027', qa.coach('c01'))::text);
SELECT qa.check('D0 preview writes nothing (every row of every table unchanged)',
  qa.dbhash() = qa.get('hash_before_preview') #>> '{}');
SELECT qa.check('D1 proposed: lions-track-2028 / 2028 Season (derived), available; phrase COMPLETE 2027 SEASON',
  qa.get('lions_prev') -> 'proposed' = jsonb_build_object('slug', 'lions-track-2028', 'slug_source', 'derived', 'slug_available', true,
    'season_label', '2028 Season', 'label_source', 'derived', 'confirmation_phrase', 'COMPLETE 2027 SEASON'),
  qa.get('lions_prev') ->> 'proposed');
SELECT qa.check('D2 roster counts: 10 total, 2 graduating (incl. lowercase "senior"), 8 returning; 1 F->S, 1 S->J, 2 J->S (incl. " junior "), 1 middle school',
  (qa.get('lions_prev') -> 'roster') - 'flagged' = jsonb_build_object('total', 10, 'graduating', 2, 'returning', 8,
    'freshman_to_sophomore', 1, 'sophomore_to_junior', 1, 'junior_to_senior', 2, 'unchanged_middle_school', 1),
  (qa.get('lions_prev') -> 'roster') ->> 'total');
SELECT qa.check('D3 flagged grades: blank, Other, nonstandard — with the stored value and reason',
  qa.get('lions_prev') -> 'roster' -> 'flagged' = jsonb_build_array(
    jsonb_build_object('athlete_id', qa.u('s07'), 'name', 'Bree Blank', 'class_year', NULL, 'reason', 'blank'),
    jsonb_build_object('athlete_id', qa.u('s06'), 'name', 'Otto Other', 'class_year', 'Other', 'reason', 'other'),
    jsonb_build_object('athlete_id', qa.u('s08'), 'name', 'Rhys Redshirt', 'class_year', 'RS Sophomore', 'reason', 'nonstandard')),
  qa.get('lions_prev') -> 'roster' ->> 'flagged');
SELECT qa.check('D4 members: 1 athlete, 3 parents (mixed, two-returning, coach-parent), 1 booster carry; graduated/unlinked counted',
  (qa.get('lions_prev') -> 'members') - 'must_rejoin' = jsonb_build_object('athletes_carried', 1, 'parents_carried', 3, 'boosters_carried', 1,
    'athletes_graduated', 1, 'parents_graduates_only', 1, 'unlinked_not_carried', 2, 'parent_links_carried', 4),
  (qa.get('lions_prev') -> 'members') ->> 'parents_carried');
SELECT qa.check('D5 members without accounts are identified for rejoining (athlete, booster, parent)',
  qa.get('lions_prev') -> 'members' -> 'must_rejoin' = jsonb_build_array(
    jsonb_build_object('member_id', qa.u('m03'), 'name', 'Sol Sophomore', 'role', 'athlete'),
    jsonb_build_object('member_id', qa.u('m09'), 'name', 'Lex LegacyBooster', 'role', 'booster'),
    jsonb_build_object('member_id', qa.u('m07'), 'name', 'Nora NoAccount', 'role', 'parent')),
  qa.get('lions_prev') -> 'members' ->> 'must_rejoin');
SELECT qa.check('D6 coaches: head, assistant and booster carry; 2 legacy coaches must rejoin; the actor carries',
  qa.get('lions_prev') -> 'coaches' = jsonb_build_object('head_carried', 1, 'assistant_carried', 1, 'booster_carried', 1, 'actor_carried', true,
    'must_rejoin', jsonb_build_array(jsonb_build_object('coach_id', qa.u('c05'), 'name', 'Ari Legacy Asst', 'role', 'assistant_coach'),
                                     jsonb_build_object('coach_id', qa.u('c04'), 'name', 'Lee Legacy', 'role', 'head_coach'))),
  qa.get('lions_prev') ->> 'coaches');
SELECT qa.check('D7 calendar: 3 events today or later; subscription moves',
  (qa.get('lions_prev') -> 'calendar' ->> 'future_events_to_copy')::int = 3
  AND (qa.get('lions_prev') -> 'calendar' ->> 'subscription_moves')::boolean
  AND (qa.get('lions_prev') -> 'calendar' ->> 'cutoff_local_date')::date = public.team_attendance_today('lions-track-2027'));
SELECT qa.check('D8 configuration copied and history left behind are counted',
  qa.get('lions_prev') -> 'copied' = jsonb_build_object('fund_uses', 2, 'store_products', 2, 'team_contact_goal', true,
    'team_goal_cents', 500000, 'default_athlete_goal_cents', 25000)
  AND qa.get('lions_prev') -> 'left_in_history' = jsonb_build_object('announcements', 1, 'message_threads', 2, 'attendance_sessions', 1,
    'donations', 2, 'team_sponsors', 2, 'todo_tasks', 1, 'clearance_resources', 1),
  qa.get('lions_prev') ->> 'copied');
SELECT qa.check('D9 no blockers; warnings: flagged grades, members/coaches must rejoin, recent donation, attendance drafts frozen',
  qa.get('lions_prev') -> 'blockers' = '[]'::jsonb
  AND qa.get('lions_prev') -> 'warnings' = '["season_flagged_grades","season_members_must_rejoin","season_coaches_must_rejoin","season_recent_donations","season_attendance_drafts_frozen"]'::jsonb,
  (qa.get('lions_prev') ->> 'warnings'));
SELECT qa.check('D10 fingerprint is the team fingerprint (32 hex)',
  qa.get('lions_prev') ->> 'fingerprint' = public.team_season_fingerprint('lions-track-2027')
  AND qa.get('lions_prev') ->> 'fingerprint' ~ '^[0-9a-f]{32}$');

-- ═══ E. Blockers and warnings ════════════════════════════════════════
SELECT qa.check('E1 archived team is blocked',
  qa.prev('archived-team-2027', qa.admin('pa1')) -> 'blockers' = '["season_team_archived"]'::jsonb);
SELECT qa.check('E2 successor slug already exists -> blocked; a coach-chosen free slug clears it',
  qa.prev('taken-2027', qa.coach('c13')) -> 'blockers' = '["season_successor_slug_taken"]'::jsonb
  AND (qa.prev('taken-2027', qa.coach('c13')) -> 'proposed' ->> 'slug_available')::boolean = false
  AND qa.prev('taken-2027', qa.coach('c13'), 'taken-2029') -> 'blockers' = '[]'::jsonb);
SELECT qa.check('E3 slug without a year and an unrecognized label -> both required; supplying them clears it',
  qa.prev('owls-live', qa.coach('c11')) -> 'blockers' = '["season_successor_slug_required","season_label_required"]'::jsonb
  AND qa.prev('owls-live', qa.coach('c11')) -> 'proposed' ->> 'slug_source' = 'required'
  AND qa.prev('owls-live', qa.coach('c11'), 'owls-2028', 'Fall 2028') -> 'blockers' = '[]'::jsonb
  AND qa.prev('owls-live', qa.coach('c11'), 'owls-2028', 'Fall 2028') -> 'proposed' ->> 'label_source' = 'provided');
SELECT qa.check('E4 invalid / too short / same slug are blocked',
  qa.prev('taken-2027', qa.coach('c13'), 'Bad Slug') -> 'blockers' = '["season_successor_slug_invalid"]'::jsonb
  AND qa.prev('taken-2027', qa.coach('c13'), 'ab') -> 'blockers' = '["season_successor_slug_invalid"]'::jsonb
  AND qa.prev('taken-2027', qa.coach('c13'), 'taken-2027') -> 'blockers' = '["season_successor_slug_same"]'::jsonb);
SELECT qa.check('E5 a season label over 40 characters is blocked',
  qa.prev('taken-2027', qa.coach('c13'), 'taken-2029', repeat('x', 41)) -> 'blockers' = '["season_label_invalid"]'::jsonb);
SELECT qa.check('E6 pending athlete request, parent request and live staff invitation block (an expired invitation does not); an open fundraising inquiry only warns',
  qa.prev('bears-hoops-2027', qa.coach('c10')) -> 'blockers' = '["season_pending_athlete_requests","season_pending_parent_requests","season_pending_staff_invitations"]'::jsonb
  AND (qa.prev('bears-hoops-2027', qa.coach('c10')) -> 'open_items' ->> 'pending_staff_invitations')::int = 1
  AND qa.prev('bears-hoops-2027', qa.coach('c10')) -> 'warnings' ? 'season_pending_fundraising_inquiries',
  qa.prev('bears-hoops-2027', qa.coach('c10')) ->> 'blockers');
SELECT qa.check('E7 a team whose only Head Coach has no account is blocked (admin preview)',
  qa.prev('nohead-2027', qa.admin('pa1')) -> 'blockers' = '["season_no_head_coach_carried"]'::jsonb);
SELECT qa.check('E8 mixed formats agree (-2028 + "27-28 Season"); a label year that disagrees with the slug only warns',
  NOT (qa.prev('bears-hoops-2027', qa.coach('c10')) -> 'warnings' ? 'season_label_slug_year_mismatch')
  AND qa.prev('bears-hoops-2027', qa.coach('c10')) -> 'proposed' ->> 'season_label' = '27-28 Season'
  AND qa.prev('lions-track-2027', qa.coach('c01'), NULL, '2030 Season') -> 'warnings' ? 'season_label_slug_year_mismatch'
  AND qa.prev('lions-track-2027', qa.coach('c01'), NULL, '2030 Season') -> 'blockers' = '[]'::jsonb);
SELECT qa.put('hash_before_blocked', to_jsonb(qa.dbhash())::text);
SELECT qa.expect_error('E9 complete on a blocked team raises the first blocker',
  $q$ SELECT qa.go('bears-hoops-2027', qa.coach('c10'), 'k-bears-blocked', 'COMPLETE 26-27 SEASON') $q$, 'season_pending_athlete_requests');
SELECT qa.expect_error('E10 complete on an archived team refused',
  $q$ SELECT qa.go('archived-team-2027', qa.admin('pa1'), 'k-arch', 'COMPLETE 2027 SEASON') $q$, 'season_team_archived');
SELECT qa.expect_error('E11 complete by an Assistant Coach refused',
  $q$ SELECT qa.go('lions-track-2027', qa.coach('c02'), 'k-asst', 'COMPLETE 2027 SEASON') $q$, 'season_actor_not_authorized');
SELECT qa.expect_error('E12 complete by a legacy (account-less) Head Coach refused',
  $q$ SELECT qa.go('lions-track-2027', qa.coach('c04'), 'k-legacy', 'COMPLETE 2027 SEASON') $q$, 'season_actor_account_required');
SELECT qa.check('E13 refused completions wrote nothing', qa.dbhash() = qa.get('hash_before_blocked') #>> '{}');

-- ═══ F. Complete: input validation (Lions) ═══════════════════════════
SELECT qa.expect_error('F1 a fingerprint from another moment -> preview_stale',
  $q$ SELECT public.team_season_complete('lions-track-2027', qa.coach('c01'), NULL, NULL, md5('older'), qa.u('k-f1'), 'COMPLETE 2027 SEASON') $q$, 'season_preview_stale');
SELECT qa.expect_error('F2 missing idempotency key',
  $q$ SELECT public.team_season_complete('lions-track-2027', qa.coach('c01'), NULL, NULL, public.team_season_fingerprint('lions-track-2027'), NULL, 'COMPLETE 2027 SEASON') $q$, 'season_idempotency_key_required');
SELECT qa.expect_error('F3 missing / malformed fingerprint',
  $q$ SELECT public.team_season_complete('lions-track-2027', qa.coach('c01'), NULL, NULL, 'nope', qa.u('k-f3'), 'COMPLETE 2027 SEASON') $q$, 'season_preview_required');
SELECT qa.expect_error('F4 wrong typed confirmation',
  $q$ SELECT qa.go('lions-track-2027', qa.coach('c01'), 'k-f4', 'COMPLETE 2028 SEASON') $q$, 'season_confirmation_mismatch');
SELECT qa.expect_error('F5 empty typed confirmation',
  $q$ SELECT qa.go('lions-track-2027', qa.coach('c01'), 'k-f5', NULL) $q$, 'season_confirmation_mismatch');
SELECT qa.expect_error('F6 unknown team',
  $q$ SELECT qa.go('no-such-team', qa.admin('pa1'), 'k-f6', 'COMPLETE') $q$, 'season_team_not_found');
SELECT qa.check('F7 refused completions wrote nothing', qa.dbhash() = qa.get('hash_before_blocked') #>> '{}');

-- ═══ G. Complete Lions ═══════════════════════════════════════════════
SELECT qa.put('lions_cs_before', qa.cs('lions-track-2027')::text);
SELECT qa.put('lions_history_before', to_jsonb(qa.history('lions-track-2027'))::text);
SELECT qa.put('lions_fp', to_jsonb(public.team_season_fingerprint('lions-track-2027'))::text);
SELECT qa.put('lions_go', qa.go('lions-track-2027', qa.coach('c01'), 'k-lions', '  complete   2027 season ')::text);

SELECT qa.check('G1 result: new team lions-track-2028 / 2028 Season, a 6-character join code, not a replay',
  qa.get('lions_go') ->> 'to_slug' = 'lions-track-2028' AND qa.get('lions_go') ->> 'to_season_label' = '2028 Season'
  AND qa.get('lions_go') ->> 'from_slug' = 'lions-track-2027' AND (qa.get('lions_go') ->> 'replayed')::boolean = false
  AND qa.get('lions_go') ->> 'join_code' ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$',
  qa.get('lions_go')::text);
SELECT qa.check('G2 summary matches the preview',
  qa.get('lions_go') -> 'summary' = jsonb_build_object(
    'athletes_total', 10, 'athletes_graduated', 2, 'athletes_carried', 8, 'freshman_to_sophomore', 1, 'sophomore_to_junior', 1,
    'junior_to_senior', 2, 'unchanged_middle_school', 1, 'athletes_flagged', 3, 'coaches_carried', 3, 'members_carried', 5,
    'members_must_rejoin', 3, 'coaches_must_rejoin', 2, 'parent_links_carried', 4, 'safety_blocks_carried', 2,
    'calendar_events_copied', 3, 'fund_uses_copied', 2, 'store_products_copied', 2, 'team_contact_goal_copied', true,
    'calendar_subscription_moved', true, 'push_subscriptions_moved', 2, 'team_orders_updated', 2),
  qa.get('lions_go') ->> 'summary');
SELECT qa.check('G3 successor settings: everything copied except exactly the reset columns (slug, label, deadline, team_id, CRM link, fundraising, lineage)',
  qa.diffcols(qa.cs('lions-track-2028'), qa.get('lions_cs_before')) = ARRAY['campaign_slug', 'crm_contact_id', 'deadline',
    'fundraising_enabled', 'predecessor_campaign_slug', 'season', 'season_started_at', 'team_id'],
  array_to_string(qa.diffcols(qa.cs('lions-track-2028'), qa.get('lions_cs_before')), ','));
SELECT qa.check('G4 successor resets: deadline cleared, fundraising off, CRM link not copied, new team_id, same program, linked to the old season, active',
  (SELECT deadline = '' AND fundraising_enabled = false AND crm_contact_id IS NULL AND archived = false
     AND team_id <> (qa.get('lions_cs_before') ->> 'team_id')::uuid AND program_id = (qa.get('lions_cs_before') ->> 'program_id')::uuid
     AND predecessor_campaign_slug = 'lions-track-2027' AND successor_campaign_slug IS NULL AND season_completed_at IS NULL
     AND season_started_at = (qa.get('lions_go') ->> 'completed_at')::timestamptz AND season = '2028 Season'
     AND goal_cents = 500000 AND default_athlete_goal_cents = 25000 AND organization_id = qa.u('org1')
     AND allow_coach_fundraising AND branding_customized AND NOT show_sponsors AND layout_variant = 'premium'
     AND theme_button_color = '#040404' AND external_store_url = 'https://store.example.test/lions'
   FROM public.campaign_settings WHERE campaign_slug = 'lions-track-2028'));
SELECT qa.check('G5 old season: only archived, completed time and successor changed',
  qa.diffcols(qa.cs('lions-track-2027'), qa.get('lions_cs_before')) = ARRAY['archived', 'season_completed_at', 'successor_campaign_slug']
  AND (SELECT archived AND successor_campaign_slug = 'lions-track-2028'
       AND season_completed_at = (qa.get('lions_go') ->> 'completed_at')::timestamptz
       FROM public.campaign_settings WHERE campaign_slug = 'lions-track-2027'));
SELECT qa.check('G6 returning athletes with advanced grades; seniors not copied; flagged grades kept exactly',
  (SELECT count(*) FROM public.athletes WHERE campaign_slug = 'lions-track-2028') = 8
  AND (SELECT class_year FROM public.athletes WHERE id = qa.na('s02')) = 'Senior'
  AND (SELECT class_year FROM public.athletes WHERE id = qa.na('s03')) = 'Junior'
  AND (SELECT class_year FROM public.athletes WHERE id = qa.na('s04')) = 'Sophomore'
  AND (SELECT class_year FROM public.athletes WHERE id = qa.na('s05')) = '8th Grade'
  AND (SELECT class_year FROM public.athletes WHERE id = qa.na('s06')) = 'Other'
  AND (SELECT class_year IS NULL FROM public.athletes WHERE id = qa.na('s07'))
  AND (SELECT class_year FROM public.athletes WHERE id = qa.na('s08')) = 'RS Sophomore'
  AND (SELECT class_year FROM public.athletes WHERE id = qa.na('s10')) = 'Senior'
  AND qa.na('s01') IS NULL AND qa.na('s09') IS NULL);
SELECT qa.check('G7 a carried athlete keeps name, event, jersey, grad year, photo and contacts; personal goal resets; linked to last season',
  (SELECT a.name = 'Jo Junior' AND a.event = '200m' AND a.jersey_number = 2 AND a.grad_year = 2028 AND a.profile_photo = 'p/s02.jpg'
     AND a.contact_phone = '555-0002' AND a.contact_email = 's02@example.test' AND a.goal_cents IS NULL
     AND a.previous_season_athlete_id = qa.u('s02') AND a.created_at = (qa.get('lions_go') ->> 'completed_at')::timestamptz
   FROM public.athletes a WHERE a.id = qa.na('s02')));
SELECT qa.check('G8 coaches: head, assistant and booster with accounts copied (placeholder password, fresh salt); legacy coaches not',
  (SELECT array_agg(role || ':' || name ORDER BY role) FROM public.team_coaches WHERE campaign_slug = 'lions-track-2028')
    = ARRAY['assistant_coach:Avi Assistant', 'booster:Bo Booster', 'head_coach:Hana Head']
  AND (SELECT bool_and(password_hash = 'unused' AND salt ~ '^[0-9a-f]{32}$' AND account_id IS NOT NULL)
       FROM public.team_coaches WHERE campaign_slug = 'lions-track-2028')
  AND (SELECT count(DISTINCT salt) FROM public.team_coaches WHERE campaign_slug = 'lions-track-2028') = 3);
SELECT qa.check('G9 members: returning athlete, mixed parent, two-child parent, coach-parent and booster carried; nobody else',
  (SELECT array_agg(role || ':' || name ORDER BY role, name) FROM public.team_members WHERE campaign_slug = 'lions-track-2028')
    = ARRAY['athlete:Jo Junior', 'booster:Bay Booster', 'parent:Hana Head', 'parent:Pat Mixed', 'parent:Two Returning']
  AND (SELECT bool_and(salt ~ '^[0-9a-f]{32}$') FROM public.team_members WHERE campaign_slug = 'lions-track-2028'));
SELECT qa.check('G10 returning athlete account: new member row claims the new athlete record; old claim intact',
  (SELECT athlete_id FROM public.team_members WHERE id = qa.nm('a04', 'lions-track-2028')) = qa.na('s02')
  AND (SELECT athlete_id FROM public.team_members WHERE id = qa.u('m01')) = qa.u('s02')
  AND (SELECT array_agg(campaign_slug ORDER BY campaign_slug) FROM public.team_members WHERE account_id = qa.u('a04'))
      = ARRAY['lions-track-2027', 'lions-track-2028']);
SELECT qa.check('G11 parents see exactly their returning children (legacy athlete_id + links, the app''s union)',
  (SELECT array_agg(x ORDER BY x) FROM (
     SELECT athlete_id x FROM public.team_members WHERE id = qa.nm('a06', 'lions-track-2028') AND athlete_id IS NOT NULL
     UNION SELECT athlete_id FROM public.team_member_athletes WHERE team_member_id = qa.nm('a06', 'lions-track-2028')) s)
    = ARRAY[qa.na('s03')]
  AND (SELECT array_agg(x ORDER BY x) FROM (
     SELECT athlete_id x FROM public.team_members WHERE id = qa.nm('a08', 'lions-track-2028') AND athlete_id IS NOT NULL
     UNION SELECT athlete_id FROM public.team_member_athletes WHERE team_member_id = qa.nm('a08', 'lions-track-2028')) s)
    = (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY[qa.na('s02'), qa.na('s04')]) x)
  AND (SELECT athlete_id IS NULL FROM public.team_members WHERE id = qa.nm('a06', 'lions-track-2028'))
  AND (SELECT count(*) FROM public.team_member_athletes l JOIN public.team_members m ON m.id = l.team_member_id
       WHERE m.campaign_slug = 'lions-track-2028') = 4);
SELECT qa.check('G12 Head Coach who is also a parent keeps BOTH roles on the new team',
  qa.nc('a01', 'lions-track-2028') IS NOT NULL AND qa.nm('a01', 'lions-track-2028') IS NOT NULL
  AND (SELECT athlete_id FROM public.team_member_athletes WHERE team_member_id = qa.nm('a01', 'lions-track-2028')) = qa.na('s05'));
SELECT qa.check('G13 graduated athlete / graduating-only parent / account-less people keep only the old season',
  (SELECT count(*) FROM public.team_members WHERE account_id IN (qa.u('a05'), qa.u('a07'), qa.u('a10'), qa.u('a11')) AND campaign_slug = 'lions-track-2028') = 0
  AND (SELECT count(*) FROM public.team_members WHERE account_id IN (qa.u('a05'), qa.u('a07')) AND campaign_slug = 'lions-track-2027') = 2);
SELECT qa.check('G14 safety blocks carried (translated to new rows; admin id unchanged); blocks involving people who don''t carry are not',
  (SELECT array_agg(blocker_kind || '>' || blocked_kind ORDER BY blocker_kind) FROM public.user_blocks WHERE campaign_slug = 'lions-track-2028')
    = ARRAY['member>member', 'platform_admin>member']
  AND EXISTS (SELECT 1 FROM public.user_blocks WHERE campaign_slug = 'lions-track-2028' AND blocker_id = qa.nm('a04', 'lions-track-2028') AND blocked_id = qa.nm('a08', 'lions-track-2028'))
  AND EXISTS (SELECT 1 FROM public.user_blocks WHERE campaign_slug = 'lions-track-2028' AND blocker_id = qa.u('pa1') AND blocked_id = qa.nm('a09', 'lions-track-2028')));
SELECT qa.check('G15 future calendar events copied (today onward) with full details; coaches mapped or cleared; originals kept',
  (SELECT array_agg(title ORDER BY event_date) FROM public.calendar_events WHERE campaign_slug = 'lions-track-2028')
    = ARRAY['Today practice', 'Future meet', 'Legacy coach event']
  AND (SELECT coach_id = qa.nc('a02', 'lions-track-2028') AND description = 'today' AND start_time = '15:00' AND end_time = '17:00' AND location = 'Field'
       FROM public.calendar_events WHERE campaign_slug = 'lions-track-2028' AND title = 'Today practice')
  AND (SELECT coach_id = qa.nc('a01', 'lions-track-2028') FROM public.calendar_events WHERE campaign_slug = 'lions-track-2028' AND title = 'Future meet')
  AND (SELECT coach_id IS NULL FROM public.calendar_events WHERE campaign_slug = 'lions-track-2028' AND title = 'Legacy coach event')
  AND (SELECT count(*) FROM public.calendar_events WHERE campaign_slug = 'lions-track-2027') = 5);
SELECT qa.check('G16 fund uses and store products copied (display order, visibility, cost kept); team contact goal copied; per-athlete goals not',
  (SELECT array_agg(title || ':' || icon || ':' || sort_order ORDER BY sort_order) FROM public.fund_uses WHERE campaign_slug = 'lions-track-2028')
    = ARRAY['Uniforms:👕:1', 'Travel:🚌:2']
  AND (SELECT array_agg(name || ':' || display_order || ':' || visible || ':' || coalesce(cost_cents, -1) || ':' || category ORDER BY display_order)
       FROM public.team_products WHERE campaign_slug = 'lions-track-2028') = ARRAY['Cap:1:false:-1:general', 'Hoodie:2:true:2000:apparel']
  AND (SELECT count(*) = 1 AND min(goal) = 12 AND bool_and(athlete_id IS NULL) AND bool_and(set_by_coach_id = qa.nc('a01', 'lions-track-2028'))
       FROM public.fundraising_contact_goals WHERE campaign_slug = 'lions-track-2028'));
SELECT qa.check('G17 join codes: old code revoked; new active code issued for the new season',
  (SELECT revoked FROM public.team_join_codes WHERE campaign_slug = 'lions-track-2027')
  AND (SELECT code = qa.get('lions_go') ->> 'join_code' AND NOT revoked FROM public.team_join_codes WHERE campaign_slug = 'lions-track-2028'));
SELECT qa.check('G18 the active calendar feed moved to the new season (same row, same URL); the revoked one stayed',
  (SELECT campaign_slug FROM public.calendar_subscription_tokens WHERE id = qa.u('ct1')) = 'lions-track-2028'
  AND (SELECT campaign_slug FROM public.calendar_subscription_tokens WHERE id = qa.u('ct2')) = 'lions-track-2027');
SELECT qa.check('G19 web push: carried member and coach subscriptions follow them; others stay',
  (SELECT campaign_slug = 'lions-track-2028' AND member_id = qa.nm('a04', 'lions-track-2028') FROM public.push_subscriptions WHERE id = qa.u('ps1'))
  AND (SELECT campaign_slug = 'lions-track-2028' AND coach_id = qa.nc('a01', 'lions-track-2028') FROM public.push_subscriptions WHERE id = qa.u('ps3'))
  AND (SELECT campaign_slug = 'lions-track-2027' AND member_id = qa.u('m02') FROM public.push_subscriptions WHERE id = qa.u('ps2'))
  AND (SELECT campaign_slug = 'lions-track-2027' FROM public.push_subscriptions WHERE id = qa.u('ps4')));
SELECT qa.check('G20 team switcher order: new season inserted just before the old one for carried accounts only',
  (SELECT team_slugs FROM public.account_team_order WHERE account_id = qa.u('a01')) = ARRAY['other-team-2027', 'lions-track-2028', 'lions-track-2027']
  AND (SELECT team_slugs FROM public.account_team_order WHERE account_id = qa.u('a06')) = ARRAY['lions-track-2028', 'lions-track-2027']
  AND (SELECT team_slugs FROM public.account_team_order WHERE account_id = qa.u('a05')) = ARRAY['lions-track-2027']);
SELECT qa.check('G21 sponsors, To-Do tasks and clearance resources stay in the old season only (not renewed, fresh To-Do)',
  (SELECT count(*) FROM public.sponsors WHERE campaign_slug = 'lions-track-2028') = 0
  AND (SELECT count(*) FROM public.team_tasks WHERE campaign_slug = 'lions-track-2028') = 0
  AND (SELECT count(*) FROM public.clearance_resources WHERE campaign_slug = 'lions-track-2028') = 0
  AND (SELECT count(*) FROM public.sponsors WHERE campaign_slug = 'lions-track-2027') = 2);
SELECT qa.check('G22 old season history unchanged: announcements, messages, participants, attendance, donations, sponsors, To-Do, clearance, calendar, roster, links',
  qa.history('lions-track-2027') = (qa.get('lions_history_before') #>> '{}'),
  'calendar/fund uses/products/goals are copies; originals must be unchanged too');
SELECT qa.check('G23 old messages remain readable: threads are NOT hidden with archived_at',
  (SELECT count(*) FILTER (WHERE archived_at IS NULL) FROM public.message_threads WHERE campaign_slug = 'lions-track-2027') = 2);
SELECT qa.check('G24 new fundraising totals and leaderboard start at zero; old totals intact',
  (SELECT count(*) FROM public.donations WHERE campaign_slug = 'lions-track-2028') = 0
  AND (SELECT sum(amount_cents) FROM public.donations WHERE campaign_slug = 'lions-track-2027') = 7500);
INSERT INTO public.donations (donor_name, amount, amount_cents, campaign_slug, athlete_id, stripe_session_id)
  VALUES ('Late Webhook', 10, 1000, 'lions-track-2027', qa.u('s02'), 'cs_test_late_1');
SELECT qa.check('G25 a late Stripe webhook donation still records against the old season and its athlete; the new season stays at $0',
  (SELECT sum(amount_cents) FROM public.donations WHERE campaign_slug = 'lions-track-2027') = 8500
  AND (SELECT count(*) FROM public.donations WHERE campaign_slug = 'lions-track-2028') = 0
  AND (SELECT athlete_id FROM public.donations WHERE stripe_session_id = 'cs_test_late_1') = qa.u('s02'));
SELECT qa.check('G26 audit record: one row, actor snapshot, flagged athlete ids, counts only, the exact returned result',
  (SELECT count(*) FROM public.team_season_transitions WHERE from_campaign_slug = 'lions-track-2027') = 1
  AND (SELECT actor_kind = 'head_coach' AND actor_coach_id = qa.u('c01') AND actor_account_id = qa.u('a01') AND actor_platform_admin_id IS NULL
          AND actor_name = 'Hana Head' AND to_campaign_slug = 'lions-track-2028' AND from_season_label = '2027 Season'
          AND to_season_label = '2028 Season' AND idempotency_key = qa.u('k-lions') AND request_hash ~ '^[0-9a-f]{32}$'
          AND preview_fingerprint = qa.get('lions_fp') #>> '{}'
          AND flagged_athlete_ids = (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY[qa.u('s06'), qa.u('s07'), qa.u('s08')]) x)
          AND summary = qa.get('lions_go') -> 'summary' AND result = qa.get('lions_go') - 'replayed'
          AND id = (qa.get('lions_go') ->> 'transition_id')::uuid
          AND summary::text NOT LIKE '%Jo Junior%' AND result::text NOT LIKE '%Hana%'
       FROM public.team_season_transitions WHERE from_campaign_slug = 'lions-track-2027'));
SELECT qa.check('G27 the transaction-local write flag is not left on',
  current_setting('elf.season_transition', true) IS DISTINCT FROM 'on');
SELECT qa.expect_error('G28 audit rows cannot be edited', $q$ UPDATE public.team_season_transitions SET actor_name = 'x' $q$, 'team_season_transitions_immutable');
SELECT qa.expect_error('G29 audit rows cannot be deleted', $q$ DELETE FROM public.team_season_transitions $q$, 'team_season_transitions_immutable');
SELECT qa.expect_error('G30 audit table cannot be truncated', $q$ TRUNCATE public.team_season_transitions $q$, 'team_season_transitions_immutable');
DO $$
BEGIN
  BEGIN
    PERFORM set_config('elf.season_transition', 'on', true);
    INSERT INTO public.team_season_transitions (idempotency_key, request_hash, program_id, from_campaign_slug, to_campaign_slug,
      from_season_label, to_season_label, preview_fingerprint, actor_kind, actor_name, summary, result)
    VALUES (gen_random_uuid(), md5('x'), gen_random_uuid(), 'lions-track-2027', 'zz-9999', 'x', 'y', md5('x'), 'head_coach', 'x', '{}', '{}');
    PERFORM qa.check('G31 one audit record per completed season (unique from_campaign_slug)', false, 'second row accepted');
  EXCEPTION WHEN unique_violation THEN
    PERFORM qa.check('G31 one audit record per completed season (unique from_campaign_slug)', SQLERRM LIKE '%team_season_transitions_from_key%', SQLERRM);
  END;
END $$;

-- ═══ H. Repeat protection ════════════════════════════════════════════
SELECT qa.put('hash_after_lions', to_jsonb(qa.dbhash())::text);
SELECT qa.put('lions_replay', public.team_season_complete('lions-track-2027', qa.coach('c01'), NULL, NULL,
  qa.get('lions_fp') #>> '{}', qa.u('k-lions'), 'COMPLETE 2027 SEASON')::text);
SELECT qa.check('H1 the same request again (double click / network retry) returns the identical stored result, marked replayed, and writes nothing',
  (qa.get('lions_replay') ->> 'replayed')::boolean AND qa.get('lions_replay') - 'replayed' = qa.get('lions_go') - 'replayed'
  AND qa.dbhash() = qa.get('hash_after_lions') #>> '{}');
SELECT qa.expect_error('H2 the same key with a different request is refused',
  $q$ SELECT public.team_season_complete('lions-track-2027', qa.coach('c01'), 'lions-track-2099', NULL, qa.get('lions_fp') #>> '{}', qa.u('k-lions'), 'COMPLETE 2027 SEASON') $q$,
  'season_idempotency_conflict');
SELECT qa.expect_error('H3 a new key on a completed season is refused (no second successor)',
  $q$ SELECT qa.go('lions-track-2027', qa.coach('c01'), 'k-lions-again', 'COMPLETE 2027 SEASON', 'lions-track-2099') $q$, 'season_already_completed');
SELECT qa.check('H4 preview of a completed season reports it (and points at the successor)',
  qa.prev('lions-track-2027', qa.admin('pa1')) -> 'blockers' ? 'season_already_completed'
  AND qa.prev('lions-track-2027', qa.admin('pa1')) -> 'from' ->> 'successor_slug' = 'lions-track-2028');
SELECT qa.check('H5 refused repeats wrote nothing; still exactly one successor', qa.dbhash() = qa.get('hash_after_lions') #>> '{}'
  AND (SELECT count(*) FROM public.campaign_settings WHERE predecessor_campaign_slug = 'lions-track-2027') = 1);

-- ═══ I. Platform admin completes Bears (mixed academic-year label) ════
UPDATE public.pending_athlete_requests SET status = 'approved' WHERE id = qa.u('pr1');
UPDATE public.parent_access_requests SET status = 'declined' WHERE id = qa.u('pr2');
UPDATE public.team_staff_invitations SET revoked_at = now() WHERE id = qa.u('pr3');
SELECT qa.put('bears_go', qa.go('bears-hoops-2027', qa.admin('pa1'), 'k-bears', 'complete 26-27 season')::text);
SELECT qa.check('I1 once requests/invitations are resolved, a platform admin completes it: bears-hoops-2028 / 27-28 Season',
  qa.get('bears_go') ->> 'to_slug' = 'bears-hoops-2028' AND qa.get('bears_go') ->> 'to_season_label' = '27-28 Season');
SELECT qa.check('I2 audit records the platform admin (account, no coach id)',
  (SELECT actor_kind = 'platform_admin' AND actor_platform_admin_id = qa.u('pa1') AND actor_account_id = qa.u('a20')
     AND actor_coach_id IS NULL AND actor_name = 'Person a20'
   FROM public.team_season_transitions WHERE from_campaign_slug = 'bears-hoops-2027'));
SELECT qa.check('I3 Bears roster: the Junior is now a Senior, claimed by the same account; Head Coach carried',
  (SELECT class_year FROM public.athletes WHERE id = qa.na('s20')) = 'Senior'
  AND (SELECT athlete_id FROM public.team_members WHERE id = qa.nm('a16', 'bears-hoops-2028')) = qa.na('s20')
  AND qa.nc('a12', 'bears-hoops-2028') IS NOT NULL);

-- ═══ J. Coach-chosen slug and label (Owls) ═══════════════════════════
SELECT qa.check('J0 confirmation phrase uses the current label ("Fall" -> COMPLETE FALL)',
  qa.prev('owls-live', qa.coach('c11'), 'owls-2028', 'Fall 2028') -> 'proposed' ->> 'confirmation_phrase' = 'COMPLETE FALL');
SELECT qa.put('owls_go', qa.go('owls-live', qa.coach('c11'), 'k-owls', 'COMPLETE FALL', 'owls-2028', 'Fall 2028')::text);
SELECT qa.check('J1 a team without a year in its slug completes with the coach''s slug and label',
  qa.get('owls_go') ->> 'to_slug' = 'owls-2028' AND qa.get('owls_go') ->> 'to_season_label' = 'Fall 2028'
  AND (SELECT class_year FROM public.athletes WHERE id = qa.na('s21')) = 'Sophomore'
  AND (SELECT season FROM public.campaign_settings WHERE campaign_slug = 'owls-2028') = 'Fall 2028');

-- ═══ K. A second transition on the same program (chain) ══════════════
SELECT qa.put('lions2_go', qa.go('lions-track-2028', jsonb_build_object('coach_id', qa.nc('a01', 'lions-track-2028')), 'k-lions-2', 'COMPLETE 2028 SEASON')::text);
SELECT qa.check('K1 the new season completes in turn: 2027 -> 2028 -> 2029, one program, linked both ways',
  qa.get('lions2_go') ->> 'to_slug' = 'lions-track-2029' AND qa.get('lions2_go') ->> 'to_season_label' = '2029 Season'
  AND (SELECT count(DISTINCT program_id) FROM public.campaign_settings WHERE campaign_slug LIKE 'lions-track-20%') = 1
  AND (SELECT successor_campaign_slug FROM public.campaign_settings WHERE campaign_slug = 'lions-track-2028') = 'lions-track-2029'
  AND (SELECT predecessor_campaign_slug FROM public.campaign_settings WHERE campaign_slug = 'lions-track-2029') = 'lions-track-2028');
SELECT qa.check('K2 athletes advance again (2027 Junior -> 2028 Senior -> graduates); identity chain follows a sophomore over two seasons',
  (SELECT count(*) FROM public.athletes WHERE previous_season_athlete_id = qa.na('s02')) = 0
  AND (SELECT a3.class_year FROM public.athletes a3 WHERE a3.previous_season_athlete_id = qa.na('s03')) = 'Senior'
  AND (SELECT count(*) FROM public.athletes WHERE campaign_slug = 'lions-track-2029') = 6);
SELECT qa.expect_error('K3 an old record can advance only once',
  $q$ INSERT INTO public.athletes (campaign_slug, name, previous_season_athlete_id) VALUES ('lions-track-2029', 'Dup', qa.u('s03')) $q$,
  'athletes_previous_season_uniq');
SELECT qa.expect_error('K4 a season can have only one successor',
  $q$ UPDATE public.campaign_settings SET successor_campaign_slug = 'lions-track-2029' WHERE campaign_slug = 'taken-2027' $q$,
  'campaign_settings_successor_uniq');

-- ═══ L. Failure part-way rolls everything back ═══════════════════════
INSERT INTO public.elf_accounts (id, email, password_hash, salt, name) VALUES (qa.u('rb-acct'), 'rb@example.test', 'x', 'x', 'RB Coach'), (qa.u('mut-acct'), 'mut@example.test', 'x', 'x', 'Mut Coach'),
  (qa.u('st-acct'), 'st@example.test', 'x', 'x', 'Stale Coach'), (qa.u('del-acct'), 'del@example.test', 'x', 'x', 'Del Coach');
INSERT INTO public.campaign_settings (campaign_slug, school_name, sport_name, season) VALUES
  ('rb-2027', 'RB HS', 'Track', '2027 Season'), ('mut-2027', 'Mut HS', 'Track', '2027 Season'),
  ('stale-2027', 'Stale HS', 'Track', '2027 Season'), ('del-2027', 'Del HS', 'Track', '2027 Season');
INSERT INTO public.team_coaches (id, campaign_slug, name, email, role, password_hash, salt, account_id) VALUES
  (qa.u('c-rb'), 'rb-2027', 'RB Coach', 'rb@example.test', 'head_coach', 'unused', 'x', qa.u('rb-acct')),
  (qa.u('c-mut'), 'mut-2027', 'Mut Coach', 'mut@example.test', 'head_coach', 'unused', 'x', qa.u('mut-acct')),
  (qa.u('c-st'), 'stale-2027', 'Stale Coach', 'st@example.test', 'head_coach', 'unused', 'x', qa.u('st-acct')),
  (qa.u('c-del'), 'del-2027', 'Del Coach', 'del@example.test', 'head_coach', 'unused', 'x', qa.u('del-acct'));
INSERT INTO public.athletes (id, campaign_slug, name, class_year)
  SELECT qa.u(s || i), s || '-2027', 'Ath ' || i, (ARRAY['Freshman', 'Sophomore', 'Junior', 'Senior'])[i]
  FROM unnest(ARRAY['rb', 'mut', 'stale', 'del']) s, generate_series(1, 4) i;
INSERT INTO public.fund_uses (campaign_slug, title, description) VALUES ('mut-2027', 'Gear', 'Gear');
INSERT INTO public.team_join_codes (campaign_slug, code) VALUES ('rb-2028', 'RBTEST');   -- makes step 11 fail late

SELECT qa.put('hash_before_rb', to_jsonb(qa.dbhash())::text);
SELECT qa.expect_error('L1 a failure late in the transition (join code step) aborts it',
  $q$ SELECT qa.go('rb-2027', qa.coach('c-rb'), 'k-rb', 'COMPLETE 2027 SEASON') $q$, 'team_join_codes_campaign_slug_key');
SELECT qa.check('L2 ...and nothing at all was written (no successor, athletes, members, coaches, audit row; old season untouched)',
  qa.dbhash() = qa.get('hash_before_rb') #>> '{}'
  AND NOT EXISTS (SELECT 1 FROM public.campaign_settings WHERE campaign_slug = 'rb-2028')
  AND NOT EXISTS (SELECT 1 FROM public.team_season_transitions WHERE from_campaign_slug = 'rb-2027'));
SELECT qa.check('L3 the same key works once the cause is fixed (a failed attempt is never recorded as done)',
  (SELECT count(*) FROM public.team_season_transitions WHERE idempotency_key = qa.u('k-rb')) = 0);
DELETE FROM public.team_join_codes WHERE campaign_slug = 'rb-2028';
SELECT qa.check('L4 retry with the same key after fixing it succeeds',
  qa.go('rb-2027', qa.coach('c-rb'), 'k-rb', 'COMPLETE 2027 SEASON') ->> 'to_slug' = 'rb-2028');

-- A roster change that lands DURING the transition (simulated by a trigger
-- that edits the old roster while the copy is running) is caught by the
-- final fingerprint check.
CREATE FUNCTION qa.mutate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.athletes SET class_year = 'Senior' WHERE campaign_slug = 'mut-2027' AND class_year = 'Freshman';
  RETURN NEW;
END $$;
CREATE TRIGGER qa_mutate AFTER INSERT ON public.fund_uses FOR EACH ROW WHEN (NEW.campaign_slug = 'mut-2028') EXECUTE FUNCTION qa.mutate();
SELECT qa.put('hash_before_mut', to_jsonb(qa.dbhash())::text);
SELECT qa.expect_error('L5 a roster change during the transition aborts it',
  $q$ SELECT qa.go('mut-2027', qa.coach('c-mut'), 'k-mut', 'COMPLETE 2027 SEASON') $q$, 'season_roster_changed_during_transition');
SELECT qa.check('L6 ...and nothing was written (including the in-flight roster edit)', qa.dbhash() = qa.get('hash_before_mut') #>> '{}');
DROP TRIGGER qa_mutate ON public.fund_uses;

-- ═══ M. Stale previews ═══════════════════════════════════════════════
SELECT qa.put('st_fp', to_jsonb(public.team_season_fingerprint('stale-2027'))::text);
UPDATE public.athletes SET class_year = 'Junior' WHERE id = qa.u('stale1');
SELECT qa.expect_error('M1 a grade edited after the preview -> preview_stale',
  $q$ SELECT public.team_season_complete('stale-2027', qa.coach('c-st'), NULL, NULL, qa.get('st_fp') #>> '{}', qa.u('k-st1'), 'COMPLETE 2027 SEASON') $q$, 'season_preview_stale');
SELECT qa.put('st_fp', to_jsonb(public.team_season_fingerprint('stale-2027'))::text);
INSERT INTO public.athletes (campaign_slug, name, class_year) VALUES ('stale-2027', 'Late Add', 'Junior');
SELECT qa.expect_error('M2 an athlete added after the preview -> preview_stale',
  $q$ SELECT public.team_season_complete('stale-2027', qa.coach('c-st'), NULL, NULL, qa.get('st_fp') #>> '{}', qa.u('k-st2'), 'COMPLETE 2027 SEASON') $q$, 'season_preview_stale');
SELECT qa.put('st_fp', to_jsonb(public.team_season_fingerprint('stale-2027'))::text);
INSERT INTO public.team_members (campaign_slug, role, name, salt, account_id) VALUES ('stale-2027', 'booster', 'Late Booster', 'x', qa.u('a13'));
SELECT qa.expect_error('M3 a member added after the preview -> preview_stale',
  $q$ SELECT public.team_season_complete('stale-2027', qa.coach('c-st'), NULL, NULL, qa.get('st_fp') #>> '{}', qa.u('k-st3'), 'COMPLETE 2027 SEASON') $q$, 'season_preview_stale');
SELECT qa.put('st_fp', to_jsonb(public.team_season_fingerprint('stale-2027'))::text);
INSERT INTO public.calendar_events (campaign_slug, title, event_date) VALUES ('stale-2027', 'New', public.team_attendance_today('stale-2027') + 3);
SELECT qa.expect_error('M4 a future event added after the preview -> preview_stale',
  $q$ SELECT public.team_season_complete('stale-2027', qa.coach('c-st'), NULL, NULL, qa.get('st_fp') #>> '{}', qa.u('k-st4'), 'COMPLETE 2027 SEASON') $q$, 'season_preview_stale');
SELECT qa.put('st_fp', to_jsonb(public.team_season_fingerprint('stale-2027'))::text);
UPDATE public.athletes SET name = 'Renamed' WHERE id = qa.u('stale2');
DO $$ BEGIN
  PERFORM qa.put('st_go', public.team_season_complete('stale-2027', qa.coach('c-st'), NULL, NULL, qa.get('st_fp') #>> '{}', qa.u('k-st5'), 'COMPLETE 2027 SEASON')::text);
EXCEPTION WHEN others THEN PERFORM qa.put('st_go', to_jsonb(SQLERRM)::text);
END $$;
SELECT qa.check('M5 a name edit does not invalidate the preview, and the new season gets the current name',
  qa.get('st_go') ->> 'to_slug' = 'stale-2028'
  AND (SELECT name FROM public.athletes WHERE previous_season_athlete_id = qa.u('stale2')) = 'Renamed',
  qa.get('st_go')::text);

-- ═══ N. A large team (2,000 athletes, 2,000 athlete accounts, 400 parents)
INSERT INTO public.elf_accounts (id, email, password_hash, salt, name)
  SELECT qa.u('big-acct-' || i), 'big' || i || '@example.test', 'x', 'x', 'Big ' || i FROM generate_series(1, 2401) i;
INSERT INTO public.campaign_settings (campaign_slug, school_name, sport_name, season) VALUES ('big-2027', 'Big HS', 'Track', '2027 Season');
INSERT INTO public.team_coaches (id, campaign_slug, name, email, role, password_hash, salt, account_id)
  VALUES (qa.u('c-big'), 'big-2027', 'Big Coach', 'bigcoach@example.test', 'head_coach', 'unused', 'x', qa.u('big-acct-2401'));
INSERT INTO public.athletes (id, campaign_slug, name, class_year)
  SELECT qa.u('big-ath-' || i), 'big-2027', 'Athlete ' || i, (ARRAY['Freshman', 'Sophomore', 'Junior', 'Senior'])[(i % 4) + 1]
  FROM generate_series(1, 2000) i;
INSERT INTO public.team_members (id, campaign_slug, role, name, athlete_id, salt, account_id)
  SELECT qa.u('big-mem-' || i), 'big-2027', 'athlete', 'Athlete ' || i, qa.u('big-ath-' || i), 'x', qa.u('big-acct-' || i)
  FROM generate_series(1, 2000) i;
INSERT INTO public.team_members (id, campaign_slug, role, name, salt, account_id)
  SELECT qa.u('big-par-' || i), 'big-2027', 'parent', 'Parent ' || i, 'x', qa.u('big-acct-' || (2000 + i)) FROM generate_series(1, 400) i;
INSERT INTO public.team_member_athletes (team_member_id, athlete_id)
  SELECT qa.u('big-par-' || i), qa.u('big-ath-' || (2 * i + k)) FROM generate_series(1, 400) i, generate_series(0, 1) k;
ANALYZE;
SELECT qa.put('timing_start', to_jsonb(clock_timestamp())::text);
SELECT qa.put('big_prev', qa.prev('big-2027', qa.coach('c-big'))::text);
SELECT qa.put('timing preview (2,000 athletes)', to_jsonb(round(extract(epoch FROM clock_timestamp() - (qa.get('timing_start') #>> '{}')::timestamptz) * 1000) || ' ms')::text);
SELECT qa.put('timing_start', to_jsonb(clock_timestamp())::text);
SELECT qa.put('big_go', qa.go('big-2027', qa.coach('c-big'), 'k-big', 'COMPLETE 2027 SEASON')::text);
SELECT qa.put('timing complete (2,000 athletes)', to_jsonb(round(extract(epoch FROM clock_timestamp() - (qa.get('timing_start') #>> '{}')::timestamptz) * 1000) || ' ms')::text);
SELECT qa.check('N1 large team: every returning athlete, athlete account, parent and link carried — no 1,000-row truncation',
  (qa.get('big_go') -> 'summary' ->> 'athletes_carried')::int = (SELECT count(*) FROM public.athletes WHERE campaign_slug = 'big-2027' AND class_year <> 'Senior')
  AND (SELECT count(*) FROM public.athletes WHERE campaign_slug = 'big-2028') = 1500
  AND (SELECT count(*) FROM public.team_members WHERE campaign_slug = 'big-2028' AND role = 'athlete') = 1500
  AND (SELECT count(*) FROM public.team_members WHERE campaign_slug = 'big-2028' AND role = 'parent')
      = (SELECT count(DISTINCT l.team_member_id) FROM public.team_member_athletes l JOIN public.athletes a ON a.id = l.athlete_id
         WHERE a.campaign_slug = 'big-2027' AND a.class_year <> 'Senior')
  AND (SELECT count(*) FROM public.team_member_athletes l JOIN public.team_members m ON m.id = l.team_member_id WHERE m.campaign_slug = 'big-2028')
      = (SELECT count(*) FROM public.team_member_athletes l JOIN public.athletes a ON a.id = l.athlete_id
         WHERE a.campaign_slug = 'big-2027' AND a.class_year <> 'Senior')
  AND (qa.get('big_prev') -> 'roster' ->> 'total')::int = 2000,
  qa.get('big_go') ->> 'summary');
SELECT qa.check('N2 large team completes in under 30 seconds',
  (qa.get('timing complete (2,000 athletes)') #>> '{}') ~ '^[0-9]+ ms$'
  AND split_part(qa.get('timing complete (2,000 athletes)') #>> '{}', ' ', 1)::int < 30000,
  qa.get('timing complete (2,000 athletes)') #>> '{}');

-- ═══ O. Existing admin hard-delete still works ═══════════════════════
-- With Phase 2 applied (run with -v phase2=1), a completed season is
-- read-only, so it cannot be hard-deleted; deleting its (active) successor
-- still works and clears the link.
\if :{?phase2}
SELECT qa.put('del_go', qa.go('del-2027', qa.coach('c-del'), 'k-del', 'COMPLETE 2027 SEASON')::text);
SELECT qa.expect_error('O1 Phase 2: a completed season cannot be hard-deleted',
  $q$ DELETE FROM public.campaign_settings WHERE campaign_slug = 'del-2027' $q$, 'season_completed_read_only');
DELETE FROM public.campaign_settings WHERE campaign_slug = 'del-2028';
SELECT qa.check('O2 Phase 2: deleting the active successor works; the completed season keeps its history, its link is cleared, the audit row survives',
  NOT EXISTS (SELECT 1 FROM public.campaign_settings WHERE campaign_slug = 'del-2028')
  AND (SELECT successor_campaign_slug IS NULL AND season_completed_at IS NOT NULL AND archived FROM public.campaign_settings WHERE campaign_slug = 'del-2027')
  AND EXISTS (SELECT 1 FROM public.team_season_transitions WHERE from_campaign_slug = 'del-2027'));
DELETE FROM public.elf_accounts WHERE id = qa.u('del-acct');
SELECT qa.check('O3 Phase 2: deleting the actor''s account clears it on the completed season''s coach row and in the audit row',
  (SELECT actor_account_id IS NULL FROM public.team_season_transitions WHERE from_campaign_slug = 'del-2027')
  AND (SELECT account_id IS NULL FROM public.team_coaches WHERE campaign_slug = 'del-2027'));
\else
SELECT qa.put('del_go', qa.go('del-2027', qa.coach('c-del'), 'k-del', 'COMPLETE 2027 SEASON')::text);
DELETE FROM public.campaign_settings WHERE campaign_slug = 'del-2027';
SELECT qa.check('O1 deleting a completed season works: the successor''s link is cleared, the audit row survives with the actor coach cleared',
  NOT EXISTS (SELECT 1 FROM public.campaign_settings WHERE campaign_slug = 'del-2027')
  AND (SELECT predecessor_campaign_slug IS NULL FROM public.campaign_settings WHERE campaign_slug = 'del-2028')
  AND (SELECT actor_coach_id IS NULL AND actor_account_id = qa.u('del-acct') AND to_campaign_slug = 'del-2028'
       FROM public.team_season_transitions WHERE from_campaign_slug = 'del-2027'));
DELETE FROM public.campaign_settings WHERE campaign_slug = 'del-2028';
SELECT qa.check('O2 deleting the successor works too; the audit row remains',
  NOT EXISTS (SELECT 1 FROM public.campaign_settings WHERE campaign_slug = 'del-2028')
  AND EXISTS (SELECT 1 FROM public.team_season_transitions WHERE from_campaign_slug = 'del-2027'));
DELETE FROM public.elf_accounts WHERE id = qa.u('del-acct');
SELECT qa.check('O3 deleting the actor''s account clears it in the audit row; the row survives',
  (SELECT actor_account_id IS NULL FROM public.team_season_transitions WHERE from_campaign_slug = 'del-2027'));
\endif
