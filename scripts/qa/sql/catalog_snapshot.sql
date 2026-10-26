-- Catalog fingerprint of the public schema (structure only, no data): used
-- by the local rehearsal to prove the QA installer produces exactly the
-- schema the test runners build. Excludes the platform-managed
-- rls_auto_enable function (installed by Supabase itself).
\set QUIET on
SELECT v FROM (
  SELECT 'col ' || table_name || '.' || column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, '') v
    FROM information_schema.columns WHERE table_schema = 'public'
  UNION ALL SELECT 'con ' || conrelid::regclass || '.' || conname || ':' || pg_get_constraintdef(oid)
    FROM pg_constraint WHERE connamespace = 'public'::regnamespace
  UNION ALL SELECT 'idx ' || tablename || '.' || indexname || ':' || indexdef FROM pg_indexes WHERE schemaname = 'public'
  UNION ALL SELECT 'trg ' || tgrelid::regclass || '.' || tgname || ':' || tgenabled::text || ':' || tgtype::text || ':' || encode(tgargs, 'escape')
    FROM pg_trigger WHERE NOT tgisinternal AND tgrelid::regclass::text NOT LIKE 'storage.%'
  UNION ALL SELECT 'tbl ' || c.relname || ':' || c.relkind::text || ':' || pg_get_userbyid(c.relowner) || ':' || coalesce(c.relacl::text, '') || ':rls=' || c.relrowsecurity
    FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'v', 'S')
  UNION ALL SELECT 'pol ' || tablename || ':' || policyname || ':' || coalesce(qual, '') || ':' || coalesce(with_check, '') FROM pg_policies WHERE schemaname = 'public'
  UNION ALL SELECT 'fn ' || p.oid::regprocedure::text || ':' || md5(p.prosrc) || ':' || pg_get_userbyid(p.proowner) || ':' || coalesce(p.proacl::text, '')
      || ':' || coalesce(array_to_string(p.proconfig, ','), '') || ':' || p.prosecdef || ':' || p.provolatile::text
    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname <> 'rls_auto_enable'
  UNION ALL SELECT 'def ' || pg_get_userbyid(d.defaclrole) || ':' || d.defaclobjtype::text || ':' || coalesce(d.defaclacl::text, '')
    FROM pg_default_acl d WHERE d.defaclnamespace = 'public'::regnamespace
) s ORDER BY 1;
