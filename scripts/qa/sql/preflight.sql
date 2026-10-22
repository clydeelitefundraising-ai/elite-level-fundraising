-- ELF QA connection preflight — READ-ONLY. SELECT statements only, inside a
-- READ ONLY transaction that is rolled back; the session is also opened
-- with default_transaction_read_only=on by preflight.mjs, so the server
-- itself would refuse any write. Prints facts about the database, never
-- secrets or row data.
\set ON_ERROR_STOP on
\set QUIET on
BEGIN TRANSACTION READ ONLY;
SELECT 'read_only_session=' || current_setting('default_transaction_read_only')
    || ' read_only_transaction=' || current_setting('transaction_read_only');
SELECT 'server=' || split_part(version(), ' ', 2) || ' database=' || current_database() || ' user=' || current_user;
SELECT 'public_tables=' || count(*) FROM pg_catalog.pg_tables WHERE schemaname = 'public';
SELECT 'elf_qa_marker=' || CASE WHEN to_regclass('elf_qa.marker') IS NULL THEN 'absent' ELSE 'present' END;
SELECT 'api_roles=' || string_agg(rolname, ',' ORDER BY rolname) FROM pg_catalog.pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role');
SELECT 'member_of_service_role=' || pg_has_role(current_user, 'service_role', 'MEMBER');
SELECT 'storage_buckets_table=' || CASE WHEN to_regclass('storage.buckets') IS NULL THEN 'absent'
    ELSE 'present insert_privilege=' || has_table_privilege(current_user, 'storage.buckets', 'INSERT') END;
-- (dynamic, so it only reads storage.buckets when that table exists)
SELECT 'existing_buckets=' || (xpath('/row/c/text()', query_to_xml('SELECT count(*) AS c FROM storage.buckets', false, true, '')))[1]::text
  WHERE to_regclass('storage.buckets') IS NOT NULL;
SELECT 'rls_auto_enable=' || coalesce((SELECT 'present owner=' || pg_get_userbyid(proowner) FROM pg_catalog.pg_proc
    WHERE proname = 'rls_auto_enable' AND pronamespace = 'public'::regnamespace), 'absent');
SELECT 'realtime_publication=' || EXISTS (SELECT 1 FROM pg_catalog.pg_publication WHERE pubname = 'supabase_realtime');
SELECT 'can_create_in_public=' || has_schema_privilege(current_user, 'public', 'CREATE');
SELECT 'public_schema_owner=' || pg_get_userbyid(nspowner) FROM pg_catalog.pg_namespace WHERE nspname = 'public';
ROLLBACK;
