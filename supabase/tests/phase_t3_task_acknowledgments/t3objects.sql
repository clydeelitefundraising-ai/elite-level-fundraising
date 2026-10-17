-- Fingerprint of the Phase 3 objects themselves (for the rerun check).
SELECT 'col', column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,'') FROM information_schema.columns WHERE table_name='team_task_acknowledgments'
UNION ALL SELECT 'con', conname||':'||pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.team_task_acknowledgments'::regclass
UNION ALL SELECT 'idx', indexname||':'||indexdef FROM pg_indexes WHERE tablename='team_task_acknowledgments'
UNION ALL SELECT 'trg', tgname||':'||pg_get_triggerdef(oid) FROM pg_trigger WHERE tgrelid='public.team_task_acknowledgments'::regclass AND NOT tgisinternal
UNION ALL SELECT 'acl', coalesce(relacl::text,'')||':rls='||relrowsecurity FROM pg_class WHERE oid='public.team_task_acknowledgments'::regclass
UNION ALL SELECT 'fn', p.oid::regprocedure::text||':'||md5(prosrc)||':'||coalesce(proacl::text,'')||':'||array_to_string(proconfig,',') FROM pg_proc p WHERE pronamespace='public'::regnamespace AND (proname LIKE 'team_task_ack%' OR proname = 'team_task_acknowledge')
UNION ALL SELECT 'pol', count(*)::text FROM pg_policies WHERE tablename='team_task_acknowledgments'
ORDER BY 1, 2;
