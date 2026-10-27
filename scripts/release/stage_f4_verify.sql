-- Stage F4 — read-only verification after the ONE production completion of
-- elf-season-test-2026 -> elf-season-test-2027. One SELECT; changes nothing.
-- Counts, flags and PASS/FAIL only — no names, emails, join codes, keys,
-- passwords, hashes, salts or tokens. Every row must say PASS.
--
-- Expected values come from the Stage F1 preview: 7 athletes (2 Seniors
-- graduate; Junior, Sophomore, Freshman advance; 8th Grade unchanged; "Other"
-- flagged), 2 account-linked Head Coaches, 1 parent carried with 1 link (to
-- the Junior), 1 parent not carried (Senior only), 3 events of which 2 are
-- future, 6 fund uses, team contact goal 10, no products, no donations.
-- Rows 25–29 compare the other 44 teams; rerun stage_f1_baseline.sql too.
WITH
o  AS (SELECT * FROM public.campaign_settings WHERE campaign_slug = 'elf-season-test-2026'),
n  AS (SELECT * FROM public.campaign_settings WHERE campaign_slug = 'elf-season-test-2027'),
tr AS (SELECT * FROM public.team_season_transitions WHERE from_campaign_slug = 'elf-season-test-2026'),
oa AS (SELECT * FROM public.athletes WHERE campaign_slug = 'elf-season-test-2026'),
na AS (SELECT * FROM public.athletes WHERE campaign_slug = 'elf-season-test-2027'),
oc AS (SELECT * FROM public.team_coaches WHERE campaign_slug = 'elf-season-test-2026'),
nc AS (SELECT * FROM public.team_coaches WHERE campaign_slug = 'elf-season-test-2027'),
om AS (SELECT * FROM public.team_members WHERE campaign_slug = 'elf-season-test-2026'),
nm AS (SELECT * FROM public.team_members WHERE campaign_slug = 'elf-season-test-2027'),
nl AS (SELECT l.* FROM public.team_member_athletes l JOIN nm ON nm.id = l.team_member_id),
ol AS (SELECT l.* FROM public.team_member_athletes l JOIN om ON om.id = l.team_member_id),
-- The old parent linked to the Junior (carried) and the Senior-only parent.
junior AS (SELECT id FROM oa WHERE class_year = 'Junior'),
p_carry AS (SELECT DISTINCT om.account_id FROM om JOIN ol ON ol.team_member_id = om.id JOIN junior j ON j.id = ol.athlete_id),
p_grad  AS (SELECT om.account_id FROM om WHERE om.account_id NOT IN (SELECT account_id FROM p_carry)),
checks(n, item, actual, expected) AS (VALUES
  -- Whole database
  (1,  'teams / completed seasons / transitions',
       (SELECT count(*) FROM public.campaign_settings)::text || ' / '
       || (SELECT count(*) FROM public.campaign_settings WHERE season_completed_at IS NOT NULL)::text || ' / '
       || (SELECT count(*) FROM public.team_season_transitions)::text,
       '46 / 1 / 1'),
  -- The transition record
  (2,  'transition: from -> to, labels',
       (SELECT from_campaign_slug || ' -> ' || to_campaign_slug || ', ' || from_season_label || ' -> ' || to_season_label FROM tr),
       'elf-season-test-2026 -> elf-season-test-2027, 2026 Season -> 2027 Season'),
  (3,  'transition: actor is an account-linked Head Coach of the old season',
       (SELECT actor_kind || ' / account=' || (actor_account_id IS NOT NULL)::text
               || ' / coach_on_old_team=' || EXISTS (SELECT 1 FROM oc WHERE oc.id = tr.actor_coach_id AND oc.role = 'head_coach')::text FROM tr),
       'head_coach / account=true / coach_on_old_team=true'),
  (4,  'transition: program shared by both seasons',
       (SELECT ((SELECT program_id FROM tr) = (SELECT program_id FROM o) AND (SELECT program_id FROM o) = (SELECT program_id FROM n))::text),
       'true'),
  (5,  'transition summary: carried athletes / members / links / coaches / events / flagged',
       (SELECT concat_ws(' / ', summary->>'athletes_carried', summary->>'members_carried', summary->>'parent_links_carried',
                         summary->>'coaches_carried', summary->>'calendar_events_copied', summary->>'athletes_flagged') FROM tr),
       '5 / 1 / 1 / 2 / 2 / 1'),
  (6,  'transition summary: graduated / fund uses / products / contact goal',
       (SELECT concat_ws(' / ', summary->>'athletes_graduated', summary->>'fund_uses_copied', summary->>'store_products_copied',
                         summary->>'team_contact_goal_copied') FROM tr),
       '2 / 6 / 0 / true'),
  -- Old season: completed and archived
  (7,  'old season: archived / completed / successor / fundraising',
       (SELECT archived::text || ' / ' || (season_completed_at IS NOT NULL)::text || ' / ' || coalesce(successor_campaign_slug, 'none')
               || ' / ' || coalesce(fundraising_enabled::text, 'null') FROM o),
       'true / true / elf-season-test-2027 / false'),
  (8,  'old season: label and slug unchanged; completed_at = transition time',
       (SELECT season || ' / ' || ((SELECT season_completed_at FROM o) = (SELECT completed_at FROM tr))::text FROM o),
       '2026 Season / true'),
  -- New season: active, fundraising off
  (9,  'new season: archived / completed / predecessor / successor',
       (SELECT archived::text || ' / ' || (season_completed_at IS NOT NULL)::text || ' / ' || coalesce(predecessor_campaign_slug, 'none')
               || ' / ' || coalesce(successor_campaign_slug, 'none') FROM n),
       'false / false / elf-season-test-2026 / none'),
  (10, 'new season: label / fundraising / CRM linked / deadline set',
       (SELECT season || ' / ' || coalesce(fundraising_enabled::text, 'null') || ' / ' || (crm_contact_id IS NOT NULL)::text
               || ' / ' || (coalesce(deadline, '') <> '')::text FROM n),
       '2027 Season / false / false / false'),
  (11, 'new season: same school / sport / demo flag / status as old',
       (SELECT (n.school_name = o.school_name AND n.sport_name = o.sport_name
                AND n.is_demo IS NOT DISTINCT FROM o.is_demo AND n.status IS NOT DISTINCT FROM o.status)::text FROM o, n),
       'true'),
  -- Athletes
  (12, 'athletes old / new',
       (SELECT count(*) FROM oa)::text || ' / ' || (SELECT count(*) FROM na)::text, '7 / 5'),
  (13, 'new athletes each come from a returning old athlete, with the advanced grade',
       (SELECT count(*) FILTER (WHERE x.ok)::text || ' of ' || count(*)::text FROM (
          SELECT (oa.id IS NOT NULL AND c.outcome <> 'graduate' AND na.class_year IS NOT DISTINCT FROM c.next_class
                  AND na.name = oa.name AND na.goal_cents IS NULL) AS ok
          FROM na LEFT JOIN oa ON oa.id = na.previous_season_athlete_id
          LEFT JOIN LATERAL public.season_next_class(oa.class_year) c ON true) x),
       '5 of 5'),
  (14, 'new grades: Senior / Junior / Sophomore / 8th Grade / Other',
       (SELECT concat_ws(' / ', count(*) FILTER (WHERE class_year = 'Senior'), count(*) FILTER (WHERE class_year = 'Junior'),
               count(*) FILTER (WHERE class_year = 'Sophomore'), count(*) FILTER (WHERE class_year = '8th Grade'),
               count(*) FILTER (WHERE class_year = 'Other')) FROM na),
       '1 / 1 / 1 / 1 / 1'),
  (15, 'graduated Seniors copied / old grades still as stored',
       (SELECT count(*) FROM na JOIN oa ON oa.id = na.previous_season_athlete_id WHERE oa.class_year = 'Senior')::text || ' / '
       || (SELECT concat_ws(',', count(*) FILTER (WHERE class_year = 'Senior'), count(*) FILTER (WHERE class_year = 'Junior'),
                  count(*) FILTER (WHERE class_year = 'Sophomore'), count(*) FILTER (WHERE class_year = 'Freshman'),
                  count(*) FILTER (WHERE class_year = '8th Grade'), count(*) FILTER (WHERE class_year = 'Other')) FROM oa),
       '0 / 2,1,1,1,1,1'),
  (16, 'flagged athlete recorded = the "Other" athlete',
       (SELECT (flagged_athlete_ids = ARRAY(SELECT id FROM oa WHERE class_year = 'Other'))::text FROM tr),
       'true'),
  -- Coaches
  (17, 'coaches old / new (all Head Coach, all account-linked)',
       (SELECT count(*) FROM oc)::text || ' / ' || (SELECT count(*) FILTER (WHERE role = 'head_coach' AND account_id IS NOT NULL) FROM nc)::text
       || ' of ' || (SELECT count(*) FROM nc)::text,
       '2 / 2 of 2'),
  (18, 'new coaches are exactly the old coaches'' accounts',
       (SELECT (ARRAY(SELECT account_id FROM oc ORDER BY 1) = ARRAY(SELECT account_id FROM nc ORDER BY 1))::text),
       'true'),
  -- Parents
  (19, 'members old / new; new member is the Junior''s parent, role parent',
       (SELECT count(*) FROM om)::text || ' / ' || (SELECT count(*) FROM nm)::text || '; '
       || (SELECT (count(*) = 1 AND bool_and(nm.role = 'parent' AND nm.account_id IN (SELECT account_id FROM p_carry)))::text FROM nm),
       '2 / 1; true'),
  (20, 'Senior-only parent not carried',
       (SELECT (NOT EXISTS (SELECT 1 FROM nm WHERE nm.account_id IN (SELECT account_id FROM p_grad)))::text
               || ' (' || (SELECT count(*) FROM p_grad)::text || ' such parent)'),
       'true (1 such parent)'),
  (21, 'new parent links: count / to the advanced Junior / old links kept',
       (SELECT count(*) FROM nl)::text || ' / '
       || (SELECT count(*) FROM nl JOIN na ON na.id = nl.athlete_id JOIN junior j ON j.id = na.previous_season_athlete_id)::text || ' / '
       || (SELECT count(*) FROM ol)::text,
       '1 / 1 / 3'),
  -- Join codes, events, configuration, history
  (22, 'join codes active: old / new',
       (SELECT count(*) FROM public.team_join_codes WHERE campaign_slug = 'elf-season-test-2026' AND NOT revoked)::text || ' / '
       || (SELECT count(*) FROM public.team_join_codes WHERE campaign_slug = 'elf-season-test-2027' AND NOT revoked)::text,
       '0 / 1'),
  (23, 'calendar events old / new; each new one copies an old event',
       (SELECT count(*) FROM public.calendar_events WHERE campaign_slug = 'elf-season-test-2026')::text || ' / '
       || (SELECT count(*) FROM public.calendar_events WHERE campaign_slug = 'elf-season-test-2027')::text || '; '
       || (SELECT bool_and(EXISTS (SELECT 1 FROM public.calendar_events e WHERE e.campaign_slug = 'elf-season-test-2026'
                                     AND e.title = x.title AND e.event_date = x.event_date))::text
             FROM public.calendar_events x WHERE x.campaign_slug = 'elf-season-test-2027'),
       '3 / 2; true'),
  (24, 'new season: fund uses / contact goal / products / announcements / threads / attendance / donations',
       concat_ws(' / ',
         (SELECT count(*) FROM public.fund_uses WHERE campaign_slug = 'elf-season-test-2027'),
         (SELECT coalesce(max(goal)::text, 'none') FROM public.fundraising_contact_goals
           WHERE campaign_slug = 'elf-season-test-2027' AND athlete_id IS NULL AND coach_id IS NULL),
         (SELECT count(*) FROM public.team_products WHERE campaign_slug = 'elf-season-test-2027'),
         (SELECT count(*) FROM public.announcements WHERE campaign_slug = 'elf-season-test-2027'),
         (SELECT count(*) FROM public.message_threads WHERE campaign_slug = 'elf-season-test-2027'),
         (SELECT count(*) FROM public.team_attendance_sessions WHERE campaign_slug = 'elf-season-test-2027'),
         (SELECT count(*) FROM public.donations WHERE campaign_slug = 'elf-season-test-2027')),
       '6 / 10 / 0 / 0 / 0 / 0 / 0'),
  (25, 'old season history kept: announcements / threads / attendance sessions / records',
       concat_ws(' / ',
         (SELECT count(*) FROM public.announcements WHERE campaign_slug = 'elf-season-test-2026'),
         (SELECT count(*) FROM public.message_threads WHERE campaign_slug = 'elf-season-test-2026'),
         (SELECT count(*) FROM public.team_attendance_sessions WHERE campaign_slug = 'elf-season-test-2026'),
         (SELECT count(*) FROM public.team_attendance_records WHERE campaign_slug = 'elf-season-test-2026')),
       '1 / 1 / 1 / 7'),
  -- Every other team
  (26, 'other teams completed / with successor / with predecessor',
       (SELECT count(*) FILTER (WHERE season_completed_at IS NOT NULL)::text || ' / '
               || count(*) FILTER (WHERE successor_campaign_slug IS NOT NULL)::text || ' / '
               || count(*) FILTER (WHERE predecessor_campaign_slug IS NOT NULL)::text
          FROM public.campaign_settings WHERE campaign_slug NOT IN ('elf-season-test-2026', 'elf-season-test-2027')),
       '0 / 0 / 0'),
  (27, 'other teams archived (2 before F3)',
       (SELECT count(*)::text FROM public.campaign_settings
         WHERE archived AND campaign_slug NOT IN ('elf-season-test-2026', 'elf-season-test-2027')),
       '2'),
  (28, 'transitions touching any other team',
       (SELECT count(*)::text FROM public.team_season_transitions
         WHERE from_campaign_slug <> 'elf-season-test-2026' OR to_campaign_slug <> 'elf-season-test-2027'),
       '0'),
  (29, 'athletes pointing at a previous season on another team',
       (SELECT count(*)::text FROM public.athletes a JOIN public.athletes p ON p.id = a.previous_season_athlete_id
         WHERE NOT (a.campaign_slug = 'elf-season-test-2027' AND p.campaign_slug = 'elf-season-test-2026')),
       '0')
)
SELECT n, CASE WHEN actual IS NOT DISTINCT FROM expected THEN 'PASS' ELSE 'FAIL' END AS status,
       item, coalesce(actual, 'NULL') AS actual, expected
FROM checks
UNION ALL
SELECT 30, CASE WHEN count(*) FILTER (WHERE actual IS DISTINCT FROM expected) = 0 THEN 'PASS' ELSE 'FAIL' END,
       'ALL CHECKS', count(*) FILTER (WHERE actual IS NOT DISTINCT FROM expected)::text || ' of ' || count(*)::text || ' pass', '29 of 29 pass'
FROM checks
ORDER BY 1;
