-- Synthetic data for the Complete Season tests. Disposable local database
-- only — no production data. Loaded BEFORE the Phase 1 migration (so the
-- migration's backfill and "existing data unchanged" checks have real rows
-- to work on). Every id is md5(<code>)::uuid; tests use qa.u('<code>').
\set ON_ERROR_STOP on
CREATE FUNCTION pg_temp.u(p text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT md5(p)::uuid $$;

-- ── Accounts, platform admin, school, CRM contact ─────────────────────
INSERT INTO public.elf_accounts (id, email, password_hash, salt, name)
SELECT pg_temp.u(c), c || '@example.test', 'x', 'x', 'Person ' || c
FROM unnest(ARRAY['a01','a02','a03','a04','a05','a06','a07','a08','a09','a10','a11','a12','a13','a14','a15','a16','a20']) c;
INSERT INTO public.platform_admins (id, account_id) VALUES (pg_temp.u('pa1'), pg_temp.u('a20'));
INSERT INTO public.organizations (id, slug, school_name) VALUES (pg_temp.u('org1'), 'lions-hs', 'Lions High School');
INSERT INTO public.coach_crm_contacts (id, name) VALUES (pg_temp.u('crm1'), 'Lions CRM contact');

-- ── Teams ──────────────────────────────────────────────────────────────
INSERT INTO public.campaign_settings (campaign_slug, school_name, sport_name, season, goal_cents, deadline,
  mascot, primary_color, secondary_color, location, logo_url, archived, show_leaderboard, show_sponsors,
  layout_variant, external_store_url, store_provider, default_athlete_goal_cents, contact_requirement, status,
  theme_primary_color, theme_secondary_color, theme_accent_color, theme_button_color, crm_contact_id,
  show_booster_in_staff_roster, organization_id, branding_customized, description, allow_coach_fundraising,
  fundraising_enabled)
VALUES
  ('lions-track-2027', 'Lions High School', 'Track and Field', '2027 Season', 500000, '2027-05-01',
   'Lions', '#112233', '#445566', 'Phoenix, AZ', 'https://cdn.example.test/lions.png', false, true, false,
   'premium', 'https://store.example.test/lions', 'other', 25000, 'phone_and_email', 'live',
   '#010101', '#020202', '#030303', '#040404', pg_temp.u('crm1'),
   false, pg_temp.u('org1'), true, 'Lions track program', true, true),
  ('bears-hoops-2027',  'Bears HS', 'Basketball', '26-27 Season', 100000, '2027-02-01', 'Bears', '#111111', '#222222',
   'Mesa, AZ', '', false, true, true, 'classic', NULL, NULL, NULL, 'phone_or_email', 'live',
   NULL, NULL, NULL, NULL, NULL, true, NULL, false, NULL, false, false),
  ('owls-live',         'Owls HS', 'Soccer', 'Fall', 0, '', 'Owls', '#111111', '#222222', 'Tempe, AZ', '',
   false, true, true, 'classic', NULL, NULL, NULL, 'phone_or_email', 'live', NULL, NULL, NULL, NULL, NULL,
   true, NULL, false, NULL, false, false),
  ('archived-team-2027','Old HS', 'Golf', '2027 Season', 0, '', 'Old', '#111111', '#222222', 'X', '', true, true, true,
   'classic', NULL, NULL, NULL, 'phone_or_email', 'live', NULL, NULL, NULL, NULL, NULL, true, NULL, false, NULL, false, false),
  ('taken-2027',        'Taken HS', 'Tennis', '2027 Season', 0, '', 'T', '#111111', '#222222', 'X', '', false, true, true,
   'classic', NULL, NULL, NULL, 'phone_or_email', 'live', NULL, NULL, NULL, NULL, NULL, true, NULL, false, NULL, false, false),
  ('taken-2028',        'Taken HS', 'Tennis', '2028 Season', 0, '', 'T', '#111111', '#222222', 'X', '', false, true, true,
   'classic', NULL, NULL, NULL, 'phone_or_email', 'live', NULL, NULL, NULL, NULL, NULL, true, NULL, false, NULL, false, false),
  ('nohead-2027',       'NoHead HS', 'Swim', '2027 Season', 0, '', 'N', '#111111', '#222222', 'X', '', false, true, true,
   'classic', NULL, NULL, NULL, 'phone_or_email', 'live', NULL, NULL, NULL, NULL, NULL, true, NULL, false, NULL, false, false),
  ('other-team-2027',   'Other HS', 'Volleyball', '2027 Season', 0, '', 'O', '#111111', '#222222', 'X', '', false, true, true,
   'classic', NULL, NULL, NULL, 'phone_or_email', 'live', NULL, NULL, NULL, NULL, NULL, true, NULL, false, NULL, false, false);

-- ── Lions: coaches ─────────────────────────────────────────────────────
INSERT INTO public.team_coaches (id, campaign_slug, name, email, role, password_hash, salt, account_id) VALUES
  (pg_temp.u('c01'), 'lions-track-2027', 'Hana Head',      'head@example.test',   'head_coach',      'unused', 'aa', pg_temp.u('a01')),
  (pg_temp.u('c02'), 'lions-track-2027', 'Avi Assistant',  'asst@example.test',   'assistant_coach', 'unused', 'bb', pg_temp.u('a02')),
  (pg_temp.u('c03'), 'lions-track-2027', 'Bo Booster',     'boost@example.test',  'booster',         'unused', 'cc', pg_temp.u('a03')),
  (pg_temp.u('c04'), 'lions-track-2027', 'Lee Legacy',     'legacy@example.test', 'head_coach',      'realhash', 'dd', NULL),
  (pg_temp.u('c05'), 'lions-track-2027', 'Ari Legacy Asst','legacy2@example.test','assistant_coach', 'realhash', 'ee', NULL),
  (pg_temp.u('c10'), 'bears-hoops-2027', 'Bea Bears',      'bears@example.test',  'head_coach',      'unused', 'ff', pg_temp.u('a12')),
  (pg_temp.u('c11'), 'owls-live',        'Ola Owls',       'owls@example.test',   'head_coach',      'unused', 'gg', pg_temp.u('a13')),
  (pg_temp.u('c12'), 'archived-team-2027','Arch Coach',    'arch@example.test',   'head_coach',      'unused', 'hh', pg_temp.u('a14')),
  (pg_temp.u('c13'), 'taken-2027',       'Tia Taken',      'taken@example.test',  'head_coach',      'unused', 'ii', pg_temp.u('a15')),
  (pg_temp.u('c14'), 'nohead-2027',      'Nia Legacy',     'nohead@example.test', 'head_coach',      'realhash', 'jj', NULL),
  (pg_temp.u('c15'), 'other-team-2027',  'Hana Head',      'head@example.test',   'head_coach',      'unused', 'kk', pg_temp.u('a01'));

-- ── Lions: athletes ────────────────────────────────────────────────────
INSERT INTO public.athletes (id, campaign_slug, name, event, class_year, jersey_number, grad_year, profile_photo,
                             goal_cents, contact_phone, contact_email, created_at) VALUES
  (pg_temp.u('s01'), 'lions-track-2027', 'Sam Senior',     '100m',  'Senior',       1,  2027, 'p/s01.jpg', 30000, '555-0001', 's01@example.test', now() - interval '200 days'),
  (pg_temp.u('s02'), 'lions-track-2027', 'Jo Junior',      '200m',  ' junior ',     2,  2028, 'p/s02.jpg', 31000, '555-0002', 's02@example.test', now() - interval '200 days'),
  (pg_temp.u('s03'), 'lions-track-2027', 'Sol Sophomore',  '400m',  'Sophomore',    3,  NULL, NULL,        NULL,  NULL,       NULL,               now() - interval '200 days'),
  (pg_temp.u('s04'), 'lions-track-2027', 'Fay Freshman',   'Mile',  'FRESHMAN',     4,  NULL, NULL,        NULL,  NULL,       NULL,               now() - interval '200 days'),
  (pg_temp.u('s05'), 'lions-track-2027', 'Mia Middle',     NULL,    '8th Grade',    5,  NULL, NULL,        NULL,  NULL,       NULL,               now() - interval '200 days'),
  (pg_temp.u('s06'), 'lions-track-2027', 'Otto Other',     NULL,    'Other',        6,  NULL, NULL,        NULL,  NULL,       NULL,               now() - interval '200 days'),
  (pg_temp.u('s07'), 'lions-track-2027', 'Bree Blank',     NULL,    NULL,           7,  NULL, NULL,        NULL,  NULL,       NULL,               now() - interval '200 days'),
  (pg_temp.u('s08'), 'lions-track-2027', 'Rhys Redshirt',  NULL,    'RS Sophomore', 8,  NULL, NULL,        NULL,  NULL,       NULL,               now() - interval '200 days'),
  (pg_temp.u('s09'), 'lions-track-2027', 'Lou Lowercase',  NULL,    'senior',       9,  NULL, NULL,        NULL,  NULL,       NULL,               now() - interval '200 days'),
  (pg_temp.u('s10'), 'lions-track-2027', 'Una Unclaimed',  NULL,    'Junior',       10, NULL, NULL,        NULL,  NULL,       NULL,               now() - interval '200 days'),
  (pg_temp.u('s20'), 'bears-hoops-2027', 'Ben Bear',       NULL,    'Junior',       20, NULL, NULL,        NULL,  NULL,       NULL,               now() - interval '50 days'),
  (pg_temp.u('s21'), 'owls-live',        'Oli Owl',        NULL,    'Freshman',     21, NULL, NULL,        NULL,  NULL,       NULL,               now() - interval '50 days'),
  (pg_temp.u('s22'), 'taken-2027',       'Tom Taken',      NULL,    'Junior',       22, NULL, NULL,        NULL,  NULL,       NULL,               now() - interval '50 days');

-- ── Lions: members ─────────────────────────────────────────────────────
INSERT INTO public.team_members (id, campaign_slug, role, name, phone, email, athlete_id, salt, account_id) VALUES
  (pg_temp.u('m01'), 'lions-track-2027', 'athlete', 'Jo Junior',        '555-1001', 'm01@example.test', pg_temp.u('s02'), 's1', pg_temp.u('a04')),
  (pg_temp.u('m02'), 'lions-track-2027', 'athlete', 'Sam Senior',       NULL, NULL, pg_temp.u('s01'), 's2', pg_temp.u('a05')),
  (pg_temp.u('m03'), 'lions-track-2027', 'athlete', 'Sol Sophomore',    NULL, NULL, pg_temp.u('s03'), 's3', NULL),
  (pg_temp.u('m04'), 'lions-track-2027', 'parent',  'Pat Mixed',        NULL, NULL, pg_temp.u('s01'), 's4', pg_temp.u('a06')),
  (pg_temp.u('m05'), 'lions-track-2027', 'parent',  'Gil Graduating',   NULL, NULL, pg_temp.u('s09'), 's5', pg_temp.u('a07')),
  (pg_temp.u('m06'), 'lions-track-2027', 'parent',  'Two Returning',    NULL, NULL, pg_temp.u('s02'), 's6', pg_temp.u('a08')),
  (pg_temp.u('m07'), 'lions-track-2027', 'parent',  'Nora NoAccount',   NULL, NULL, NULL,             's7', NULL),
  (pg_temp.u('m08'), 'lions-track-2027', 'booster', 'Bay Booster',      NULL, NULL, NULL,             's8', pg_temp.u('a09')),
  (pg_temp.u('m09'), 'lions-track-2027', 'booster', 'Lex LegacyBooster',NULL, NULL, NULL,             's9', NULL),
  (pg_temp.u('m10'), 'lions-track-2027', 'parent',  'Kit NoKids',       NULL, NULL, NULL,             'sa', pg_temp.u('a10')),
  (pg_temp.u('m11'), 'lions-track-2027', 'athlete', 'Ula Unlinked',     NULL, NULL, NULL,             'sb', pg_temp.u('a11')),
  (pg_temp.u('m12'), 'lions-track-2027', 'parent',  'Hana Head',        NULL, NULL, NULL,             'sc', pg_temp.u('a01')),
  (pg_temp.u('m20'), 'bears-hoops-2027', 'athlete', 'Ben Bear',         NULL, NULL, pg_temp.u('s20'), 'sd', pg_temp.u('a16'));

INSERT INTO public.team_member_athletes (team_member_id, athlete_id) VALUES
  (pg_temp.u('m04'), pg_temp.u('s03')),   -- mixed parent: legacy s01 graduates, s03 returns
  (pg_temp.u('m06'), pg_temp.u('s02')),
  (pg_temp.u('m06'), pg_temp.u('s04')),
  (pg_temp.u('m07'), pg_temp.u('s04')),   -- no account
  (pg_temp.u('m12'), pg_temp.u('s05'));   -- head coach who is also a parent

-- ── Lions: history and configuration ───────────────────────────────────
INSERT INTO public.calendar_events (id, campaign_slug, title, event_date, event_time, location, type, coach_id, description, start_time, end_time) VALUES
  (pg_temp.u('e01'), 'lions-track-2027', 'Old meet',      public.team_attendance_today('lions-track-2027') - 30, '9am', 'Track', 'meet', pg_temp.u('c01'), 'past', '09:00', '12:00'),
  (pg_temp.u('e02'), 'lions-track-2027', 'Yesterday',     public.team_attendance_today('lions-track-2027') - 1,  '',    '',      'team', NULL,              NULL,   NULL,    NULL),
  (pg_temp.u('e03'), 'lions-track-2027', 'Today practice',public.team_attendance_today('lions-track-2027'),      '3pm', 'Field', 'practice', pg_temp.u('c02'), 'today', '15:00', '17:00'),
  (pg_temp.u('e04'), 'lions-track-2027', 'Future meet',   public.team_attendance_today('lions-track-2027') + 10, '8am', 'Away',  'meet', pg_temp.u('c01'), 'future', '08:00', '14:00'),
  (pg_temp.u('e05'), 'lions-track-2027', 'Legacy coach event', public.team_attendance_today('lions-track-2027') + 20, '', '', 'team', pg_temp.u('c04'), NULL, NULL, NULL);

INSERT INTO public.fund_uses (id, campaign_slug, title, description, icon, sort_order) VALUES
  (pg_temp.u('f01'), 'lions-track-2027', 'Uniforms', 'New uniforms', '👕', 1),
  (pg_temp.u('f02'), 'lions-track-2027', 'Travel',   'Meet travel',  '🚌', 2);
INSERT INTO public.team_products (id, campaign_slug, name, description, category, price_cents, image_url, visible, display_order, cost_cents, external_url) VALUES
  (pg_temp.u('g01'), 'lions-track-2027', 'Hoodie', 'Warm', 'apparel', 4500, 'img/h.png', true,  2, 2000, 'https://store.example.test/h'),
  (pg_temp.u('g02'), 'lions-track-2027', 'Cap',    NULL,   'general', 2000, NULL,        false, 1, NULL, NULL);
INSERT INTO public.fundraising_contact_goals (id, campaign_slug, athlete_id, goal, set_by_coach_id) VALUES
  (pg_temp.u('cg1'), 'lions-track-2027', NULL,              12, pg_temp.u('c01')),
  (pg_temp.u('cg2'), 'lions-track-2027', pg_temp.u('s02'),  20, pg_temp.u('c01'));
INSERT INTO public.sponsors (id, campaign_slug, name, url, tier, display_order) VALUES
  (pg_temp.u('sp1'), 'lions-track-2027', 'Acme Auto', 'https://acme.example.test', 'title', 1),
  (pg_temp.u('sp2'), 'lions-track-2027', 'Bob Bakery','https://bob.example.test',  'gold',  2);
INSERT INTO public.team_tasks (id, campaign_slug, title, audience) VALUES
  (pg_temp.u('tk1'), 'lions-track-2027', 'Physical forms', 'both');
INSERT INTO public.clearance_resources (id, campaign_slug, title, url, sort_order) VALUES
  (pg_temp.u('cr1'), 'lions-track-2027', 'Handbook', 'https://example.test/handbook', 1);
INSERT INTO public.donations (id, donor_name, amount, amount_cents, campaign_slug, athlete_id, stripe_session_id, created_at) VALUES
  (pg_temp.u('d01'), 'Old Donor', 50, 5000, 'lions-track-2027', pg_temp.u('s02'), 'cs_test_old_1', now() - interval '30 days'),
  (pg_temp.u('d02'), 'New Donor', 25, 2500, 'lions-track-2027', pg_temp.u('s01'), 'cs_test_recent_1', now() - interval '1 hour');
INSERT INTO public.announcements (id, campaign_slug, title, body, author_name, author_role, coach_id) VALUES
  (pg_temp.u('an1'), 'lions-track-2027', 'Welcome', 'Season kickoff', 'Hana Head', 'head_coach', pg_temp.u('c01'));
INSERT INTO public.message_threads (id, campaign_slug, created_by_type, created_by_coach_id, creator_name, creator_role, thread_type, group_name) VALUES
  (pg_temp.u('th1'), 'lions-track-2027', 'coach', pg_temp.u('c01'), 'Hana Head', 'head_coach', 'group', 'Sprinters'),
  (pg_temp.u('th2'), 'lions-track-2027', 'coach', pg_temp.u('c01'), 'Hana Head', 'head_coach', 'dm', NULL);
INSERT INTO public.message_thread_participants (thread_id, actor_type, coach_id, member_id) VALUES
  (pg_temp.u('th1'), 'coach',  pg_temp.u('c01'), NULL),
  (pg_temp.u('th1'), 'member', NULL, pg_temp.u('m01')),
  (pg_temp.u('th2'), 'coach',  pg_temp.u('c01'), NULL),
  (pg_temp.u('th2'), 'member', NULL, pg_temp.u('m06'));
INSERT INTO public.messages (thread_id, sender_type, sender_coach_id, body, sender_name, sender_role) VALUES
  (pg_temp.u('th1'), 'coach', pg_temp.u('c01'), 'Practice at 3', 'Hana Head', 'head_coach'),
  (pg_temp.u('th2'), 'coach', pg_temp.u('c01'), 'Hello', 'Hana Head', 'head_coach');

-- Today's attendance, through the real save function (the only writer).
SELECT public.team_attendance_save_draft('lions-track-2027', public.team_attendance_today('lions-track-2027'), 0,
  (SELECT jsonb_agg(jsonb_build_object('athlete_id', a.id, 'status', 'present') ORDER BY a.id)
   FROM public.athletes a WHERE a.campaign_slug = 'lions-track-2027'),
  jsonb_build_object('coach_id', pg_temp.u('c01')));

-- Safety blocks.
INSERT INTO public.user_blocks (campaign_slug, blocker_kind, blocker_id, blocked_kind, blocked_id) VALUES
  ('lions-track-2027', 'member', pg_temp.u('m01'), 'member', pg_temp.u('m06')),         -- both carry -> copied
  ('lions-track-2027', 'platform_admin', pg_temp.u('pa1'), 'member', pg_temp.u('m08')), -- admin + carried booster -> copied
  ('lions-track-2027', 'member', pg_temp.u('m02'), 'coach', pg_temp.u('c01')),          -- graduated blocker -> not copied
  ('lions-track-2027', 'coach', pg_temp.u('c04'), 'member', pg_temp.u('m01'));          -- legacy coach -> not copied

-- Join code, calendar feed links, web push, team order.
INSERT INTO public.team_join_codes (campaign_slug, code) VALUES
  ('lions-track-2027', 'LIONS7'), ('bears-hoops-2027', 'BEARS7'), ('owls-live', 'OWLSXX');
INSERT INTO public.calendar_subscription_tokens (id, campaign_slug, revoked_at) VALUES
  (pg_temp.u('ct1'), 'lions-track-2027', NULL),
  (pg_temp.u('ct2'), 'lions-track-2027', now() - interval '10 days');
INSERT INTO public.push_subscriptions (id, campaign_slug, platform, endpoint, member_id, coach_id) VALUES
  (pg_temp.u('ps1'), 'lions-track-2027', 'web', 'https://push.example.test/1', pg_temp.u('m01'), NULL),
  (pg_temp.u('ps2'), 'lions-track-2027', 'web', 'https://push.example.test/2', pg_temp.u('m02'), NULL),
  (pg_temp.u('ps3'), 'lions-track-2027', 'web', 'https://push.example.test/3', NULL, pg_temp.u('c01')),
  (pg_temp.u('ps4'), 'lions-track-2027', 'web', 'https://push.example.test/4', NULL, NULL);
INSERT INTO public.account_team_order (account_id, team_slugs) VALUES
  (pg_temp.u('a01'), ARRAY['other-team-2027', 'lions-track-2027']),
  (pg_temp.u('a06'), ARRAY['lions-track-2027']),
  (pg_temp.u('a05'), ARRAY['lions-track-2027']);

-- ── Bears: pending requests and invitation (blockers) ──────────────────
INSERT INTO public.pending_athlete_requests (id, campaign_slug, account_id, full_name, class_year)
  VALUES (pg_temp.u('pr1'), 'bears-hoops-2027', pg_temp.u('a10'), 'New Kid', 'Freshman');
INSERT INTO public.parent_access_requests (id, campaign_slug, account_id, parent_name, athlete_id)
  VALUES (pg_temp.u('pr2'), 'bears-hoops-2027', pg_temp.u('a11'), 'New Parent', pg_temp.u('s20'));
INSERT INTO public.team_staff_invitations (id, campaign_slug, email, normalized_email, full_name, role, token_hash, expires_at)
  VALUES (pg_temp.u('pr3'), 'bears-hoops-2027', 'Asst@Example.test', 'asst@example.test', 'New Assistant', 'assistant_coach', 'hash-pr3', now() + interval '5 days'),
         (pg_temp.u('pr4'), 'bears-hoops-2027', 'old@example.test',  'old@example.test',  'Expired Invite', 'booster',         'hash-pr4', now() - interval '5 days');
INSERT INTO public.fundraising_inquiries (id, campaign_slug, requested_by_account_id, requested_by_role)
  VALUES (pg_temp.u('fi1'), 'bears-hoops-2027', pg_temp.u('a12'), 'head_coach');
