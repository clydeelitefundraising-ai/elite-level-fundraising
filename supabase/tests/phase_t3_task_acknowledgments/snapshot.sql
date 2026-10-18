-- Catalog + data fingerprint of everything Phase 3 must NOT change.
SELECT 'col' k, table_name||'.'||column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,'') v FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('team_tasks','team_task_resources','clearance_resources','athletes','team_members','team_member_athletes','elf_accounts')
UNION ALL SELECT 'con', conrelid::regclass||'.'||conname||':'||pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid::regclass::text IN ('team_tasks','team_task_resources','clearance_resources','athletes','team_members','team_member_athletes','elf_accounts')
UNION ALL SELECT 'trg', tgrelid::regclass||'.'||tgname FROM pg_trigger WHERE NOT tgisinternal AND tgrelid::regclass::text IN ('team_tasks','team_task_resources','clearance_resources','athletes','team_members','team_member_athletes','elf_accounts')
UNION ALL SELECT 'acl', relname||':'||coalesce(relacl::text,'') FROM pg_class WHERE relname IN ('team_tasks','team_task_resources','clearance_resources','athletes','team_members','team_member_athletes','elf_accounts')
UNION ALL SELECT 'rls', relname||':'||relrowsecurity FROM pg_class WHERE relname IN ('team_tasks','team_task_resources','clearance_resources')
UNION ALL SELECT 'fn', p.oid::regprocedure::text||':'||md5(prosrc)||':'||coalesce(proacl::text,'') FROM pg_proc p WHERE pronamespace='public'::regnamespace AND proname LIKE 'team_task%' AND proname NOT LIKE 'team_task_ack%' AND proname <> 'team_task_acknowledge'
UNION ALL SELECT 'data', 'clearance:'||md5(string_agg(row(c.*)::text, '|' ORDER BY c.id)) FROM public.clearance_resources c
UNION ALL SELECT 'data', 'tasks:'||coalesce(md5(string_agg(row(t.*)::text, '|' ORDER BY t.id)),'none') FROM public.team_tasks t
ORDER BY 1, 2;
