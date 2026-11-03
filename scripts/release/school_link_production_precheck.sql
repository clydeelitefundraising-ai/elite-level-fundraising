-- School Linking (phase_o3) - PRODUCTION PRE-CHECK. READ-ONLY.
--
-- Run BEFORE applying supabase/migrations/phase_o3_school_link_apply.sql.
-- Supabase -> production project -> SQL Editor -> New query -> paste this whole
-- file -> Run. The editor shows one table: check, value, expected, status.
--
--   PASS   value equals the expected value.
--   RECORD save the value; rows 21-24 must reappear unchanged in the post-check.
--   STOP   do not apply phase_o3; send the row to the release owner.
--
-- Safety: the first statement makes the transaction READ ONLY, so PostgreSQL
-- itself refuses any write. Prints catalog facts, counts and md5 fingerprints
-- only - no names, emails or other row data.
SET TRANSACTION READ ONLY;

WITH r(n, check_name, value, expected) AS (
  SELECT 1, 'transaction is read-only', current_setting('transaction_read_only'), 'on'
  UNION ALL SELECT 2, 'current_user', current_user::text, 'postgres'
  UNION ALL SELECT 3, 'postgres server version (information)', current_setting('server_version'), NULL

  -- The completed-season guard must be exactly phase_s2's (what phase_o3 replaces).
  UNION ALL SELECT 4, 'season_write_guard md5',
    (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure('public.season_write_guard()')),
    'de544ccaf6f5b483afea9c5ff5186ab3'
  UNION ALL SELECT 5, 'season_write_guard md5 (line endings ignored)',
    (SELECT md5(replace(prosrc, chr(13), '')) FROM pg_proc WHERE oid = to_regprocedure('public.season_write_guard()')),
    'de544ccaf6f5b483afea9c5ff5186ab3'
  UNION ALL SELECT 6, 'season_write_guard secdef / acl / config / owner',
    (SELECT prosecdef::text || ' ' || coalesce(proacl::text, '') || ' ' || coalesce(array_to_string(proconfig, ','), '')
            || ' owner=' || pg_get_userbyid(proowner)
       FROM pg_proc WHERE oid = to_regprocedure('public.season_write_guard()')),
    'true {postgres=X/postgres} search_path="" owner=postgres'
  UNION ALL SELECT 7, 'season guard helper functions (phase_s2)',
    (SELECT string_agg(oid::regprocedure::text, ',' ORDER BY oid::regprocedure::text) FROM pg_proc
      WHERE pronamespace = 'public'::regnamespace
        AND proname IN ('season_is_completed', 'season_fk_cascaded', 'season_fk_cleared', 'season_row_slug', 'season_write_purpose')),
    'season_fk_cascaded(oid,jsonb),season_fk_cleared(oid,jsonb,text[],jsonb),season_is_completed(text),season_row_slug(text,jsonb),season_write_purpose()'
  UNION ALL SELECT 8, 'campaign_settings triggers',
    (SELECT coalesce(string_agg(tgname || '(' || tgenabled::text || ')', ', ' ORDER BY tgname), '(none)')
       FROM pg_trigger WHERE tgrelid = 'public.campaign_settings'::regclass AND NOT tgisinternal),
    'season_write_guard(O)'
  UNION ALL SELECT 9, 'audit_logs triggers',
    (SELECT coalesce(string_agg(tgname, ', ' ORDER BY tgname), '(none)')
       FROM pg_trigger WHERE tgrelid = 'public.audit_logs'::regclass AND NOT tgisinternal),
    '(none)'

  -- phase_o3 must not be applied yet, and nothing else may use its flag.
  UNION ALL SELECT 10, 'school_link_apply exists',
    (to_regprocedure('public.school_link_apply(jsonb,text,uuid,jsonb,jsonb)') IS NOT NULL)::text, 'false'
  UNION ALL SELECT 11, 'functions using the elf.school_link flag',
    (SELECT count(*)::text FROM pg_proc WHERE prosrc LIKE '%elf.school_link%'), '0'

  -- Tables the new function reads/writes: owner, row-level security, columns.
  UNION ALL SELECT 12, 'table owners',
    (SELECT string_agg(relname || '=' || pg_get_userbyid(relowner), ', ' ORDER BY relname) FROM pg_class
      WHERE oid IN ('public.audit_logs'::regclass, 'public.campaign_settings'::regclass, 'public.elf_accounts'::regclass,
                    'public.organizations'::regclass, 'public.platform_admins'::regclass)),
    'audit_logs=postgres, campaign_settings=postgres, elf_accounts=postgres, organizations=postgres, platform_admins=postgres'
  UNION ALL SELECT 13, 'FORCE row-level security',
    (SELECT string_agg(relname || '=' || relforcerowsecurity::text, ', ' ORDER BY relname) FROM pg_class
      WHERE oid IN ('public.audit_logs'::regclass, 'public.campaign_settings'::regclass, 'public.elf_accounts'::regclass,
                    'public.organizations'::regclass, 'public.platform_admins'::regclass)),
    'audit_logs=false, campaign_settings=false, elf_accounts=false, organizations=false, platform_admins=false'
  UNION ALL SELECT 14, 'columns used by school_link_apply (name:type)',
    (SELECT md5(string_agg(table_name || '.' || column_name || ':' || data_type, ', ' ORDER BY table_name, column_name))
       || ' (' || count(*) || ')'
       FROM information_schema.columns WHERE table_schema = 'public' AND (
            (table_name = 'audit_logs' AND column_name IN ('admin_identifier', 'action', 'entity_type', 'entity_id', 'campaign_slug', 'summary',
                                                           'previous_value', 'new_value', 'ip_address', 'user_agent', 'actor_type', 'actor_id', 'actor_email'))
         OR (table_name = 'campaign_settings' AND column_name IN ('campaign_slug', 'organization_id', 'season_completed_at', 'successor_campaign_slug'))
         OR (table_name = 'elf_accounts' AND column_name IN ('id', 'email', 'name'))
         OR (table_name = 'organizations' AND column_name IN ('id', 'school_name', 'show_community_partners', 'show_community_partners_public'))
         OR (table_name = 'platform_admins' AND column_name IN ('id', 'account_id')))),
    '216d9b2370627c61a6a33ee7c6e508d0 (26)'
  UNION ALL SELECT 15, 'campaign_settings.organization_id',
    (SELECT data_type || ' nullable=' || is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'campaign_settings' AND column_name = 'organization_id'),
    'uuid nullable=YES'
  UNION ALL SELECT 16, 'campaign_settings primary key',
    (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.campaign_settings'::regclass AND contype = 'p'),
    'PRIMARY KEY (campaign_slug)'
  UNION ALL SELECT 17, 'campaign_settings -> organizations foreign key',
    (SELECT coalesce(string_agg(conname, ','), '(none)') FROM pg_constraint
      WHERE conrelid = 'public.campaign_settings'::regclass AND contype = 'f' AND confrelid = 'public.organizations'::regclass),
    'campaign_settings_organization_id_fkey'

  -- Roles and API: grants work, and the API reloads its schema after DDL.
  UNION ALL SELECT 18, 'roles service_role / anon / authenticated',
    (SELECT count(*)::text FROM pg_roles WHERE rolname IN ('service_role', 'anon', 'authenticated')), '3'
  UNION ALL SELECT 19, 'postgres is not superuser',
    (SELECT (NOT rolsuper)::text FROM pg_roles WHERE rolname = 'postgres'), 'true'
  UNION ALL SELECT 20, 'API schema-reload event triggers',
    (SELECT coalesce(string_agg(evtname || '(' || evtenabled::text || ')', ',' ORDER BY evtname), '(none)')
       FROM pg_event_trigger WHERE evtname LIKE 'pgrst%'),
    'pgrst_ddl_watch(O),pgrst_drop_watch(O)'

  -- Baselines: the post-check must print exactly these values.
  UNION ALL SELECT 21, 'BASELINE seasons / completed / linked',
    (SELECT count(*) || ' / ' || count(*) FILTER (WHERE season_completed_at IS NOT NULL OR successor_campaign_slug IS NOT NULL)
            || ' / ' || count(*) FILTER (WHERE organization_id IS NOT NULL) FROM public.campaign_settings), NULL
  UNION ALL SELECT 22, 'BASELINE link fingerprint',
    (SELECT md5(coalesce(string_agg(campaign_slug || '=' || coalesce(organization_id::text, '-'), ',' ORDER BY campaign_slug), ''))
       FROM public.campaign_settings), NULL
  UNION ALL SELECT 23, 'BASELINE organizations fingerprint',
    (SELECT md5(coalesce(string_agg(o::text, '|' ORDER BY o.id), '')) FROM public.organizations o), NULL
  UNION ALL SELECT 24, 'BASELINE platform admins (must be >= 1 to use School Links)',
    (SELECT count(*)::text FROM public.platform_admins), NULL
  UNION ALL SELECT 25, 'BASELINE school_link audit rows',
    (SELECT count(*)::text FROM public.audit_logs WHERE action LIKE 'school_link.%'), '0'
)
SELECT n, check_name, coalesce(value, '(missing)') AS value, coalesce(expected, '(record)') AS expected,
       CASE WHEN expected IS NULL THEN 'RECORD'
            WHEN value IS NOT DISTINCT FROM expected THEN 'PASS'
            ELSE 'STOP' END AS status
FROM r
UNION ALL
SELECT 99, 'OVERALL', count(*) FILTER (WHERE expected IS NOT NULL AND value IS DISTINCT FROM expected) || ' STOP row(s)', '0 STOP row(s)',
       CASE WHEN count(*) FILTER (WHERE expected IS NOT NULL AND value IS DISTINCT FROM expected) = 0 THEN 'PASS' ELSE 'STOP' END
FROM r
ORDER BY n;
