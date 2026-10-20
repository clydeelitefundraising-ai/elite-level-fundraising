-- Catalog + data fingerprint of everything Phase 5 must NOT change: the
-- tables it references, the Phase 2/3 To-Do objects, and every existing
-- public function.
SELECT 'col' k, table_name||'.'||column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,'') v FROM information_schema.columns WHERE table_schema='public' AND table_name NOT LIKE 'team_attendance%'
UNION ALL SELECT 'con', conrelid::regclass||'.'||conname||':'||pg_get_constraintdef(oid) FROM pg_constraint WHERE connamespace='public'::regnamespace AND conrelid::regclass::text NOT LIKE 'team_attendance%'
UNION ALL SELECT 'trg', tgrelid::regclass||'.'||tgname FROM pg_trigger WHERE NOT tgisinternal AND tgrelid::regclass::text NOT LIKE 'team_attendance%'
UNION ALL SELECT 'idx', tablename||'.'||indexname||':'||indexdef FROM pg_indexes WHERE schemaname='public' AND tablename NOT LIKE 'team_attendance%'
UNION ALL SELECT 'acl', relname||':'||coalesce(relacl::text,'')||':rls='||relrowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' AND relname NOT LIKE 'team_attendance%'
UNION ALL SELECT 'pol', tablename||':'||policyname FROM pg_policies WHERE schemaname='public'
UNION ALL SELECT 'fn', p.oid::regprocedure::text||':'||md5(prosrc)||':'||coalesce(proacl::text,'')||':'||coalesce(array_to_string(proconfig,','),'') FROM pg_proc p WHERE pronamespace='public'::regnamespace AND proname NOT LIKE 'team_attendance%'
UNION ALL SELECT 'data', 'athletes:'||md5(string_agg(row(a.*)::text, '|' ORDER BY a.id)) FROM public.athletes a
UNION ALL SELECT 'data', 'coaches:'||md5(string_agg(row(c.*)::text, '|' ORDER BY c.id)) FROM public.team_coaches c
UNION ALL SELECT 'data', 'members:'||md5(string_agg(row(m.*)::text, '|' ORDER BY m.id)) FROM public.team_members m
UNION ALL SELECT 'data', 'accounts:'||md5(string_agg(row(e.*)::text, '|' ORDER BY e.id)) FROM public.elf_accounts e
UNION ALL SELECT 'data', 'clearance:'||md5(string_agg(row(c.*)::text, '|' ORDER BY c.id)) FROM public.clearance_resources c
ORDER BY 1, 2;
