-- Phase 3A behavior tests. Disposable local database only.
-- Run as superuser after bootstrap + phase_t2 + phase_t3. Each check
-- writes a row to qa.results; the runner prints failures and a summary.
\set ON_ERROR_STOP on

CREATE SCHEMA qa;
GRANT USAGE ON SCHEMA qa TO PUBLIC;
CREATE TABLE qa.results (n serial PRIMARY KEY, name text, ok boolean, detail text);
GRANT ALL ON qa.results TO PUBLIC;
GRANT ALL ON SEQUENCE qa.results_n_seq TO PUBLIC;
CREATE TABLE qa.ids (k text PRIMARY KEY, id uuid);
GRANT ALL ON qa.ids TO PUBLIC;

CREATE FUNCTION qa.check(p_name text, p_ok boolean, p_detail text DEFAULT NULL) RETURNS void
LANGUAGE sql AS $$ INSERT INTO qa.results (name, ok, detail) VALUES (p_name, coalesce(p_ok, false), p_detail) $$;

CREATE FUNCTION qa.expect_error(p_name text, p_sql text, p_needle text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
    PERFORM qa.check(p_name, false, 'no error raised');
  EXCEPTION WHEN others THEN
    PERFORM qa.check(p_name, position(p_needle in SQLERRM) > 0, SQLERRM);
  END;
END $$;

CREATE FUNCTION qa.id(p_k text) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT id FROM qa.ids WHERE k = p_k $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA qa TO PUBLIC;

-- ── Fixtures (superuser; existing tables) ──────────────────────────────
INSERT INTO public.elf_accounts (id, email, name) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'ath1@x', 'Emma Smith'),
  ('00000000-0000-0000-0000-0000000000a2', 'par1@x', 'Pat Smith'),
  ('00000000-0000-0000-0000-0000000000a3', 'par2@x', 'Sam Smith'),
  ('00000000-0000-0000-0000-0000000000a4', 'coachpar@x', 'Casey Coach'),
  ('00000000-0000-0000-0000-0000000000a5', 'boost@x', 'Bo Booster'),
  ('00000000-0000-0000-0000-0000000000a6', 'parb@x', 'Blair B'),
  ('00000000-0000-0000-0000-0000000000a7', 'admin@x', 'Ada Admin');
INSERT INTO public.platform_admins (id, account_id, role) VALUES ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a7', 'admin');
INSERT INTO public.athletes (id, campaign_slug, name) VALUES
  ('00000000-0000-0000-0000-0000000000b1', 'team-a', 'Emma Smith'),
  ('00000000-0000-0000-0000-0000000000b2', 'team-a', 'Jake Smith'),
  ('00000000-0000-0000-0000-0000000000b3', 'team-a', 'Lone Rider'),
  ('00000000-0000-0000-0000-0000000000b4', 'team-b', 'Bea B'),
  ('00000000-0000-0000-0000-0000000000b5', 'team-a', 'Del Eted');
INSERT INTO public.team_members (id, campaign_slug, role, name, athlete_id, account_id) VALUES
  ('00000000-0000-0000-0000-0000000000c1', 'team-a', 'athlete', 'Emma Smith', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000c2', 'team-a', 'parent',  'Pat Smith',  '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000c3', 'team-a', 'parent',  'Sam Smith',  '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a3'),
  ('00000000-0000-0000-0000-0000000000c4', 'team-a', 'parent',  'Legacy Lee', '00000000-0000-0000-0000-0000000000b2', NULL),
  ('00000000-0000-0000-0000-0000000000c5', 'team-a', 'booster', 'Bo Booster', NULL, '00000000-0000-0000-0000-0000000000a5'),
  ('00000000-0000-0000-0000-0000000000c6', 'team-a', 'parent',  'Casey Coach', NULL, '00000000-0000-0000-0000-0000000000a4'),
  ('00000000-0000-0000-0000-0000000000c7', 'team-b', 'parent',  'Blair B',    '00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000a6'),
  ('00000000-0000-0000-0000-0000000000c8', 'team-b', 'parent',  'Pat Smith',  '00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000c9', 'team-a', 'athlete', 'Del Eted',   '00000000-0000-0000-0000-0000000000b5', NULL),
  ('00000000-0000-0000-0000-0000000000ca', 'team-a', 'parent',  'Dee Parent', '00000000-0000-0000-0000-0000000000b5', NULL);
-- Pat (c2) is also Jake's parent through the join table (multi-child);
-- Casey (a coach who is also a parent) is linked to Jake ONLY through it.
INSERT INTO public.team_member_athletes (team_member_id, athlete_id) VALUES
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-0000000000c6', '00000000-0000-0000-0000-0000000000b2');
INSERT INTO public.team_coaches (campaign_slug, name, role, account_id) VALUES ('team-a', 'Casey Coach', 'head_coach', '00000000-0000-0000-0000-0000000000a4');

-- Tasks, created through the real Phase 2 function as the app would.
SET ROLE service_role;
INSERT INTO qa.ids SELECT 'T_both', (public.team_task_create('team-a', '{"title":"Physical Forms","audience":"both"}', '[]', '{"name":"Coach"}')).id;
INSERT INTO qa.ids SELECT 'T_ath',  (public.team_task_create('team-a', '{"title":"Athlete Only","audience":"athlete"}', '[]', '{"name":"Coach"}')).id;
INSERT INTO qa.ids SELECT 'T_par',  (public.team_task_create('team-a', '{"title":"Parent Only","audience":"parent"}', '[]', '{"name":"Coach"}')).id;
INSERT INTO qa.ids SELECT 'T_arch', (public.team_task_create('team-a', '{"title":"Archived","audience":"both"}', '[]', '{"name":"Coach"}')).id;
INSERT INTO qa.ids SELECT 'T_b',    (public.team_task_create('team-b', '{"title":"Team B Task","audience":"both"}', '[]', '{"name":"Coach"}')).id;
INSERT INTO qa.ids SELECT 'T_rev',  (public.team_task_create('team-a', '{"title":"Revised Later","audience":"both"}', '[]', '{"name":"Coach"}')).id;
INSERT INTO qa.ids SELECT 'T_del',  (public.team_task_create('team-a', '{"title":"Deletion Task","audience":"both"}', '[]', '{"name":"Coach"}')).id;
INSERT INTO qa.ids SELECT 'T_none', (public.team_task_create('team-a', '{"title":"No Acks","audience":"both"}', '[]', '{"name":"Coach"}')).id;
UPDATE public.team_tasks SET status = 'archived', archived_at = now() WHERE id = qa.id('T_arch');
RESET ROLE;

-- Shorthand used below (as service_role):
--   qa_ack(task, slug, rev, req, athletes, member, account, name)
CREATE FUNCTION qa.ack(p_task text, p_slug text, p_rev int, p_req text, p_athletes uuid[], p_member uuid, p_account uuid, p_name text, p_ver int DEFAULT 1)
RETURNS TABLE (athlete_id uuid, outcome text, acknowledgment_id uuid)
LANGUAGE sql AS $$
  SELECT * FROM public.team_task_acknowledge(qa.id(p_task), p_slug, p_rev, p_req, p_athletes, p_member, p_account, p_name, p_ver)
$$;
GRANT EXECUTE ON FUNCTION qa.ack TO PUBLIC;

-- ═══ A. Privileges: anon / authenticated get nothing ════════════════════
SET ROLE anon;
SELECT qa.expect_error('anon: SELECT denied', 'SELECT * FROM public.team_task_acknowledgments', 'permission denied');
SELECT qa.expect_error('anon: INSERT denied', $q$INSERT INTO public.team_task_acknowledgments (campaign_slug, task_id, task_revision, requirement, full_name, athlete_name_snapshot, task_title_snapshot, statement_version, statement_text) VALUES ('team-a', gen_random_uuid(), 1, 'athlete', 'Xx', 'x', 'x', 1, 'x')$q$, 'permission denied');
SELECT qa.expect_error('anon: acknowledge() denied', $q$SELECT public.team_task_acknowledge(gen_random_uuid(), 'team-a', 1, 'athlete', ARRAY[gen_random_uuid()], gen_random_uuid(), NULL, 'Xx', 1)$q$, 'permission denied');
SELECT qa.expect_error('anon: ack_status() denied', $q$SELECT public.team_task_ack_status('team-a')$q$, 'permission denied');
SELECT qa.expect_error('anon: member_linked() denied', $q$SELECT public.team_task_ack_member_linked(gen_random_uuid(), gen_random_uuid(), 'parent', 'team-a')$q$, 'permission denied');
RESET ROLE;
SET ROLE authenticated;
SELECT qa.expect_error('authenticated: SELECT denied', 'SELECT * FROM public.team_task_acknowledgments', 'permission denied');
SELECT qa.expect_error('authenticated: UPDATE denied', $q$UPDATE public.team_task_acknowledgments SET full_name = 'Zz'$q$, 'permission denied');
SELECT qa.expect_error('authenticated: DELETE denied', 'DELETE FROM public.team_task_acknowledgments', 'permission denied');
SELECT qa.expect_error('authenticated: acknowledge() denied', $q$SELECT public.team_task_acknowledge(gen_random_uuid(), 'team-a', 1, 'athlete', ARRAY[gen_random_uuid()], gen_random_uuid(), NULL, 'Xx', 1)$q$, 'permission denied');
SELECT qa.expect_error('authenticated: ack_status() denied', $q$SELECT public.team_task_ack_status('team-a')$q$, 'permission denied');
RESET ROLE;

SELECT qa.check('grants: anon has no table privileges',          NOT has_table_privilege('anon', 'public.team_task_acknowledgments', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'));
SELECT qa.check('grants: authenticated has no table privileges', NOT has_table_privilege('authenticated', 'public.team_task_acknowledgments', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'));
SELECT qa.check('grants: service_role has exactly SELECT, INSERT',
  has_table_privilege('service_role', 'public.team_task_acknowledgments', 'SELECT')
  AND has_table_privilege('service_role', 'public.team_task_acknowledgments', 'INSERT')
  AND NOT has_table_privilege('service_role', 'public.team_task_acknowledgments', 'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'));
SELECT qa.check('grants: guard function not executable by anyone but owner',
  NOT has_function_privilege('anon', 'public.team_task_acknowledgments_guard()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.team_task_acknowledgments_guard()', 'EXECUTE')
  AND NOT has_function_privilege('service_role', 'public.team_task_acknowledgments_guard()', 'EXECUTE'));
SELECT qa.check('grants: callable functions executable by service_role only',
  bool_and(has_function_privilege('service_role', f, 'EXECUTE') AND NOT has_function_privilege('anon', f, 'EXECUTE') AND NOT has_function_privilege('authenticated', f, 'EXECUTE')))
FROM unnest(ARRAY['public.team_task_acknowledge(uuid,text,integer,text,uuid[],uuid,uuid,text,integer)',
                  'public.team_task_ack_status(text,uuid[],uuid[])',
                  'public.team_task_ack_member_linked(uuid,uuid,text,text)',
                  'public.team_task_ack_statement(integer)',
                  'public.team_task_ack_counts(uuid,uuid,uuid,text,text)']) f;
SELECT qa.check('RLS enabled, no policies',
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.team_task_acknowledgments'::regclass)
  AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'team_task_acknowledgments'));

-- ═══ B. service_role cannot bypass the function ════════════════════════
SET ROLE service_role;
SELECT qa.expect_error('service_role: direct INSERT refused by guard', $q$INSERT INTO public.team_task_acknowledgments (campaign_slug, task_id, task_revision, requirement, athlete_id, member_id, full_name, athlete_name_snapshot, task_title_snapshot, statement_version, statement_text) VALUES ('team-a', qa.id('T_both'), 1, 'athlete', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', 'Emma Smith', 'Emma', 'x', 1, 'x')$q$, 'team_task_acknowledgments_write_via_function_only');
SELECT qa.expect_error('service_role: UPDATE denied', $q$UPDATE public.team_task_acknowledgments SET full_name = 'Zz'$q$, 'permission denied');
SELECT qa.expect_error('service_role: DELETE denied', 'DELETE FROM public.team_task_acknowledgments', 'permission denied');
SELECT qa.expect_error('service_role: TRUNCATE denied', 'TRUNCATE public.team_task_acknowledgments', 'permission denied');
RESET ROLE;

-- ═══ C. Athlete ═════════════════════════════════════════════════════════
SET ROLE service_role;
SELECT qa.check('athlete: own acknowledgment recorded',
  (SELECT outcome = 'recorded' FROM qa.ack('T_both', 'team-a', 1, 'athlete', ARRAY['00000000-0000-0000-0000-0000000000b1'::uuid], '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', '  Emma   Smith ')));
SELECT qa.check('athlete: name normalized, snapshots from the database, approved statement stored',
  (SELECT full_name = 'Emma Smith' AND athlete_name_snapshot = 'Emma Smith' AND member_name_snapshot = 'Emma Smith'
      AND task_title_snapshot = 'Physical Forms' AND task_revision = 1 AND statement_version = 1
      AND statement_text = 'I acknowledge that I have reviewed and understand the information, instructions, links, and documents associated with this task.'
      AND account_id = '00000000-0000-0000-0000-0000000000a1'
   FROM public.team_task_acknowledgments WHERE task_id = qa.id('T_both') AND requirement = 'athlete'));
SELECT qa.check('athlete: repeat submit is a no-op (already_satisfied, same row)',
  (SELECT outcome = 'already_satisfied' AND acknowledgment_id = (SELECT id FROM public.team_task_acknowledgments WHERE task_id = qa.id('T_both') AND requirement = 'athlete')
   FROM qa.ack('T_both', 'team-a', 1, 'athlete', ARRAY['00000000-0000-0000-0000-0000000000b1'::uuid], '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 'Emma Smith'))
  AND (SELECT count(*) = 1 FROM public.team_task_acknowledgments WHERE task_id = qa.id('T_both') AND requirement = 'athlete'));
SELECT qa.expect_error('athlete: cannot acknowledge for another athlete', $q$SELECT qa.ack('T_both', 'team-a', 1, 'athlete', ARRAY['00000000-0000-0000-0000-0000000000b2'::uuid], '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 'Emma Smith')$q$, 'team_task_ack_athlete_not_linked');
SELECT qa.expect_error('athlete: cannot satisfy the parent requirement', $q$SELECT qa.ack('T_both', 'team-a', 1, 'parent', ARRAY['00000000-0000-0000-0000-0000000000b1'::uuid], '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 'Emma Smith')$q$, 'team_task_ack_role_mismatch');
SELECT qa.expect_error('athlete-only task: parent requirement not required', $q$SELECT qa.ack('T_ath', 'team-a', 1, 'parent', ARRAY['00000000-0000-0000-0000-0000000000b1'::uuid], '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2', 'Pat Smith')$q$, 'team_task_ack_not_required');
SELECT qa.expect_error('parent-only task: athlete requirement not required', $q$SELECT qa.ack('T_par', 'team-a', 1, 'athlete', ARRAY['00000000-0000-0000-0000-0000000000b1'::uuid], '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 'Emma Smith')$q$, 'team_task_ack_not_required');

-- ═══ D. Parents, multiple children, one parent satisfies ═══════════════
SELECT qa.check('parent: one submission records every listed linked child (multi-child)',
  (SELECT count(*) = 2 AND bool_and(outcome = 'recorded')
   FROM qa.ack('T_both', 'team-a', 1, 'parent', ARRAY['00000000-0000-0000-0000-0000000000b2'::uuid, '00000000-0000-0000-0000-0000000000b1'::uuid, '00000000-0000-0000-0000-0000000000b1'::uuid], '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2', 'Pat Smith')));
SELECT qa.check('parent: per-child rows carry each child''s name snapshot',
  (SELECT array_agg(athlete_name_snapshot ORDER BY athlete_name_snapshot) = ARRAY['Emma Smith', 'Jake Smith']
   FROM public.team_task_acknowledgments WHERE task_id = qa.id('T_both') AND requirement = 'parent'));
SELECT qa.check('second linked parent: already satisfied, nothing written',
  (SELECT outcome = 'already_satisfied' FROM qa.ack('T_both', 'team-a', 1, 'parent', ARRAY['00000000-0000-0000-0000-0000000000b1'::uuid], '00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000a3', 'Sam Smith'))
  AND (SELECT count(*) = 2 FROM public.team_task_acknowledgments WHERE task_id = qa.id('T_both') AND requirement = 'parent'));
SELECT qa.expect_error('parent: unlinked child refused', $q$SELECT qa.ack('T_par', 'team-a', 1, 'parent', ARRAY['00000000-0000-0000-0000-0000000000b3'::uuid], '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2', 'Pat Smith')$q$, 'team_task_ack_athlete_not_linked');
SELECT qa.expect_error('all-or-nothing: one unlinked child fails the whole submission', $q$SELECT qa.ack('T_par', 'team-a', 1, 'parent', ARRAY['00000000-0000-0000-0000-0000000000b1'::uuid, '00000000-0000-0000-0000-0000000000b3'::uuid], '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2', 'Pat Smith')$q$, 'team_task_ack_athlete_not_linked');
SELECT qa.check('all-or-nothing: nothing was written for the linked child either',
  NOT EXISTS (SELECT 1 FROM public.team_task_acknowledgments WHERE task_id = qa.id('T_par')));
SELECT qa.check('legacy team-login parent (no account) can acknowledge',
  (SELECT outcome = 'recorded' FROM qa.ack('T_par', 'team-a', 1, 'parent', ARRAY['00000000-0000-0000-0000-0000000000b2'::uuid], '00000000-0000-0000-0000-0000000000c4', NULL, 'Lee Legacy')));
SELECT qa.check('coach who is also a parent (join-table link only) can acknowledge for own child',
  (SELECT outcome = 'already_satisfied' FROM qa.ack('T_par', 'team-a', 1, 'parent', ARRAY['00000000-0000-0000-0000-0000000000b2'::uuid], '00000000-0000-0000-0000-0000000000c6', '00000000-0000-0000-0000-0000000000a4', 'Casey Coach'))
  AND (SELECT outcome = 'recorded' FROM qa.ack('T_rev', 'team-a', 1, 'parent', ARRAY['00000000-0000-0000-0000-0000000000b2'::uuid], '00000000-0000-0000-0000-0000000000c6', '00000000-0000-0000-0000-0000000000a4', 'Casey Coach')));
SELECT qa.expect_error('coach-parent: still cannot acknowledge for a child they are not linked to', $q$SELECT qa.ack('T_rev', 'team-a', 1, 'parent', ARRAY['00000000-0000-0000-0000-0000000000b1'::uuid], '00000000-0000-0000-0000-0000000000c6', '00000000-0000-0000-0000-0000000000a4', 'Casey Coach')$q$, 'team_task_ack_athlete_not_linked');
SELECT qa.expect_error('booster member refused', $q$SELECT qa.ack('T_par', 'team-a', 1, 'parent', ARRAY['00000000-0000-0000-0000-0000000000b1'::uuid], '00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000a5', 'Bo Booster')$q$, 'team_task_ack_role_mismatch');
SELECT qa.expect_error('platform admin (no member row) refused', $q$SELECT qa.ack('T_par', 'team-a', 1, 'parent', ARRAY['00000000-0000-0000-0000-0000000000b1'::uuid], '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a7', 'Ada Admin')$q$, 'team_task_ack_member_not_found');

-- ═══ E. Identity binding ═══════════════════════════════════════════════
SELECT qa.expect_error('identity: member id with someone else''s account refused', $q$SELECT qa.ack('T_par', 'team-a', 1, 'parent', ARRAY['00000000-0000-0000-0000-0000000000b1'::uuid], '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a3', 'Pat Smith')$q$, 'team_task_ack_identity_mismatch');
SELECT qa.expect_error('identity: account member with NULL account refused', $q$SELECT qa.ack('T_par', 'team-a', 1, 'parent', ARRAY['00000000-0000-0000-0000-0000000000b1'::uuid], '00000000-0000-0000-0000-0000000000c2', NULL, 'Pat Smith')$q$, 'team_task_ack_identity_mismatch');
SELECT qa.expect_error('identity: legacy member with an account id refused', $q$SELECT qa.ack('T_par', 'team-a', 1, 'parent', ARRAY['00000000-0000-0000-0000-0000000000b2'::uuid], '00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000a2', 'Pat Smith')$q$, 'team_task_ack_identity_mismatch');
SELECT qa.expect_error('identity: unknown member refused', $q$SELECT qa.ack('T_par', 'team-a', 1, 'parent', ARRAY['00000000-0000-0000-0000-0000000000b1'::uuid], gen_random_uuid(), NULL, 'Pat Smith')$q$, 'team_task_ack_member_not_found');

-- ═══ F. Cross-team ═════════════════════════════════════════════════════
SELECT qa.expect_error('cross-team: team A slug with a team B task', $q$SELECT qa.ack('T_b', 'team-a', 1, 'parent', ARRAY['00000000-0000-0000-0000-0000000000b1'::uuid], '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2', 'Pat Smith')$q$, 'team_task_ack_task_not_found');
SELECT qa.expect_error('cross-team: team B task with a team A member', $q$SELECT qa.ack('T_b', 'team-b', 1, 'parent', ARRAY['00000000-0000-0000-0000-0000000000b4'::uuid], '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2', 'Pat Smith')$q$, 'team_task_ack_member_not_found');
SELECT qa.expect_error('cross-team: team B athlete via a team A member', $q$SELECT qa.ack('T_both', 'team-a', 1, 'parent', ARRAY['00000000-0000-0000-0000-0000000000b4'::uuid], '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2', 'Pat Smith')$q$, 'team_task_ack_athlete_not_linked');
SELECT qa.check('multi-team: same account acknowledges on team B through its team B membership',
  (SELECT outcome = 'recorded' FROM qa.ack('T_b', 'team-b', 1, 'parent', ARRAY['00000000-0000-0000-0000-0000000000b4'::uuid], '00000000-0000-0000-0000-0000000000c8', '00000000-0000-0000-0000-0000000000a2', 'Pat Smith')));
SELECT qa.check('cross-team: team A status never includes team B tasks or athletes',
  NOT EXISTS (SELECT 1 FROM public.team_task_ack_status('team-a') s WHERE s.task_id = qa.id('T_b') OR s.athlete_id = '00000000-0000-0000-0000-0000000000b4'));
SELECT qa.check('cross-team: filtering team A status by a team B athlete returns nothing',
  NOT EXISTS (SELECT 1 FROM public.team_task_ack_status('team-a', ARRAY['00000000-0000-0000-0000-0000000000b4'::uuid])));

-- ═══ G. Task state and input validation ════════════════════════════════
SELECT qa.expect_error('archived task refused', $q$SELECT qa.ack('T_arch', 'team-a', 1, 'parent', ARRAY['00000000-0000-0000-0000-0000000000b1'::uuid], '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2', 'Pat Smith')$q$, 'team_task_ack_task_inactive');
SELECT qa.expect_error('unknown task refused', $q$SELECT public.team_task_acknowledge(gen_random_uuid(), 'team-a', 1, 'parent', ARRAY['00000000-0000-0000-0000-0000000000b1'::uuid], '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2', 'Pat Smith', 1)$q$, 'team_task_ack_task_not_found');
SELECT qa.expect_error('invalid requirement refused', $q$SELECT qa.ack('T_both', 'team-a', 1, 'coach', ARRAY['00000000-0000-0000-0000-0000000000b1'::uuid], '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2', 'Pat Smith')$q$, 'team_task_ack_invalid_requirement');
SELECT qa.expect_error('name: blank refused', $q$SELECT qa.ack('T_par', 'team-a', 1, 'parent', ARRAY['00000000-0000-0000-0000-0000000000b1'::uuid], '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2', '   ')$q$, 'team_task_ack_invalid_name');
SELECT qa.expect_error('name: one character refused', $q$SELECT qa.ack('T_par', 'team-a', 1, 'parent', ARRAY['00000000-0000-0000-0000-0000000000b1'::uuid], '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2', 'P')$q$, 'team_task_ack_invalid_name');
SELECT qa.expect_error('name: NULL refused', $q$SELECT qa.ack('T_par', 'team-a', 1, 'parent', ARRAY['00000000-0000-0000-0000-0000000000b1'::uuid], '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2', NULL)$q$, 'team_task_ack_invalid_name');
SELECT qa.expect_error('name: 121 characters refused', format($q$SELECT qa.ack('T_par', 'team-a', 1, 'parent', ARRAY['00000000-0000-0000-0000-0000000000b1'::uuid], '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2', %L)$q$, repeat('a', 121)), 'team_task_ack_invalid_name');
SELECT qa.expect_error('name: control character refused', format($q$SELECT qa.ack('T_par', 'team-a', 1, 'parent', ARRAY['00000000-0000-0000-0000-0000000000b1'::uuid], '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2', %L)$q$, 'Pat' || chr(7) || 'Smith'), 'team_task_ack_invalid_name');
SELECT qa.expect_error('statement: unknown version refused', $q$SELECT qa.ack('T_par', 'team-a', 1, 'parent', ARRAY['00000000-0000-0000-0000-0000000000b1'::uuid], '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2', 'Pat Smith', 2)$q$, 'team_task_ack_unknown_statement');
SELECT qa.expect_error('athletes: empty list refused', $q$SELECT qa.ack('T_par', 'team-a', 1, 'parent', ARRAY[]::uuid[], '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2', 'Pat Smith')$q$, 'team_task_ack_no_athletes');
SELECT qa.expect_error('athletes: NULL list refused', $q$SELECT qa.ack('T_par', 'team-a', 1, 'parent', NULL, '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2', 'Pat Smith')$q$, 'team_task_ack_no_athletes');
SELECT qa.expect_error('athletes: more than 50 refused', $q$SELECT qa.ack('T_par', 'team-a', 1, 'parent', ARRAY(SELECT gen_random_uuid() FROM generate_series(1, 51)), '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2', 'Pat Smith')$q$, 'team_task_ack_too_many_athletes');

-- ═══ H. Revisions ═════════════════════════════════════════════════════
-- Reordering and archive/restore must not change status; a substantive
-- edit (title) bumps the revision and needs re-acknowledgment.
SELECT public.team_task_move(qa.id('T_rev'), 'team-a', 'up');
UPDATE public.team_tasks SET status = 'archived', archived_at = now() WHERE id = qa.id('T_rev');
UPDATE public.team_tasks SET status = 'active', archived_at = NULL WHERE id = qa.id('T_rev');
SELECT qa.check('revision: reorder + archive/restore keep revision 1 and the acknowledgment counts',
  (SELECT revision = 1 FROM public.team_tasks WHERE id = qa.id('T_rev'))
  AND (SELECT satisfied FROM public.team_task_ack_status('team-a', ARRAY['00000000-0000-0000-0000-0000000000b2'::uuid], ARRAY[qa.id('T_rev')]) WHERE requirement = 'parent'));
UPDATE public.team_tasks SET title = 'Revised Later (updated)' WHERE id = qa.id('T_rev');
SELECT qa.check('revision: substantive edit bumped revision to 2', (SELECT revision = 2 FROM public.team_tasks WHERE id = qa.id('T_rev')));
SELECT qa.expect_error('revision: stale (reviewed revision 1) submission refused', $q$SELECT qa.ack('T_rev', 'team-a', 1, 'parent', ARRAY['00000000-0000-0000-0000-0000000000b2'::uuid], '00000000-0000-0000-0000-0000000000c6', '00000000-0000-0000-0000-0000000000a4', 'Casey Coach')$q$, 'team_task_ack_revision_changed');
SELECT qa.check('revision: old acknowledgment no longer satisfies, but is reported as earlier',
  (SELECT NOT satisfied AND earlier_revision_acknowledged AND task_revision = 2
   FROM public.team_task_ack_status('team-a', ARRAY['00000000-0000-0000-0000-0000000000b2'::uuid], ARRAY[qa.id('T_rev')]) WHERE requirement = 'parent'));
SELECT qa.check('revision: re-acknowledgment at revision 2 recorded',
  (SELECT outcome = 'recorded' FROM qa.ack('T_rev', 'team-a', 2, 'parent', ARRAY['00000000-0000-0000-0000-0000000000b2'::uuid], '00000000-0000-0000-0000-0000000000c6', '00000000-0000-0000-0000-0000000000a4', 'Casey Coach')));
SELECT qa.check('revision: history kept (revision 1 and 2 rows both present)',
  (SELECT array_agg(task_revision ORDER BY task_revision) = ARRAY[1, 2] FROM public.team_task_acknowledgments WHERE task_id = qa.id('T_rev')));
SELECT qa.check('revision: now satisfied at revision 2',
  (SELECT satisfied FROM public.team_task_ack_status('team-a', ARRAY['00000000-0000-0000-0000-0000000000b2'::uuid], ARRAY[qa.id('T_rev')]) WHERE requirement = 'parent'));

-- ═══ I. Status function ════════════════════════════════════════════════
SELECT qa.check('status: only required roles appear (athlete task -> athlete rows only)',
  (SELECT array_agg(DISTINCT requirement) = ARRAY['athlete'] FROM public.team_task_ack_status('team-a', NULL, ARRAY[qa.id('T_ath')])));
SELECT qa.check('status: archived tasks excluded',
  NOT EXISTS (SELECT 1 FROM public.team_task_ack_status('team-a') WHERE task_id = qa.id('T_arch')));
SELECT qa.check('status: athlete with no account and no parent -> not satisfied, no eligible member',
  (SELECT bool_and(NOT satisfied AND NOT has_eligible_member) FROM public.team_task_ack_status('team-a', ARRAY['00000000-0000-0000-0000-0000000000b3'::uuid], ARRAY[qa.id('T_both')])));
SELECT qa.check('status: T_both for Emma -> athlete and parent satisfied, with who/when',
  (SELECT bool_and(satisfied AND acknowledged_at IS NOT NULL AND acknowledged_full_name IS NOT NULL) AND count(*) = 2
   FROM public.team_task_ack_status('team-a', ARRAY['00000000-0000-0000-0000-0000000000b1'::uuid], ARRAY[qa.id('T_both')])));
SELECT qa.check('status: legacy team-login parent (no account) acknowledgment counts',
  (SELECT satisfied AND acknowledged_by_member_id = '00000000-0000-0000-0000-0000000000c4'
   FROM public.team_task_ack_status('team-a', ARRAY['00000000-0000-0000-0000-0000000000b2'::uuid], ARRAY[qa.id('T_par')]) WHERE requirement = 'parent'));
SELECT qa.check('status: T_both for Jake -> parent satisfied, athlete outstanding (Jake has no account)',
  (SELECT bool_and(CASE requirement WHEN 'parent' THEN satisfied ELSE NOT satisfied AND NOT has_eligible_member END)
   FROM public.team_task_ack_status('team-a', ARRAY['00000000-0000-0000-0000-0000000000b2'::uuid], ARRAY[qa.id('T_both')])));
RESET ROLE;

-- ═══ J. Unlinking: history kept, no longer counts ══════════════════════
-- Pat acknowledged T_both for Jake through the join-table link. Remove
-- that link: the row stays, but Jake's parent requirement is outstanding
-- again (Casey is still linked and could now acknowledge).
DELETE FROM public.team_member_athletes WHERE team_member_id = '00000000-0000-0000-0000-0000000000c2' AND athlete_id = '00000000-0000-0000-0000-0000000000b2';
SET ROLE service_role;
SELECT qa.check('unlink: acknowledgment row kept',
  EXISTS (SELECT 1 FROM public.team_task_acknowledgments WHERE task_id = qa.id('T_both') AND athlete_id = '00000000-0000-0000-0000-0000000000b2' AND member_id = '00000000-0000-0000-0000-0000000000c2'));
SELECT qa.check('unlink: no longer satisfies the requirement',
  (SELECT NOT satisfied FROM public.team_task_ack_status('team-a', ARRAY['00000000-0000-0000-0000-0000000000b2'::uuid], ARRAY[qa.id('T_both')]) WHERE requirement = 'parent'));
SELECT qa.expect_error('unlink: the unlinked parent can no longer acknowledge for that child', $q$SELECT qa.ack('T_both', 'team-a', 1, 'parent', ARRAY['00000000-0000-0000-0000-0000000000b2'::uuid], '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2', 'Pat Smith')$q$, 'team_task_ack_athlete_not_linked');
SELECT qa.check('unlink: another still-linked parent can now satisfy it',
  (SELECT outcome = 'recorded' FROM qa.ack('T_both', 'team-a', 1, 'parent', ARRAY['00000000-0000-0000-0000-0000000000b2'::uuid], '00000000-0000-0000-0000-0000000000c6', '00000000-0000-0000-0000-0000000000a4', 'Casey Coach')));
RESET ROLE;
-- A member whose role changes away from parent stops counting; changing it
-- back restores it (status is computed live, nothing is rewritten).
UPDATE public.team_members SET role = 'booster' WHERE id = '00000000-0000-0000-0000-0000000000c4';
SELECT qa.check('role change: parent turned booster -> acknowledgment stops counting',
  (SELECT NOT satisfied FROM public.team_task_ack_status('team-a', ARRAY['00000000-0000-0000-0000-0000000000b2'::uuid], ARRAY[qa.id('T_par')]) WHERE requirement = 'parent'));
UPDATE public.team_members SET role = 'parent' WHERE id = '00000000-0000-0000-0000-0000000000c4';
SELECT qa.check('role change: restored to parent -> counts again',
  (SELECT satisfied FROM public.team_task_ack_status('team-a', ARRAY['00000000-0000-0000-0000-0000000000b2'::uuid], ARRAY[qa.id('T_par')]) WHERE requirement = 'parent'));
-- An athlete member re-linked to a different roster athlete (linkMemberToAthlete).
UPDATE public.team_members SET athlete_id = '00000000-0000-0000-0000-0000000000b3' WHERE id = '00000000-0000-0000-0000-0000000000c1';
SELECT qa.check('athlete re-link: Emma''s member row now points elsewhere -> her acknowledgment stops counting',
  (SELECT NOT satisfied FROM public.team_task_ack_status('team-a', ARRAY['00000000-0000-0000-0000-0000000000b1'::uuid], ARRAY[qa.id('T_both')]) WHERE requirement = 'athlete'));
UPDATE public.team_members SET athlete_id = '00000000-0000-0000-0000-0000000000b1' WHERE id = '00000000-0000-0000-0000-0000000000c1';
SELECT qa.check('athlete re-link: restored -> counts again',
  (SELECT satisfied FROM public.team_task_ack_status('team-a', ARRAY['00000000-0000-0000-0000-0000000000b1'::uuid], ARRAY[qa.id('T_both')]) WHERE requirement = 'athlete'));

-- ═══ K. Deletion keeps history ═════════════════════════════════════════
-- Del (athlete b5) and Dee (parent ca) acknowledge T_del; then the athlete,
-- the parent's member row, and an account are deleted.
SET ROLE service_role;
SELECT qa.ack('T_del', 'team-a', 1, 'athlete', ARRAY['00000000-0000-0000-0000-0000000000b5'::uuid], '00000000-0000-0000-0000-0000000000c9', NULL, 'Del Eted');
SELECT qa.ack('T_del', 'team-a', 1, 'parent',  ARRAY['00000000-0000-0000-0000-0000000000b5'::uuid], '00000000-0000-0000-0000-0000000000ca', NULL, 'Dee Parent');
SELECT qa.ack('T_del', 'team-a', 1, 'parent',  ARRAY['00000000-0000-0000-0000-0000000000b1'::uuid], '00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000a3', 'Sam Smith');
-- The app deletes as service_role (no UPDATE privilege on the
-- acknowledgment table): the ON DELETE SET NULL must still work.
DELETE FROM public.team_members WHERE id = '00000000-0000-0000-0000-0000000000ca';
SELECT qa.check('member deleted: row kept, member_id cleared, snapshots intact',
  (SELECT member_id IS NULL AND full_name = 'Dee Parent' AND member_name_snapshot = 'Dee Parent'
   FROM public.team_task_acknowledgments WHERE task_id = qa.id('T_del') AND requirement = 'parent' AND athlete_name_snapshot = 'Del Eted'));
DELETE FROM public.athletes WHERE id = '00000000-0000-0000-0000-0000000000b5';
SELECT qa.check('athlete deleted: both rows kept, athlete_id cleared, athlete name snapshot intact',
  (SELECT count(*) = 2 AND bool_and(athlete_id IS NULL AND athlete_name_snapshot = 'Del Eted')
   FROM public.team_task_acknowledgments WHERE task_id = qa.id('T_del') AND athlete_name_snapshot = 'Del Eted'));
-- Parent account deleted; its team_members row survives (account_id
-- cleared there by the existing FK) and stays linked to Emma.
DELETE FROM public.elf_accounts WHERE id = '00000000-0000-0000-0000-0000000000a3';
SELECT qa.check('parent account deleted: member row survives, still linked, account cleared on it',
  (SELECT account_id IS NULL AND athlete_id = '00000000-0000-0000-0000-0000000000b1' FROM public.team_members WHERE id = '00000000-0000-0000-0000-0000000000c3'));
SELECT qa.check('parent account deleted: acknowledgment row kept unchanged (account_id snapshot, member link, names)',
  (SELECT account_id = '00000000-0000-0000-0000-0000000000a3' AND member_id = '00000000-0000-0000-0000-0000000000c3' AND full_name = 'Sam Smith' AND member_name_snapshot = 'Sam Smith'
   FROM public.team_task_acknowledgments WHERE task_id = qa.id('T_del') AND athlete_id = '00000000-0000-0000-0000-0000000000b1'));
SELECT qa.check('parent account deleted: acknowledgment no longer counts (identity gone)',
  (SELECT NOT satisfied FROM public.team_task_ack_status('team-a', ARRAY['00000000-0000-0000-0000-0000000000b1'::uuid], ARRAY[qa.id('T_del')]) WHERE requirement = 'parent'));
SELECT qa.check('parent account deleted: Emma''s other linked parent (Pat) can now satisfy T_del',
  (SELECT outcome = 'recorded' FROM qa.ack('T_del', 'team-a', 1, 'parent', ARRAY['00000000-0000-0000-0000-0000000000b1'::uuid], '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2', 'Pat Smith')));
-- Athlete account deleted; the athlete's team_members row survives.
DELETE FROM public.elf_accounts WHERE id = '00000000-0000-0000-0000-0000000000a1';
SELECT qa.check('athlete account deleted: acknowledgment row kept with its account snapshot',
  (SELECT account_id = '00000000-0000-0000-0000-0000000000a1' AND member_id = '00000000-0000-0000-0000-0000000000c1'
   FROM public.team_task_acknowledgments WHERE task_id = qa.id('T_both') AND requirement = 'athlete'));
SELECT qa.check('athlete account deleted: athlete acknowledgment no longer counts',
  (SELECT NOT satisfied FROM public.team_task_ack_status('team-a', ARRAY['00000000-0000-0000-0000-0000000000b1'::uuid], ARRAY[qa.id('T_both')]) WHERE requirement = 'athlete'));
SELECT qa.check('member deleted: its acknowledgment never counts (member_id NULL)',
  NOT public.team_task_ack_counts(NULL, NULL, '00000000-0000-0000-0000-0000000000b1', 'parent', 'team-a'));
SELECT qa.expect_error('task with acknowledgments cannot be deleted', $q$DELETE FROM public.team_tasks WHERE id = qa.id('T_del')$q$, 'team_task_acknowledgments_task_id_fkey');
DELETE FROM public.team_tasks WHERE id = qa.id('T_none');
SELECT qa.check('task without acknowledgments can still be deleted (FK does not block unrelated tasks)',
  NOT EXISTS (SELECT 1 FROM public.team_tasks WHERE id = qa.id('T_none')));
RESET ROLE;

-- ═══ L. Even the table owner cannot rewrite history ═══════════════════
SET ROLE supa_owner;
SELECT qa.expect_error('owner: UPDATE of content refused', $q$UPDATE public.team_task_acknowledgments SET full_name = 'Forged Name'$q$, 'team_task_acknowledgments_append_only');
SELECT qa.expect_error('owner: UPDATE of revision refused', $q$UPDATE public.team_task_acknowledgments SET task_revision = task_revision + 1$q$, 'team_task_acknowledgments_append_only');
SELECT qa.expect_error('owner: clearing athlete_id while the athlete exists refused', $q$UPDATE public.team_task_acknowledgments SET athlete_id = NULL WHERE athlete_id IS NOT NULL$q$, 'team_task_acknowledgments_append_only');
SELECT qa.expect_error('owner: clearing member_id while the member exists refused', $q$UPDATE public.team_task_acknowledgments SET member_id = NULL WHERE member_id IS NOT NULL$q$, 'team_task_acknowledgments_append_only');
SELECT qa.expect_error('owner: changing the account_id snapshot refused (even after the account is deleted)', $q$UPDATE public.team_task_acknowledgments SET account_id = NULL WHERE account_id IS NOT NULL$q$, 'team_task_acknowledgments_append_only');
SELECT qa.expect_error('owner: re-pointing member_id refused', $q$UPDATE public.team_task_acknowledgments SET member_id = '00000000-0000-0000-0000-0000000000c3' WHERE member_id = '00000000-0000-0000-0000-0000000000c1'$q$, 'team_task_acknowledgments_append_only');
SELECT qa.expect_error('owner: DELETE refused', 'DELETE FROM public.team_task_acknowledgments', 'team_task_acknowledgments_append_only');
SELECT qa.expect_error('owner: TRUNCATE refused', 'TRUNCATE public.team_task_acknowledgments', 'team_task_acknowledgments_append_only');
SELECT qa.expect_error('owner: direct INSERT without the function refused', $q$INSERT INTO public.team_task_acknowledgments (campaign_slug, task_id, task_revision, requirement, full_name, athlete_name_snapshot, task_title_snapshot, statement_version, statement_text) VALUES ('team-a', qa.id('T_both'), 1, 'athlete', 'Xx', 'x', 'x', 1, 'x')$q$, 'team_task_acknowledgments_write_via_function_only');
RESET ROLE;

-- ═══ M. Unique backstop and team-match guard (flag set by hand) ════════
-- Only a direct database session can set the flag; this proves the
-- database still refuses a duplicate or cross-team row even then.
SELECT qa.expect_error('unique index: duplicate (task, revision, athlete, requirement, member) refused', $q$
  DO $d$ BEGIN
    PERFORM set_config('elf.team_task_ack_write', 'on', true);
    INSERT INTO public.team_task_acknowledgments (campaign_slug, task_id, task_revision, requirement, athlete_id, member_id, full_name, athlete_name_snapshot, task_title_snapshot, statement_version, statement_text)
    SELECT campaign_slug, task_id, task_revision, requirement, athlete_id, member_id, full_name, athlete_name_snapshot, task_title_snapshot, statement_version, statement_text
    FROM public.team_task_acknowledgments WHERE requirement = 'athlete' AND task_id = qa.id('T_both');
  END $d$$q$, 'tta_one_per_person_revision');
SELECT qa.expect_error('guard: row whose campaign does not match its task refused', $q$
  DO $d$ BEGIN
    PERFORM set_config('elf.team_task_ack_write', 'on', true);
    INSERT INTO public.team_task_acknowledgments (campaign_slug, task_id, task_revision, requirement, full_name, athlete_name_snapshot, task_title_snapshot, statement_version, statement_text)
    VALUES ('team-b', qa.id('T_both'), 1, 'athlete', 'Xx', 'x', 'x', 1, 'x');
  END $d$$q$, 'team_task_acknowledgments_team_mismatch');

-- ═══ N. Rollback and flag scope ════════════════════════════════════════
SET ROLE service_role;
SELECT qa.check('flag is off after a successful call (transaction-local, reset by the function)',
  (SELECT count(*) >= 0 FROM qa.ack('T_par', 'team-a', 1, 'parent', ARRAY['00000000-0000-0000-0000-0000000000b2'::uuid], '00000000-0000-0000-0000-0000000000c4', NULL, 'Lee Legacy'))
  AND coalesce(current_setting('elf.team_task_ack_write', true), '') IN ('', 'off'));
RESET ROLE;
BEGIN;
SET LOCAL ROLE service_role;
SELECT * FROM qa.ack('T_par', 'team-a', 1, 'parent', ARRAY['00000000-0000-0000-0000-0000000000b1'::uuid], '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2', 'Pat Smith');
ROLLBACK;
SELECT qa.check('rollback: an acknowledgment in a rolled-back transaction leaves no row',
  NOT EXISTS (SELECT 1 FROM public.team_task_acknowledgments WHERE task_id = qa.id('T_par') AND athlete_id = '00000000-0000-0000-0000-0000000000b1'));
SET ROLE service_role;
SELECT qa.expect_error('flag does not leak: a later direct INSERT is still refused', $q$INSERT INTO public.team_task_acknowledgments (campaign_slug, task_id, task_revision, requirement, full_name, athlete_name_snapshot, task_title_snapshot, statement_version, statement_text) VALUES ('team-a', qa.id('T_both'), 1, 'athlete', 'Xx', 'x', 'x', 1, 'x')$q$, 'team_task_acknowledgments_write_via_function_only');
RESET ROLE;
