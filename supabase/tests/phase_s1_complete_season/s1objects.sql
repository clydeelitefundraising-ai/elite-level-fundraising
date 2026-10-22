-- Catalog fingerprint of the objects Phase 1 adds (compared after the first
-- run and after a rerun: a rerun must leave them identical).
\set QUIET on
SELECT v FROM (
  SELECT 'col ' || table_name || '.' || column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, '') v
    FROM information_schema.columns WHERE table_schema = 'public'
     AND ((table_name = 'campaign_settings' AND column_name IN ('program_id', 'season_started_at', 'season_completed_at', 'predecessor_campaign_slug', 'successor_campaign_slug'))
       OR (table_name = 'athletes' AND column_name = 'previous_season_athlete_id')
       OR table_name = 'team_season_transitions')
  UNION ALL SELECT 'con ' || conrelid::regclass || '.' || conname || ':' || pg_get_constraintdef(oid)
    FROM pg_constraint WHERE connamespace = 'public'::regnamespace
     AND (conrelid::regclass::text = 'team_season_transitions' OR conname LIKE 'campaign_settings_not_own%' OR conname = 'campaign_settings_program_id_not_null'
       OR conname IN ('campaign_settings_predecessor_campaign_slug_fkey', 'campaign_settings_successor_campaign_slug_fkey', 'athletes_previous_season_athlete_id_fkey'))
  UNION ALL SELECT 'idx ' || tablename || '.' || indexname || ':' || indexdef
    FROM pg_indexes WHERE schemaname = 'public'
     AND (tablename = 'team_season_transitions' OR indexname IN ('campaign_settings_successor_uniq', 'campaign_settings_predecessor_uniq', 'campaign_settings_program_idx', 'athletes_previous_season_uniq'))
  UNION ALL SELECT 'trg ' || tgrelid::regclass || '.' || tgname || ':' || tgenabled::text FROM pg_trigger WHERE NOT tgisinternal AND tgrelid::regclass::text = 'team_season_transitions'
  UNION ALL SELECT 'acl ' || relname || ':' || coalesce(relacl::text, '') || ':rls=' || relrowsecurity FROM pg_class WHERE relname = 'team_season_transitions'
  UNION ALL SELECT 'fn ' || p.oid::regprocedure::text || ':' || md5(prosrc) || ':' || coalesce(proacl::text, '') || ':' || coalesce(array_to_string(proconfig, ','), '') || ':' || prosecdef || ':' || provolatile::text
    FROM pg_proc p WHERE pronamespace = 'public'::regnamespace AND (proname LIKE 'season\_%' OR proname LIKE 'team\_season\_%')
  UNION ALL SELECT 'data program_id ' || md5(string_agg(campaign_slug || '=' || program_id, ',' ORDER BY campaign_slug)) FROM public.campaign_settings
) s ORDER BY 1;
