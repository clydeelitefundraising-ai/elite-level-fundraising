-- School Linking (phase_o3) - INSTALLED FUNCTION DIAGNOSTIC. READ-ONLY.
--
-- Shows which text form of season_write_guard() and school_link_apply() is
-- installed and proves whether it is the committed code. Supabase -> SQL
-- Editor -> New query -> paste this whole file -> Run. Catalog facts only.
--
-- Three fingerprints per function:
--   exact      md5(prosrc) - changes with line endings and comment bytes;
--   no CR      line endings ignored;
--   code only  line endings AND "--" comments removed. This is the strict
--              check: it equals the committed migration's value only if every
--              keyword, identifier, literal and operator is identical.
--              (No string literal in either function contains "--", so
--              removing comments never touches code.)
--
-- Known text forms of the committed migration (all the same code):
--   guard e6189ca1... / apply 691ec970...  UTF-8, LF (psql -f, editor paste)
--   guard dccd6986... / apply 3986f9f5...  UTF-8, CRLF (Windows working copy)
--   guard 3ce94a58... / apply f92ce1d2...  UTF-8 read as code page 437, CRLF
--                                          (Windows "clip < file"): only the
--                                          comment characters are garbled
SET TRANSACTION READ ONLY;

WITH f AS (
  SELECT 'guard' AS fn, p.* FROM pg_proc p WHERE p.oid = to_regprocedure('public.season_write_guard()')
  UNION ALL
  SELECT 'apply', p.* FROM pg_proc p WHERE p.oid = to_regprocedure('public.school_link_apply(jsonb,text,uuid,jsonb,jsonb)')
), lines AS (
  SELECT f.fn, l.n, l.line
  FROM f, regexp_split_to_table(replace(f.prosrc, chr(13), ''), E'\n') WITH ORDINALITY AS l(line, n)
), r(n, check_name, value, expected) AS (
  SELECT 1, 'transaction is read-only', current_setting('transaction_read_only'), 'on'
  UNION ALL SELECT 2, 'guard exact md5 / text form',
    (SELECT md5(prosrc) || ' ' || CASE md5(prosrc)
        WHEN 'e6189ca1a112c1bd27b52c8fdaeabf13' THEN '(UTF-8, LF)'
        WHEN 'dccd6986a9bf90557c3834d78c21318f' THEN '(UTF-8, CRLF)'
        WHEN '3ce94a5820dbdb2be3c731d874dc9958' THEN '(code page 437 comments, CRLF)'
        ELSE '(UNKNOWN form)' END FROM f WHERE fn = 'guard'), NULL
  UNION ALL SELECT 3, 'guard md5, line endings ignored',
    (SELECT md5(replace(prosrc, chr(13), '')) FROM f WHERE fn = 'guard'), NULL
  UNION ALL SELECT 4, 'guard md5, code only (strict)',
    (SELECT md5(regexp_replace(replace(prosrc, chr(13), ''), '--[^\n]*', '', 'g')) FROM f WHERE fn = 'guard'),
    'e4b2b809097ac0e0cde77616a258d8d1'
  UNION ALL SELECT 5, 'apply exact md5 / text form',
    (SELECT md5(prosrc) || ' ' || CASE md5(prosrc)
        WHEN '691ec970ff3fc62bea4e2e43408785d8' THEN '(UTF-8, LF)'
        WHEN '3986f9f58daf65314b1db8a3181d77a0' THEN '(UTF-8, CRLF)'
        WHEN 'f92ce1d2e8b884242d38b79be7c5986a' THEN '(code page 437 comments, CRLF)'
        ELSE '(UNKNOWN form)' END FROM f WHERE fn = 'apply'), NULL
  UNION ALL SELECT 6, 'apply md5, line endings ignored',
    (SELECT md5(replace(prosrc, chr(13), '')) FROM f WHERE fn = 'apply'), NULL
  UNION ALL SELECT 7, 'apply md5, code only (strict)',
    (SELECT md5(regexp_replace(replace(prosrc, chr(13), ''), '--[^\n]*', '', 'g')) FROM f WHERE fn = 'apply'),
    '750ace23acff9575ef927b5578a9d19f'

  -- Where the non-ASCII characters are: they must all be inside comments.
  UNION ALL SELECT 8, 'non-ASCII lines outside comments (both functions)',
    (SELECT count(*)::text FROM lines WHERE octet_length(line) <> char_length(line) AND line !~ '^\s*--'), '0'
  UNION ALL SELECT 9, 'non-ASCII comment lines (guard, apply)',
    (SELECT count(*) FILTER (WHERE fn = 'guard') || ', ' || count(*) FILTER (WHERE fn = 'apply')
       FROM lines WHERE octet_length(line) <> char_length(line)), NULL

  -- Definition attributes and privileges.
  UNION ALL SELECT 10, 'guard secdef / acl / config / owner',
    (SELECT prosecdef::text || ' ' || coalesce(proacl::text, '') || ' ' || coalesce(array_to_string(proconfig, ','), '')
            || ' owner=' || pg_get_userbyid(proowner) FROM f WHERE fn = 'guard'),
    'true {postgres=X/postgres} search_path="" owner=postgres'
  UNION ALL SELECT 11, 'apply secdef / acl / config / owner',
    (SELECT prosecdef::text || ' ' || coalesce(proacl::text, '') || ' ' || coalesce(array_to_string(proconfig, ','), '')
            || ' owner=' || pg_get_userbyid(proowner) FROM f WHERE fn = 'apply'),
    'true {postgres=X/postgres,service_role=X/postgres} search_path="" owner=postgres'
  UNION ALL SELECT 12, 'apply language / volatility / strict / returns',
    (SELECT l.lanname || ' ' || provolatile::text || ' strict=' || proisstrict::text || ' returns ' || format_type(prorettype, NULL)
       FROM f JOIN pg_language l ON l.oid = f.prolang WHERE fn = 'apply'), NULL
  UNION ALL SELECT 13, 'EXECUTE anon / authenticated / service_role / PUBLIC',
    (SELECT has_function_privilege('anon', f.oid, 'EXECUTE')::text || ' / ' ||
            has_function_privilege('authenticated', f.oid, 'EXECUTE')::text || ' / ' ||
            has_function_privilege('service_role', f.oid, 'EXECUTE')::text || ' / ' ||
            coalesce((SELECT bool_or(a.grantee = 0) FROM aclexplode(f.proacl) a), false)::text
       FROM f WHERE fn = 'apply'),
    'false / false / true / false'
  UNION ALL SELECT 14, 'campaign_settings triggers',
    (SELECT coalesce(string_agg(tgname || '(' || tgenabled::text || ')', ', ' ORDER BY tgname), '(none)')
       FROM pg_trigger WHERE tgrelid = 'public.campaign_settings'::regclass AND NOT tgisinternal),
    'season_write_guard(O)'

  -- Safety-critical code present (comments removed before searching).
  UNION ALL SELECT 15, 'apply: actor checked against platform_admins + elf_accounts',
    (SELECT (c ~ 'FROM public\.platform_admins pa\s+JOIN public\.elf_accounts a ON a\.id = pa\.account_id\s+WHERE pa\.id = v_admin_id AND pa\.account_id = v_account_id')::text
       FROM (SELECT regexp_replace(replace(prosrc, chr(13), ''), '--[^\n]*', '', 'g') c FROM f WHERE fn = 'apply') x), 'true'
  UNION ALL SELECT 16, 'apply: seasons locked FOR UPDATE in slug order',
    (SELECT (c ~ 'ORDER BY c\.campaign_slug\s+FOR UPDATE')::text
       FROM (SELECT regexp_replace(replace(prosrc, chr(13), ''), '--[^\n]*', '', 'g') c FROM f WHERE fn = 'apply') x), 'true'
  UNION ALL SELECT 17, 'apply: stale preview refused',
    (SELECT (c ~ 'IS DISTINCT FROM \(v_expected ->> c\.campaign_slug\)::uuid\s+\)\s+THEN\s+RAISE EXCEPTION ''school_link_stale''')::text
       FROM (SELECT regexp_replace(replace(prosrc, chr(13), ''), '--[^\n]*', '', 'g') c FROM f WHERE fn = 'apply') x), 'true'
  UNION ALL SELECT 18, 'apply: flag set on, then off, inside the transaction',
    (SELECT (c ~ 'set_config\(''elf\.school_link'', ''on'', true\)' AND c ~ 'set_config\(''elf\.school_link'', ''off'', true\)')::text
       FROM (SELECT regexp_replace(replace(prosrc, chr(13), ''), '--[^\n]*', '', 'g') c FROM f WHERE fn = 'apply') x), 'true'
  UNION ALL SELECT 19, 'guard: exception requires the flag and organization_id only',
    (SELECT (c ~ 'elf\.school_link' AND c ~ 'organization_id')::text
       FROM (SELECT regexp_replace(replace(prosrc, chr(13), ''), '--[^\n]*', '', 'g') c FROM f WHERE fn = 'guard') x), 'true'
), s AS (
  SELECT n, check_name, coalesce(value, '(missing)') AS value, coalesce(expected, '(information)') AS expected,
         CASE WHEN expected IS NULL THEN 'INFO'
              WHEN value = expected THEN 'PASS'
              ELSE 'STOP' END AS status
  FROM r
)
SELECT * FROM s
UNION ALL
SELECT 99, 'OVERALL', count(*) FILTER (WHERE status = 'STOP') || ' STOP row(s)', '0 STOP row(s)',
       CASE WHEN count(*) FILTER (WHERE status = 'STOP') = 0 THEN 'PASS' ELSE 'STOP' END
FROM s
UNION ALL
-- The non-ASCII lines themselves (comments; garbled if pasted via clip).
SELECT 100 + row_number() OVER (ORDER BY fn, n)::int, fn || ' line ' || n, left(btrim(line), 90), '(comment)',
       CASE WHEN line ~ '^\s*--' THEN 'INFO' ELSE 'STOP' END
FROM lines WHERE octet_length(line) <> char_length(line)
ORDER BY 1;
