-- Fingerprint of the Phase 5 objects themselves (for the rerun check).
SELECT 'col', table_name||'.'||column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,'') FROM information_schema.columns WHERE table_name LIKE 'team_attendance%'
UNION ALL SELECT 'con', conrelid::regclass||'.'||conname||':'||pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid::regclass::text LIKE 'team_attendance%'
UNION ALL SELECT 'idx', indexname||':'||indexdef FROM pg_indexes WHERE tablename LIKE 'team_attendance%'
UNION ALL SELECT 'trg', tgname||':'||pg_get_triggerdef(oid) FROM pg_trigger WHERE tgrelid::regclass::text LIKE 'team_attendance%' AND NOT tgisinternal
UNION ALL SELECT 'acl', relname||':'||coalesce(relacl::text,'')||':rls='||relrowsecurity FROM pg_class WHERE relname LIKE 'team_attendance%' AND relkind='r'
UNION ALL SELECT 'fn', p.oid::regprocedure::text||':'||md5(prosrc)||':'||coalesce(proacl::text,'')||':'||array_to_string(proconfig,',')||':definer='||prosecdef FROM pg_proc p WHERE pronamespace='public'::regnamespace AND proname LIKE 'team_attendance%'
UNION ALL SELECT 'pol', count(*)::text FROM pg_policies WHERE tablename LIKE 'team_attendance%'
ORDER BY 1, 2;
