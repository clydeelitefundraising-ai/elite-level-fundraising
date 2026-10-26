-- ELF QA synthetic data. Fictional people only (@example.test), no
-- production data of any kind. Applied by scripts/qa/apply-seed.sh after the
-- marker check, as one transaction. Password hashes and salts arrive as psql
-- variables from seed-vars.sql, generated OUTSIDE the repository with the QA
-- secrets (scripts/qa/generate-seed-vars.mjs); this file contains none.
--
-- Teams
--   lions-track-2027  full Complete Season scenario (every grade case, mixed
--                     families, coach-parent, legacy people, history of every
--                     kind, recent donation, safety block, calendar feed)
--   bears-hoops-2027  "26-27 Season"; pending athlete/parent requests and a live
--                     staff invitation (preview blockers); open inquiry
--   owls-soccer-fall  no year in the address, season "Fall" (name/address
--                     must be entered); legacy coach also on Lions
--   hawks-track-2027  to be completed by seed_complete_hawks.sql (read-only
--                     season + account-deletion testing)
\set ON_ERROR_STOP on
CREATE FUNCTION pg_temp.u(p text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT md5('elf-qa-seed:' || p)::uuid $$;

-- ── School and ELF Community Partner ──────────────────────────────────
INSERT INTO public.organizations (id, slug, school_name, show_community_partners, show_community_partners_public)
  VALUES (pg_temp.u('org-lions'), 'qa-lions-high-school', 'QA Lions High School', true, true);
INSERT INTO public.community_partners (id, business_name, short_description, website_url, is_active, is_featured, display_order)
  VALUES (pg_temp.u('cp1'), 'QA Partner Co', 'Synthetic partner for QA', 'https://partner.example.test', true, true, 1);

-- ── Accounts (passwords: see qa-logins.txt outside the repository) ────
INSERT INTO public.elf_accounts (id, email, name, password_hash, salt) VALUES
  (pg_temp.u('qa_admin'),      'qa.admin@example.test',        'QA Platform Admin', :'h_qa_admin',      :'s_qa_admin'),
  (pg_temp.u('lions_head'),    'lions.head@example.test',      'Hana Head',         :'h_lions_head',    :'s_lions_head'),
  (pg_temp.u('lions_asst'),    'lions.assistant@example.test', 'Avi Assistant',     :'h_lions_asst',    :'s_lions_asst'),
  (pg_temp.u('lions_booster'), 'lions.booster@example.test',   'Bo Booster',        :'h_lions_booster', :'s_lions_booster'),
  (pg_temp.u('lions_jo'),      'jo.junior@example.test',       'Jo Junior',         :'h_lions_jo',      :'s_lions_jo'),
  (pg_temp.u('lions_sam'),     'sam.senior@example.test',      'Sam Senior',        :'h_lions_sam',     :'s_lions_sam'),
  (pg_temp.u('lions_pat'),     'pat.mixed@example.test',       'Pat Mixed',         :'h_lions_pat',     :'s_lions_pat'),
  (pg_temp.u('lions_two'),     'tess.two@example.test',        'Tess Two',          :'h_lions_two',     :'s_lions_two'),
  (pg_temp.u('lions_gil'),     'gil.graduating@example.test',  'Gil Graduating',    :'h_lions_gil',     :'s_lions_gil'),
  (pg_temp.u('lions_bay'),     'bay.booster@example.test',     'Bay Booster',       :'h_lions_bay',     :'s_lions_bay'),
  (pg_temp.u('bears_head'),    'bears.head@example.test',      'Bea Bears',         :'h_bears_head',    :'s_bears_head'),
  (pg_temp.u('bears_ben'),     'ben.bear@example.test',        'Ben Bear',          :'h_bears_ben',     :'s_bears_ben'),
  (pg_temp.u('bears_req'),     'new.kid@example.test',         'Nico New',          :'h_bears_req',     :'s_bears_req'),
  (pg_temp.u('bears_par'),     'new.parent@example.test',      'Nell New',          :'h_bears_par',     :'s_bears_par'),
  (pg_temp.u('owls_head'),     'owls.head@example.test',       'Ola Owls',          :'h_owls_head',     :'s_owls_head'),
  (pg_temp.u('hawks_head'),    'hawks.head@example.test',      'Hal Hawk',          :'h_hawks_head',    :'s_hawks_head'),
  (pg_temp.u('hawks_hank'),    'hank.hawk@example.test',       'Hank Hawk',         :'h_hawks_hank',    :'s_hawks_hank'),
  (pg_temp.u('hawks_del'),     'delete.me@example.test',       'Della Delete',      :'h_hawks_del',     :'s_hawks_del');
INSERT INTO public.platform_admins (id, account_id) VALUES (pg_temp.u('pa'), pg_temp.u('qa_admin'));

-- ── Teams ──────────────────────────────────────────────────────────────
INSERT INTO public.campaign_settings (campaign_slug, school_name, sport_name, season, goal_cents, deadline, mascot,
  primary_color, secondary_color, location, organization_id, fundraising_enabled, default_athlete_goal_cents,
  description, allow_coach_fundraising, show_sponsors) VALUES
  ('lions-track-2027', 'QA Lions High School', 'Track and Field', '2027 Season', 500000, '2027-05-01', 'Lions',
   '#7A1F1F', '#F2C14E', 'Phoenix, AZ', pg_temp.u('org-lions'), true, 25000, 'QA Lions track program', true, true),
  ('bears-hoops-2027', 'QA Bears High School', 'Basketball', '26-27 Season', 100000, '2027-02-01', 'Bears',
   '#1F3A7A', '#C0C0C0', 'Mesa, AZ', NULL, false, NULL, NULL, false, true),
  ('owls-soccer-fall', 'QA Owls Academy', 'Soccer', 'Fall', 0, '', 'Owls',
   '#2F6B3B', '#FFFFFF', 'Tempe, AZ', NULL, false, NULL, NULL, false, true),
  ('hawks-track-2027', 'QA Hawks High School', 'Track and Field', '2027 Season', 200000, '2027-04-15', 'Hawks',
   '#5B2A86', '#FFD23F', 'Tucson, AZ', NULL, true, 10000, NULL, false, true);

-- ── Coaches ────────────────────────────────────────────────────────────
-- Account-linked rows use the placeholder password (they sign in with their
-- ELF account). The legacy coach signs in with the team login on two teams
-- with the SAME password (exercises the "choose your team" login).
INSERT INTO public.team_coaches (id, campaign_slug, name, email, role, password_hash, salt, account_id) VALUES
  (pg_temp.u('c_lions_head'),    'lions-track-2027', 'Hana Head',     'lions.head@example.test',      'head_coach',      'unused', md5(random()::text), pg_temp.u('lions_head')),
  (pg_temp.u('c_lions_asst'),    'lions-track-2027', 'Avi Assistant', 'lions.assistant@example.test', 'assistant_coach', 'unused', md5(random()::text), pg_temp.u('lions_asst')),
  (pg_temp.u('c_lions_booster'), 'lions-track-2027', 'Bo Booster',    'lions.booster@example.test',   'booster',         'unused', md5(random()::text), pg_temp.u('lions_booster')),
  (pg_temp.u('c_lions_legacy'),  'lions-track-2027', 'Lee Legacy',    'legacy.coach@example.test',    'head_coach',      :'h_legacy_lions', :'s_legacy_lions', NULL),
  (pg_temp.u('c_bears_head'),    'bears-hoops-2027', 'Bea Bears',     'bears.head@example.test',      'head_coach',      'unused', md5(random()::text), pg_temp.u('bears_head')),
  (pg_temp.u('c_owls_head'),     'owls-soccer-fall', 'Ola Owls',      'owls.head@example.test',       'head_coach',      'unused', md5(random()::text), pg_temp.u('owls_head')),
  (pg_temp.u('c_owls_legacy'),   'owls-soccer-fall', 'Lee Legacy',    'legacy.coach@example.test',    'assistant_coach', :'h_legacy_owls', :'s_legacy_owls', NULL),
  (pg_temp.u('c_hawks_head'),    'hawks-track-2027', 'Hal Hawk',      'hawks.head@example.test',      'head_coach',      'unused', md5(random()::text), pg_temp.u('hawks_head'));

-- ── Athletes ───────────────────────────────────────────────────────────
INSERT INTO public.athletes (id, campaign_slug, name, event, class_year, jersey_number, grad_year, contact_email, created_at) VALUES
  (pg_temp.u('a_sam'),   'lions-track-2027', 'Sam Senior',     '100m',  'Senior',       1,  2027, 'sam.senior@example.test', now() - interval '200 days'),
  (pg_temp.u('a_jo'),    'lions-track-2027', 'Jo Junior',      '200m',  ' junior ',     2,  2028, 'jo.junior@example.test',  now() - interval '200 days'),
  (pg_temp.u('a_sol'),   'lions-track-2027', 'Sol Sophomore',  '400m',  'Sophomore',    3,  NULL, NULL, now() - interval '200 days'),
  (pg_temp.u('a_fay'),   'lions-track-2027', 'Fay Freshman',   'Mile',  'FRESHMAN',     4,  NULL, NULL, now() - interval '200 days'),
  (pg_temp.u('a_mia'),   'lions-track-2027', 'Mia Middle',     NULL,    '8th Grade',    5,  NULL, NULL, now() - interval '200 days'),
  (pg_temp.u('a_otto'),  'lions-track-2027', 'Otto Other',     NULL,    'Other',        6,  NULL, NULL, now() - interval '200 days'),
  (pg_temp.u('a_bree'),  'lions-track-2027', 'Bree Blank',     NULL,    NULL,           7,  NULL, NULL, now() - interval '200 days'),
  (pg_temp.u('a_rhys'),  'lions-track-2027', 'Rhys Redshirt',  NULL,    'RS Sophomore', 8,  NULL, NULL, now() - interval '200 days'),
  (pg_temp.u('a_lou'),   'lions-track-2027', 'Lou Lowercase',  NULL,    'senior',       9,  NULL, NULL, now() - interval '200 days'),
  (pg_temp.u('a_una'),   'lions-track-2027', 'Una Unclaimed',  NULL,    'Junior',       10, NULL, NULL, now() - interval '200 days'),
  (pg_temp.u('a_ben'),   'bears-hoops-2027', 'Ben Bear',       NULL,    'Junior',       20, NULL, NULL, now() - interval '60 days'),
  (pg_temp.u('a_oli'),   'owls-soccer-fall', 'Oli Owl',        NULL,    'Freshman',     21, NULL, NULL, now() - interval '60 days'),
  (pg_temp.u('a_hank'),  'hawks-track-2027', 'Hank Hawk',      'Shot',  'Sophomore',    30, NULL, NULL, now() - interval '90 days'),
  (pg_temp.u('a_hope'),  'hawks-track-2027', 'Hope Hawk',      '800m',  'Senior',       31, NULL, NULL, now() - interval '90 days');

-- ── Members (account-linked and legacy) ────────────────────────────────
INSERT INTO public.team_members (id, campaign_slug, role, name, email, athlete_id, salt, account_id) VALUES
  (pg_temp.u('m_jo'),    'lions-track-2027', 'athlete', 'Jo Junior',      'jo.junior@example.test',      pg_temp.u('a_jo'),  md5(random()::text), pg_temp.u('lions_jo')),
  (pg_temp.u('m_sam'),   'lions-track-2027', 'athlete', 'Sam Senior',     'sam.senior@example.test',     pg_temp.u('a_sam'), md5(random()::text), pg_temp.u('lions_sam')),
  (pg_temp.u('m_sol'),   'lions-track-2027', 'athlete', 'Sol Sophomore',  NULL,                          pg_temp.u('a_sol'), md5(random()::text), NULL),
  (pg_temp.u('m_pat'),   'lions-track-2027', 'parent',  'Pat Mixed',      'pat.mixed@example.test',      pg_temp.u('a_sam'), md5(random()::text), pg_temp.u('lions_pat')),
  (pg_temp.u('m_gil'),   'lions-track-2027', 'parent',  'Gil Graduating', 'gil.graduating@example.test', pg_temp.u('a_lou'), md5(random()::text), pg_temp.u('lions_gil')),
  (pg_temp.u('m_two'),   'lions-track-2027', 'parent',  'Tess Two',       'tess.two@example.test',       pg_temp.u('a_jo'),  md5(random()::text), pg_temp.u('lions_two')),
  (pg_temp.u('m_nora'),  'lions-track-2027', 'parent',  'Nora NoAccount', NULL,                          NULL,               md5(random()::text), NULL),
  (pg_temp.u('m_bay'),   'lions-track-2027', 'booster', 'Bay Booster',    'bay.booster@example.test',    NULL,               md5(random()::text), pg_temp.u('lions_bay')),
  (pg_temp.u('m_lex'),   'lions-track-2027', 'booster', 'Lex Legacy',     NULL,                          NULL,               md5(random()::text), NULL),
  (pg_temp.u('m_hana'),  'lions-track-2027', 'parent',  'Hana Head',      'lions.head@example.test',     NULL,               md5(random()::text), pg_temp.u('lions_head')),
  (pg_temp.u('m_ben'),   'bears-hoops-2027', 'athlete', 'Ben Bear',       'ben.bear@example.test',       pg_temp.u('a_ben'), md5(random()::text), pg_temp.u('bears_ben')),
  (pg_temp.u('m_hank'),  'hawks-track-2027', 'athlete', 'Hank Hawk',      'hank.hawk@example.test',      pg_temp.u('a_hank'), md5(random()::text), pg_temp.u('hawks_hank')),
  (pg_temp.u('m_della'), 'hawks-track-2027', 'parent',  'Della Delete',   'delete.me@example.test',      pg_temp.u('a_hank'), md5(random()::text), pg_temp.u('hawks_del'));
INSERT INTO public.team_member_athletes (team_member_id, athlete_id) VALUES
  (pg_temp.u('m_pat'),  pg_temp.u('a_sol')),   -- mixed: legacy child graduates, linked child returns
  (pg_temp.u('m_two'),  pg_temp.u('a_jo')),
  (pg_temp.u('m_two'),  pg_temp.u('a_fay')),
  (pg_temp.u('m_nora'), pg_temp.u('a_fay')),   -- no account: must rejoin
  (pg_temp.u('m_hana'), pg_temp.u('a_mia')),   -- Head Coach who is also a parent
  (pg_temp.u('m_della'), pg_temp.u('a_hank'));

-- ── Lions history and configuration ────────────────────────────────────
INSERT INTO public.calendar_events (campaign_slug, title, event_date, event_time, location, type, coach_id, description, start_time, end_time) VALUES
  ('lions-track-2027', 'Early season meet',  public.team_attendance_today('lions-track-2027') - 30, '9am', 'Home track', 'meet', pg_temp.u('c_lions_head'), 'Past event', '09:00', '12:00'),
  ('lions-track-2027', 'Practice',           public.team_attendance_today('lions-track-2027'),      '3pm', 'Field',      'practice', pg_temp.u('c_lions_asst'), 'Today', '15:00', '17:00'),
  ('lions-track-2027', 'Invitational',       public.team_attendance_today('lions-track-2027') + 10, '8am', 'Away',       'meet', pg_temp.u('c_lions_head'), 'Future event', '08:00', '14:00'),
  ('lions-track-2027', 'Legacy coach event', public.team_attendance_today('lions-track-2027') + 20, '',    '',           'team', pg_temp.u('c_lions_legacy'), NULL, NULL, NULL);
INSERT INTO public.fund_uses (campaign_slug, title, description, icon, sort_order) VALUES
  ('lions-track-2027', 'Uniforms', 'New uniforms for the team', '👕', 1),
  ('lions-track-2027', 'Travel',   'Bus to away meets',         '🚌', 2);
INSERT INTO public.team_products (campaign_slug, name, description, category, price_cents, visible, display_order, cost_cents) VALUES
  ('lions-track-2027', 'Team Hoodie', 'Warm hoodie', 'apparel', 4500, true, 1, 2000),
  ('lions-track-2027', 'Team Cap',    NULL,          'general', 2000, false, 2, NULL);
INSERT INTO public.fundraising_contact_goals (campaign_slug, athlete_id, goal, set_by_coach_id) VALUES
  ('lions-track-2027', NULL, 12, pg_temp.u('c_lions_head'));
INSERT INTO public.sponsors (campaign_slug, name, url, tier, display_order) VALUES
  ('lions-track-2027', 'QA Auto Group',  'https://auto.example.test',   'title', 1),
  ('lions-track-2027', 'QA Bakery',      'https://bakery.example.test', 'gold',  2);
INSERT INTO public.team_tasks (campaign_slug, title, audience) VALUES ('lions-track-2027', 'Turn in physical forms', 'both');
INSERT INTO public.clearance_resources (campaign_slug, title, url, sort_order) VALUES ('lions-track-2027', 'Team handbook', 'https://example.test/handbook', 1);
INSERT INTO public.fundraising_contacts (campaign_slug, athlete_id, email, first_name, relationship, added_by_type)
  VALUES ('lions-track-2027', pg_temp.u('a_jo'), 'aunt.jo@example.test', 'Aunt', 'Family', 'athlete');
INSERT INTO public.athlete_outreach (athlete_id, campaign_slug, status, note) VALUES (pg_temp.u('a_jo'), 'lions-track-2027', 'contacted', 'Called');
INSERT INTO public.donations (donor_name, amount, amount_cents, campaign_slug, athlete_id, stripe_session_id, donation_message, created_at) VALUES
  ('QA Donor One',   50, 5000, 'lions-track-2027', pg_temp.u('a_jo'),  'cs_test_qa_seed_1', 'Go Lions!', now() - interval '30 days'),
  ('QA Donor Two',   25, 2500, 'lions-track-2027', pg_temp.u('a_sam'), 'cs_test_qa_seed_2', NULL,        now() - interval '10 days'),
  ('QA Donor Three', 10, 1000, 'lions-track-2027', NULL,               'cs_test_qa_seed_3', NULL,        now() - interval '1 hour');
INSERT INTO public.announcements (id, campaign_slug, title, body, author_name, author_role, coach_id) VALUES
  (pg_temp.u('an_lions'), 'lions-track-2027', 'Season kickoff', 'Welcome to the season!', 'Hana Head', 'head_coach', pg_temp.u('c_lions_head'));
INSERT INTO public.message_threads (id, campaign_slug, created_by_type, created_by_coach_id, creator_name, creator_role, thread_type, group_name) VALUES
  (pg_temp.u('th_lions_group'), 'lions-track-2027', 'coach', pg_temp.u('c_lions_head'), 'Hana Head', 'head_coach', 'group', 'Sprinters'),
  (pg_temp.u('th_lions_dm'),    'lions-track-2027', 'coach', pg_temp.u('c_lions_head'), 'Hana Head', 'head_coach', 'dm', NULL);
INSERT INTO public.message_thread_participants (thread_id, actor_type, coach_id, member_id) VALUES
  (pg_temp.u('th_lions_group'), 'coach',  pg_temp.u('c_lions_head'), NULL),
  (pg_temp.u('th_lions_group'), 'member', NULL, pg_temp.u('m_jo')),
  (pg_temp.u('th_lions_group'), 'member', NULL, pg_temp.u('m_two')),
  (pg_temp.u('th_lions_dm'),    'coach',  pg_temp.u('c_lions_head'), NULL),
  (pg_temp.u('th_lions_dm'),    'member', NULL, pg_temp.u('m_pat'));
INSERT INTO public.messages (thread_id, sender_type, sender_coach_id, sender_member_id, body, sender_name, sender_role) VALUES
  (pg_temp.u('th_lions_group'), 'coach',  pg_temp.u('c_lions_head'), NULL, 'Practice moves to 3pm.', 'Hana Head', 'head_coach'),
  (pg_temp.u('th_lions_group'), 'member', NULL, pg_temp.u('m_jo'), 'See you there!', 'Jo Junior', 'athlete'),
  (pg_temp.u('th_lions_dm'),    'coach',  pg_temp.u('c_lions_head'), NULL, 'Thanks for helping with the meet.', 'Hana Head', 'head_coach');
INSERT INTO public.user_blocks (campaign_slug, blocker_kind, blocker_id, blocked_kind, blocked_id)
  VALUES ('lions-track-2027', 'member', pg_temp.u('m_jo'), 'member', pg_temp.u('m_two'));
INSERT INTO public.team_join_codes (campaign_slug, code) VALUES
  ('lions-track-2027', 'QALION'), ('bears-hoops-2027', 'QABEAR'), ('owls-soccer-fall', 'QAOWLS'), ('hawks-track-2027', 'QAHAWK');
INSERT INTO public.calendar_subscription_tokens (campaign_slug) VALUES ('lions-track-2027');
-- Today's attendance, through the real save function (its only writer).
SELECT public.team_attendance_save_draft('lions-track-2027', public.team_attendance_today('lions-track-2027'), 0,
  (SELECT jsonb_agg(jsonb_build_object('athlete_id', a.id, 'status', 'present') ORDER BY a.id)
   FROM public.athletes a WHERE a.campaign_slug = 'lions-track-2027'),
  jsonb_build_object('coach_id', pg_temp.u('c_lions_head'))) \gset seed_lions_attendance_

-- ── Bears: blockers ────────────────────────────────────────────────────
INSERT INTO public.pending_athlete_requests (campaign_slug, account_id, full_name, class_year)
  VALUES ('bears-hoops-2027', pg_temp.u('bears_req'), 'Nico New', 'Freshman');
INSERT INTO public.parent_access_requests (campaign_slug, account_id, parent_name, athlete_id)
  VALUES ('bears-hoops-2027', pg_temp.u('bears_par'), 'Nell New', pg_temp.u('a_ben'));
INSERT INTO public.team_staff_invitations (campaign_slug, email, normalized_email, full_name, role, token_hash, expires_at)
  VALUES ('bears-hoops-2027', 'Asst.Invite@example.test', 'asst.invite@example.test', 'Ira Invite', 'assistant_coach', md5('elf-qa-seed:invite'), now() + interval '6 days');
INSERT INTO public.fundraising_inquiries (campaign_slug, requested_by_account_id, requested_by_role)
  VALUES ('bears-hoops-2027', pg_temp.u('bears_head'), 'head_coach');

-- ── Hawks: history to be completed (read-only + account deletion tests) ─
INSERT INTO public.announcements (id, campaign_slug, title, body, author_name, author_role, coach_id) VALUES
  (pg_temp.u('an_hawks'), 'hawks-track-2027', 'Meet schedule', 'Schedule posted.', 'Hal Hawk', 'head_coach', pg_temp.u('c_hawks_head'));
INSERT INTO public.announcement_comments (campaign_slug, announcement_id, author_type, author_member_id, author_name, author_role, body, status)
  VALUES ('hawks-track-2027', pg_temp.u('an_hawks'), 'member', pg_temp.u('m_della'), 'Della Delete', 'parent', 'Thanks!', 'approved');
INSERT INTO public.post_likes (campaign_slug, announcement_id, author_type, author_member_id)
  VALUES ('hawks-track-2027', pg_temp.u('an_hawks'), 'member', pg_temp.u('m_della'));
INSERT INTO public.message_threads (id, campaign_slug, created_by_type, created_by_coach_id, creator_name, creator_role, thread_type) VALUES
  (pg_temp.u('th_hawks_dm'), 'hawks-track-2027', 'coach', pg_temp.u('c_hawks_head'), 'Hal Hawk', 'head_coach', 'dm');
INSERT INTO public.message_thread_participants (thread_id, actor_type, coach_id, member_id) VALUES
  (pg_temp.u('th_hawks_dm'), 'coach',  pg_temp.u('c_hawks_head'), NULL),
  (pg_temp.u('th_hawks_dm'), 'member', NULL, pg_temp.u('m_della'));
INSERT INTO public.messages (thread_id, sender_type, sender_coach_id, sender_member_id, body, sender_name, sender_role) VALUES
  (pg_temp.u('th_hawks_dm'), 'coach',  pg_temp.u('c_hawks_head'), NULL, 'Can you drive Saturday?', 'Hal Hawk', 'head_coach'),
  (pg_temp.u('th_hawks_dm'), 'member', NULL, pg_temp.u('m_della'), 'Yes, happy to.', 'Della Delete', 'parent');
INSERT INTO public.donations (donor_name, amount, amount_cents, campaign_slug, athlete_id, stripe_session_id, created_at)
  VALUES ('QA Hawk Donor', 30, 3000, 'hawks-track-2027', pg_temp.u('a_hank'), 'cs_test_qa_seed_hawks_1', now() - interval '20 days');
