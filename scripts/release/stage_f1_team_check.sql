-- Stage F1 — read-only check of the Complete Season test team
-- (elf-season-test-2026). One SELECT; changes nothing. Shows counts and
-- flags only — no names, emails, codes or passwords.
WITH t AS (SELECT * FROM public.campaign_settings WHERE campaign_slug = 'elf-season-test-2026')
SELECT * FROM (VALUES
  (1,  'team exists',                         (SELECT count(*)::text FROM t)),
  (2,  'school / sport / season',             (SELECT school_name || ' / ' || sport_name || ' / ' || coalesce(season, '(none)') FROM t)),
  (3,  'fundraising_enabled',                 (SELECT coalesce(fundraising_enabled::text, 'null') FROM t)),
  (4,  'is_demo / status',                    (SELECT is_demo::text || ' / ' || coalesce(status, 'null') FROM t)),
  (5,  'archived / completed',                (SELECT coalesce(archived, false)::text || ' / ' || (season_completed_at IS NOT NULL)::text FROM t)),
  (6,  'CRM contact linked',                  (SELECT (crm_contact_id IS NOT NULL)::text FROM t)),
  (7,  'program_id set',                      (SELECT (program_id IS NOT NULL)::text FROM t)),
  (8,  'goal $ / athlete goal $',             (SELECT coalesce((goal_cents / 100)::text, 'none') || ' / ' || coalesce((default_athlete_goal_cents / 100)::text, 'none') FROM t)),
  (9,  'coaches: head (with account / total)',
        (SELECT count(*) FILTER (WHERE account_id IS NOT NULL)::text || ' / ' || count(*)::text
           FROM public.team_coaches WHERE campaign_slug = 'elf-season-test-2026' AND role = 'head_coach')),
  (10, 'coaches: other roles',
        (SELECT count(*)::text FROM public.team_coaches WHERE campaign_slug = 'elf-season-test-2026' AND role <> 'head_coach')),
  (11, 'active join codes',
        (SELECT count(*)::text FROM public.team_join_codes WHERE campaign_slug = 'elf-season-test-2026' AND NOT revoked)),
  (12, 'fund uses',                           (SELECT count(*)::text FROM public.fund_uses WHERE campaign_slug = 'elf-season-test-2026')),
  (13, 'team contact goal',
        (SELECT coalesce(max(goal)::text, 'none') FROM public.fundraising_contact_goals
          WHERE campaign_slug = 'elf-season-test-2026' AND athlete_id IS NULL AND coach_id IS NULL)),
  (14, 'athletes / members / donations',
        (SELECT (SELECT count(*) FROM public.athletes WHERE campaign_slug = 'elf-season-test-2026')::text || ' / '
             || (SELECT count(*) FROM public.team_members WHERE campaign_slug = 'elf-season-test-2026')::text || ' / '
             || (SELECT count(*) FROM public.donations WHERE campaign_slug = 'elf-season-test-2026')::text)),
  (15, 'successor address elf-season-test-2027 free',
        (SELECT (NOT EXISTS (SELECT 1 FROM public.campaign_settings WHERE campaign_slug = 'elf-season-test-2027'))::text)),
  (16, 'all teams / completed seasons / transitions',
        (SELECT (SELECT count(*) FROM public.campaign_settings)::text || ' / '
             || (SELECT count(*) FROM public.campaign_settings WHERE season_completed_at IS NOT NULL)::text || ' / '
             || (SELECT count(*) FROM public.team_season_transitions)::text))
) AS r(n, item, value)
ORDER BY n;
