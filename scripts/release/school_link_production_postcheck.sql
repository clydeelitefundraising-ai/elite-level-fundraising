-- School Linking (phase_o3) - PRODUCTION POST-CHECK. NOTHING IS KEPT.
--
-- Run AFTER applying supabase/migrations/phase_o3_school_link_apply.sql.
-- Supabase -> production project -> SQL Editor -> New query -> paste this
-- whole file -> Run. The editor shows one table: check, value, expected, status.
--
--   PASS    value matches the expected value.
--   COMPARE a baseline; it must equal the same-named row of the pre-check.
--   STOP    send the row to the release owner (rollback plan in
--           docs/SCHOOL_LINKING_PRODUCTION_RELEASE.md).
--
-- Safety: the probes try writes that must be refused. Each probe runs in its
-- own subtransaction that is ALWAYS undone - even a write that succeeds is
-- rolled back before the next probe (status "ALLOWED (undone)"). The only
-- object created is a temporary helper function, private to this database
-- session and dropped automatically when the session ends. Prints catalog
-- facts, counts, md5 fingerprints and error messages only - no row data.

CREATE OR REPLACE FUNCTION pg_temp.elf_o3_probe(p_sql text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
    RAISE EXCEPTION 'elf_o3_probe_undo';
  EXCEPTION WHEN others THEN
    IF SQLERRM = 'elf_o3_probe_undo' THEN
      RETURN 'ALLOWED (undone)';
    END IF;
    RETURN SQLERRM;
  END;
END $$;

WITH r(n, check_name, value, expected) AS (
  SELECT 1, 'current_user', current_user::text, 'postgres'

  -- The migration's objects.
  UNION ALL SELECT 2, 'season_write_guard md5',
    (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure('public.season_write_guard()')),
    'e6189ca1a112c1bd27b52c8fdaeabf13'
  UNION ALL SELECT 3, 'season_write_guard md5 (line endings ignored)',
    (SELECT md5(replace(prosrc, chr(13), '')) FROM pg_proc WHERE oid = to_regprocedure('public.season_write_guard()')),
    'e6189ca1a112c1bd27b52c8fdaeabf13'
  UNION ALL SELECT 4, 'season_write_guard secdef / acl / config / owner',
    (SELECT prosecdef::text || ' ' || coalesce(proacl::text, '') || ' ' || coalesce(array_to_string(proconfig, ','), '')
            || ' owner=' || pg_get_userbyid(proowner)
       FROM pg_proc WHERE oid = to_regprocedure('public.season_write_guard()')),
    'true {postgres=X/postgres} search_path="" owner=postgres'
  UNION ALL SELECT 5, 'school_link_apply secdef / acl / config / owner',
    (SELECT prosecdef::text || ' ' || coalesce(proacl::text, '') || ' ' || coalesce(array_to_string(proconfig, ','), '')
            || ' owner=' || pg_get_userbyid(proowner)
       FROM pg_proc WHERE oid = to_regprocedure('public.school_link_apply(jsonb,text,uuid,jsonb,jsonb)')),
    'true {postgres=X/postgres,service_role=X/postgres} search_path="" owner=postgres'
  UNION ALL SELECT 6, 'EXECUTE anon / authenticated / service_role / PUBLIC',
    (SELECT has_function_privilege('anon', p, 'EXECUTE')::text || ' / ' ||
            has_function_privilege('authenticated', p, 'EXECUTE')::text || ' / ' ||
            has_function_privilege('service_role', p, 'EXECUTE')::text || ' / ' ||
            coalesce((SELECT bool_or(a.grantee = 0) FROM pg_proc x, aclexplode(x.proacl) a WHERE x.oid = p), false)::text
       FROM to_regprocedure('public.school_link_apply(jsonb,text,uuid,jsonb,jsonb)') p),
    'false / false / true / false'
  UNION ALL SELECT 7, 'functions using the elf.school_link flag',
    (SELECT string_agg(proname, ',' ORDER BY proname) FROM pg_proc WHERE prosrc LIKE '%elf.school_link%'),
    'school_link_apply,season_write_guard'
  UNION ALL SELECT 8, 'campaign_settings triggers',
    (SELECT coalesce(string_agg(tgname || '(' || tgenabled::text || ')', ', ' ORDER BY tgname), '(none)')
       FROM pg_trigger WHERE tgrelid = 'public.campaign_settings'::regclass AND NOT tgisinternal),
    'season_write_guard(O)'

  -- Baselines: the migration changes no data.
  UNION ALL SELECT 9, 'BASELINE seasons / completed / linked',
    (SELECT count(*) || ' / ' || count(*) FILTER (WHERE season_completed_at IS NOT NULL OR successor_campaign_slug IS NOT NULL)
            || ' / ' || count(*) FILTER (WHERE organization_id IS NOT NULL) FROM public.campaign_settings), NULL
  UNION ALL SELECT 10, 'BASELINE link fingerprint',
    (SELECT md5(coalesce(string_agg(campaign_slug || '=' || coalesce(organization_id::text, '-'), ',' ORDER BY campaign_slug), ''))
       FROM public.campaign_settings), NULL
  UNION ALL SELECT 11, 'BASELINE organizations fingerprint',
    (SELECT md5(coalesce(string_agg(o::text, '|' ORDER BY o.id), '')) FROM public.organizations o), NULL
  UNION ALL SELECT 12, 'BASELINE platform admins (must be >= 1 to use School Links)',
    (SELECT count(*)::text FROM public.platform_admins), NULL
  UNION ALL SELECT 13, 'BASELINE school_link audit rows',
    (SELECT count(*)::text FROM public.audit_logs WHERE action LIKE 'school_link.%'), '0'

  -- Probes (each one undone).
  UNION ALL SELECT 14, 'completed seasons probed',
    (SELECT count(*)::text FROM public.campaign_settings WHERE season_completed_at IS NOT NULL OR successor_campaign_slug IS NOT NULL),
    '> 0'
  UNION ALL SELECT 15, 'probe: organization_id change on completed seasons, no flag',
    pg_temp.elf_o3_probe($q$UPDATE public.campaign_settings c SET organization_id = CASE WHEN c.organization_id IS NULL THEN (SELECT id FROM public.organizations ORDER BY id LIMIT 1) END
                          WHERE c.season_completed_at IS NOT NULL OR c.successor_campaign_slug IS NOT NULL$q$),
    '%season_completed_read_only%'
  UNION ALL SELECT 16, 'probe: flag on + organization_id only (the allowed case)',
    pg_temp.elf_o3_probe($q$SELECT set_config('elf.school_link', 'on', true);
                          UPDATE public.campaign_settings c SET organization_id = CASE WHEN c.organization_id IS NULL THEN (SELECT id FROM public.organizations ORDER BY id LIMIT 1) END
                          WHERE c.season_completed_at IS NOT NULL OR c.successor_campaign_slug IS NOT NULL$q$),
    'ALLOWED (undone)'
  UNION ALL SELECT 17, 'probe: flag on + organization_id AND goal_cents',
    pg_temp.elf_o3_probe($q$SELECT set_config('elf.school_link', 'on', true);
                          UPDATE public.campaign_settings c SET organization_id = CASE WHEN c.organization_id IS NULL THEN (SELECT id FROM public.organizations ORDER BY id LIMIT 1) END, goal_cents = goal_cents + 1
                          WHERE c.season_completed_at IS NOT NULL OR c.successor_campaign_slug IS NOT NULL$q$),
    '%season_completed_read_only%'
  UNION ALL SELECT 18, 'probe: flag on + completion date',
    pg_temp.elf_o3_probe($q$SELECT set_config('elf.school_link', 'on', true);
                          UPDATE public.campaign_settings SET season_completed_at = now() - interval '1 day'
                          WHERE season_completed_at IS NOT NULL OR successor_campaign_slug IS NOT NULL$q$),
    '%season_completed_read_only%'
  UNION ALL SELECT 19, 'probe: flag on + completed-season roster update',
    pg_temp.elf_o3_probe($q$SELECT set_config('elf.school_link', 'on', true);
                          UPDATE public.athletes SET name = name || 'x' WHERE campaign_slug IN
                            (SELECT campaign_slug FROM public.campaign_settings WHERE season_completed_at IS NOT NULL OR successor_campaign_slug IS NOT NULL)$q$),
    CASE WHEN EXISTS (SELECT 1 FROM public.athletes WHERE campaign_slug IN
                       (SELECT campaign_slug FROM public.campaign_settings WHERE season_completed_at IS NOT NULL OR successor_campaign_slug IS NOT NULL))
         THEN '%season_completed_read_only%' ELSE 'ALLOWED (undone)' END
  UNION ALL SELECT 20, 'probe: forged Platform Admin',
    pg_temp.elf_o3_probe($q$SELECT public.school_link_apply('{"platform_admin_id":"00000000-0000-4000-8000-000000000000","account_id":"00000000-0000-4000-8000-000000000000"}',
                          'x-1', NULL, '[{"campaign_slug":"x-1","expected_organization_id":null}]', '{}')$q$),
    '%school_link_actor_not_authorized%'
  UNION ALL SELECT 21, 'probe: missing actor',
    pg_temp.elf_o3_probe($q$SELECT public.school_link_apply('{}', 'x-1', NULL, '[]', '{}')$q$),
    '%school_link_actor_invalid%'
  UNION ALL SELECT 22, 'probe: anon calls school_link_apply',
    pg_temp.elf_o3_probe($q$SET LOCAL ROLE anon; SELECT public.school_link_apply('{}', 'x-1', NULL, '[]', '{}')$q$),
    'permission denied for function school_link_apply'
  UNION ALL SELECT 23, 'probe: authenticated calls school_link_apply',
    pg_temp.elf_o3_probe($q$SET LOCAL ROLE authenticated; SELECT public.school_link_apply('{}', 'x-1', NULL, '[]', '{}')$q$),
    'permission denied for function school_link_apply'
  UNION ALL SELECT 24, 'flag after probes', coalesce(nullif(current_setting('elf.school_link', true), ''), '(unset)'), '(unset)|off'
  UNION ALL SELECT 25, 'role after probes', current_user::text, 'postgres'
), s AS (
  SELECT n, check_name, coalesce(value, '(missing)') AS value, coalesce(expected, '(same as pre-check)') AS expected,
         CASE WHEN expected IS NULL THEN 'COMPARE'
              WHEN expected = '> 0' THEN CASE WHEN value::int > 0 THEN 'PASS' ELSE 'STOP' END
              WHEN expected = '(unset)|off' THEN CASE WHEN value IN ('(unset)', 'off') THEN 'PASS' ELSE 'STOP' END
              WHEN value LIKE expected THEN 'PASS'
              ELSE 'STOP' END AS status
  FROM r
)
SELECT * FROM s
UNION ALL
SELECT 99, 'OVERALL (also compare rows 9-12 with the pre-check)', count(*) FILTER (WHERE status = 'STOP') || ' STOP row(s)', '0 STOP row(s)',
       CASE WHEN count(*) FILTER (WHERE status = 'STOP') = 0 THEN 'PASS' ELSE 'STOP' END
FROM s
ORDER BY n;
