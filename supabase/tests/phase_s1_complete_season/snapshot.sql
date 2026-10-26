-- Catalog + data fingerprint of everything Phase 1 must NOT change: every
-- existing table's columns, constraints, indexes, triggers, policies and
-- privileges, every existing public function, and every existing row of
-- every table (new columns excluded; program_id's backfill is checked
-- separately in tests.sql).
\set QUIET on
CREATE FUNCTION pg_temp.is_new_col(t text, c text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT (t = 'campaign_settings' AND c IN ('program_id', 'season_started_at', 'season_completed_at',
                                            'predecessor_campaign_slug', 'successor_campaign_slug'))
      OR (t = 'athletes' AND c = 'previous_season_athlete_id') $$;
CREATE FUNCTION pg_temp.is_new_obj(n text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT n LIKE 'team_season%' OR n LIKE 'season\_%' OR n IN (
    'campaign_settings_successor_uniq', 'campaign_settings_predecessor_uniq', 'campaign_settings_program_idx',
    'athletes_previous_season_uniq', 'campaign_settings_not_own_successor', 'campaign_settings_not_own_predecessor',
    'campaign_settings_predecessor_campaign_slug_fkey', 'campaign_settings_successor_campaign_slug_fkey',
    'athletes_previous_season_athlete_id_fkey', 'campaign_settings_program_id_not_null') $$;
CREATE FUNCTION pg_temp.data() RETURNS SETOF text LANGUAGE plpgsql AS $$
DECLARE t text; cols text; h text;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
           AND NOT pg_temp.is_new_obj(c.relname) ORDER BY 1 LOOP
    SELECT string_agg(quote_ident(column_name), ',' ORDER BY ordinal_position) INTO cols
    FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND NOT pg_temp.is_new_col(t, column_name);
    EXECUTE format('SELECT md5(coalesce(string_agg(x::text, %L ORDER BY x::text), %L)) || %L || count(*) FROM (SELECT %s FROM public.%I) x',
                   '|', '', ':', cols, t) INTO h;
    RETURN NEXT 'data ' || t || ' ' || h;
  END LOOP;
END $$;

SELECT v FROM (
  SELECT 'col ' || table_name || '.' || column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, '') v
    FROM information_schema.columns WHERE table_schema = 'public' AND NOT pg_temp.is_new_col(table_name, column_name) AND NOT pg_temp.is_new_obj(table_name)
  UNION ALL SELECT 'con ' || conrelid::regclass || '.' || conname || ':' || pg_get_constraintdef(oid)
    FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND NOT pg_temp.is_new_obj(conname) AND NOT pg_temp.is_new_obj(conrelid::regclass::text)
  UNION ALL SELECT 'trg ' || tgrelid::regclass || '.' || tgname || ':' || tgenabled::text
    FROM pg_trigger WHERE NOT tgisinternal AND NOT pg_temp.is_new_obj(tgrelid::regclass::text)
  UNION ALL SELECT 'idx ' || tablename || '.' || indexname || ':' || indexdef
    FROM pg_indexes WHERE schemaname = 'public' AND NOT pg_temp.is_new_obj(indexname) AND NOT pg_temp.is_new_obj(tablename)
  UNION ALL SELECT 'acl ' || relname || ':' || coalesce(relacl::text, '') || ':rls=' || relrowsecurity
    FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r', 'v') AND NOT pg_temp.is_new_obj(relname)
  UNION ALL SELECT 'pol ' || tablename || ':' || policyname || ':' || coalesce(qual, '') FROM pg_policies WHERE schemaname = 'public'
  UNION ALL SELECT 'fn ' || p.oid::regprocedure::text || ':' || md5(prosrc) || ':' || coalesce(proacl::text, '') || ':' || coalesce(array_to_string(proconfig, ','), '')
    FROM pg_proc p WHERE pronamespace = 'public'::regnamespace AND NOT pg_temp.is_new_obj(proname)
  UNION ALL SELECT * FROM pg_temp.data()
) s ORDER BY 1;
