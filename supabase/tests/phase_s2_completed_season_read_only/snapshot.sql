-- Catalog + data fingerprint of everything Phase 2 must NOT change:
-- every existing table, constraint, index, trigger, policy, privilege and
-- function (including Phase 1's), and every existing row.
\set QUIET on
CREATE FUNCTION pg_temp.is_new(n text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT n IN ('season_write_guard', 'team_attendance_season_start_guard', 'season_is_completed', 'season_write_purpose',
               'season_fk_target_exists', 'season_fk_cleared', 'season_fk_cascaded', 'season_row_slug') $$;
CREATE FUNCTION pg_temp.data() RETURNS SETOF text LANGUAGE plpgsql AS $$
DECLARE t text; h text;
BEGIN
  FOR t IN SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' ORDER BY 1 LOOP
    EXECUTE format('SELECT md5(coalesce(string_agg(x::text, %L ORDER BY x::text), %L)) || %L || count(*) FROM public.%I x', '|', '', ':', t) INTO h;
    RETURN NEXT 'data ' || t || ' ' || h;
  END LOOP;
END $$;
SELECT v FROM (
  SELECT 'col ' || table_name || '.' || column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, '') v
    FROM information_schema.columns WHERE table_schema = 'public'
  UNION ALL SELECT 'con ' || conrelid::regclass || '.' || conname || ':' || pg_get_constraintdef(oid)
    FROM pg_constraint WHERE connamespace = 'public'::regnamespace
  UNION ALL SELECT 'trg ' || tgrelid::regclass || '.' || tgname || ':' || tgenabled::text
    FROM pg_trigger WHERE NOT tgisinternal AND NOT pg_temp.is_new(tgname)
  UNION ALL SELECT 'idx ' || tablename || '.' || indexname || ':' || indexdef FROM pg_indexes WHERE schemaname = 'public'
  UNION ALL SELECT 'acl ' || relname || ':' || coalesce(relacl::text, '') || ':rls=' || relrowsecurity
    FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r', 'v')
  UNION ALL SELECT 'pol ' || tablename || ':' || policyname || ':' || coalesce(qual, '') FROM pg_policies WHERE schemaname = 'public'
  UNION ALL SELECT 'fn ' || p.oid::regprocedure::text || ':' || md5(prosrc) || ':' || coalesce(proacl::text, '') || ':' || coalesce(array_to_string(proconfig, ','), '')
    FROM pg_proc p WHERE pronamespace = 'public'::regnamespace AND NOT pg_temp.is_new(proname)
  UNION ALL SELECT * FROM pg_temp.data()
) s ORDER BY 1;
