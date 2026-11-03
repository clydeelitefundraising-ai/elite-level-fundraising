-- School-Account Linking (phase_o3) behavior tests: school_link_apply() and
-- the completed-season metadata-only exception. Disposable local database
-- only — never against Supabase.
\set ON_ERROR_STOP on
SET client_min_messages = warning;

CREATE SCHEMA qa;
GRANT USAGE ON SCHEMA qa TO PUBLIC;
CREATE TABLE qa.results (n serial PRIMARY KEY, name text, ok boolean, detail text);
GRANT ALL ON qa.results TO PUBLIC;
GRANT ALL ON SEQUENCE qa.results_n_seq TO PUBLIC;
CREATE FUNCTION qa.check(p_name text, p_ok boolean, p_detail text DEFAULT NULL) RETURNS void
LANGUAGE sql AS $$ INSERT INTO qa.results (name, ok, detail) VALUES (p_name, coalesce(p_ok, false), p_detail) $$;
CREATE FUNCTION qa.u(p text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT md5('o3:' || p)::uuid $$;
-- Run p_sql (as p_role when given) in a subtransaction: 'ok:<result>' or
-- 'err:<message>'. A failed statement leaves nothing behind.
CREATE FUNCTION qa.try(p_sql text, p_role text DEFAULT NULL) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r text;
BEGIN
  BEGIN
    IF p_role IS NOT NULL THEN EXECUTE format('SET LOCAL ROLE %I', p_role); END IF;
    EXECUTE p_sql INTO r;
    IF p_role IS NOT NULL THEN RESET ROLE; END IF;
    RETURN 'ok:' || coalesce(r, '');
  EXCEPTION WHEN others THEN
    RETURN 'err:' || SQLERRM;
  END;
END $$;
-- Fingerprint of everything belonging to the given seasons in every
-- table with a campaign_slug column, EXCEPT campaign_settings.organization_id
-- and audit_logs (where the link and its audit rows are written).
CREATE FUNCTION qa.teamhash(p_slugs text[]) RETURNS text LANGUAGE plpgsql AS $$
DECLARE t text; h text; acc text := '';
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'campaign_slug' AND NOT a.attisdropped
           WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND c.relname <> 'audit_logs' ORDER BY 1 LOOP
    EXECUTE format('SELECT md5(coalesce(string_agg((to_jsonb(x) - %L)::text, %L ORDER BY (to_jsonb(x) - %L)::text), %L)) FROM public.%I x WHERE x.campaign_slug = ANY (%L::text[])',
                   'organization_id', '|', 'organization_id', '', t, p_slugs) INTO h;
    acc := acc || t || '=' || h || ';';
  END LOOP;
  RETURN md5(acc);
END $$;
-- Fingerprint of every public table except audit_logs.
CREATE FUNCTION qa.dbhash() RETURNS text LANGUAGE plpgsql AS $$
DECLARE t text; h text; acc text := '';
BEGIN
  FOR t IN SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND relname <> 'audit_logs' ORDER BY 1 LOOP
    EXECUTE format('SELECT md5(coalesce(string_agg(x::text, %L ORDER BY x::text), %L)) FROM public.%I x', '|', '', t) INTO h;
    acc := acc || t || '=' || h || ';';
  END LOOP;
  RETURN md5(acc);
END $$;
CREATE FUNCTION qa.audits() RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT count(*) FROM public.audit_logs WHERE action LIKE 'school_link.%' $$;
CREATE FUNCTION qa.org(p_slug text) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT organization_id FROM public.campaign_settings WHERE campaign_slug = p_slug $$;
-- The app server's call: school_link_apply(...) as service_role.
CREATE FUNCTION qa.apply(p_actor jsonb, p_team text, p_org uuid, p_seasons jsonb, p_role text DEFAULT 'service_role') RETURNS text LANGUAGE sql AS $$
  SELECT qa.try(format('SELECT public.school_link_apply(%L::jsonb, %L, %L::uuid, %L::jsonb, %L::jsonb)::text',
                       p_actor::text, p_team, p_org, p_seasons::text, '{"ip_address":"203.0.113.9","user_agent":"qa-agent"}'), p_role) $$;
CREATE FUNCTION qa.s(VARIADIC p jsonb[]) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$ SELECT to_jsonb(p) $$;
CREATE FUNCTION qa.e(p_slug text, p_expected uuid) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('campaign_slug', p_slug, 'expected_organization_id', p_expected) $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA qa TO PUBLIC;

-- ── Fixtures ───────────────────────────────────────────────────────────
-- Accounts: a Platform Admin, a second Platform Admin, a plain account.
INSERT INTO public.elf_accounts (id, email, password_hash, salt, name) VALUES
  (qa.u('pa1-acct'), 'pa1@example.test', 'x', 'x', 'Admin One'),
  (qa.u('pa2-acct'), 'pa2@example.test', 'x', 'x', 'Admin Two'),
  (qa.u('coach-acct'), 'coach@example.test', 'x', 'x', 'Coach Person');
INSERT INTO public.platform_admins (id, account_id) VALUES
  (qa.u('pa1'), qa.u('pa1-acct')), (qa.u('pa2'), qa.u('pa2-acct'));
-- Schools.
INSERT INTO public.organizations (id, slug, school_name, show_community_partners, show_community_partners_public) VALUES
  (qa.u('org-a'), 'qa-north', 'North High', true, false),
  (qa.u('org-b'), 'qa-south', 'South High', false, true),
  (qa.u('org-boom'), 'qa-boom', 'Boom High', false, false);
-- Team "alpha": 2025 -> 2026 -> 2027 (2025 and 2026 completed by succession,
-- 2027 current). Team "beta": one current season. Team "gamma": one season
-- completed by season_completed_at only (no successor yet).
INSERT INTO public.campaign_settings (campaign_slug, school_name, sport_name, season) VALUES
  ('alpha-2025', 'North', 'Track', '2025 Season'), ('alpha-2026', 'North', 'Track', '2026 Season'),
  ('alpha-2027', 'North', 'Track', '2027 Season'), ('beta-2027', 'South', 'Golf', '2027 Season'),
  ('gamma-2026', 'South', 'Swim', '2026 Season');
INSERT INTO public.athletes (campaign_slug, name, class_year) VALUES
  ('alpha-2025', 'A1', 'Senior'), ('alpha-2026', 'A2', 'Junior'), ('alpha-2027', 'A3', 'Freshman'),
  ('gamma-2026', 'G1', 'Junior');
UPDATE public.campaign_settings SET successor_campaign_slug = 'alpha-2026' WHERE campaign_slug = 'alpha-2025';
UPDATE public.campaign_settings SET successor_campaign_slug = 'alpha-2027', season_completed_at = now() WHERE campaign_slug = 'alpha-2026';
UPDATE public.campaign_settings SET season_completed_at = now() WHERE campaign_slug = 'gamma-2026';
\set pa1 '{"platform_admin_id":"' :'pa1' '"}'

DO $$ BEGIN
  PERFORM qa.check('fixture: alpha-2025/2026 and gamma-2026 are completed and read-only (direct organization_id update refused)',
    qa.try($q$UPDATE public.campaign_settings SET organization_id = qa.u('org-a') WHERE campaign_slug = 'alpha-2025'$q$) LIKE 'err:%season_completed_read_only%'
    AND qa.try($q$UPDATE public.campaign_settings SET organization_id = qa.u('org-a') WHERE campaign_slug = 'gamma-2026'$q$) LIKE 'err:%season_completed_read_only%');
END $$;

-- Actor JSON for the fixtures.
CREATE FUNCTION qa.pa1() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('platform_admin_id', qa.u('pa1'), 'account_id', qa.u('pa1-acct')) $$;
GRANT EXECUTE ON FUNCTION qa.pa1() TO PUBLIC;

-- ── 1. Linking completed seasons (metadata only) ───────────────────────
DO $$
DECLARE r text; h0 text; h1 text; a0 bigint; done jsonb;
BEGIN
  h0 := qa.teamhash(ARRAY['alpha-2025', 'alpha-2026', 'alpha-2027']);
  a0 := qa.audits();
  SELECT jsonb_object_agg(campaign_slug, jsonb_build_array(season_completed_at, successor_campaign_slug)) INTO done
  FROM public.campaign_settings WHERE campaign_slug LIKE 'alpha-%';
  r := qa.apply(qa.pa1(), 'alpha-2027', qa.u('org-a'),
       qa.s(qa.e('alpha-2025', NULL), qa.e('alpha-2026', NULL), qa.e('alpha-2027', NULL)));
  PERFORM qa.check('L1 link: two completed seasons + the current one linked in one call', r LIKE 'ok:%'
    AND (substr(r, 4)::jsonb -> 'updated') = '["alpha-2025","alpha-2026","alpha-2027"]'::jsonb
    AND qa.org('alpha-2025') = qa.u('org-a') AND qa.org('alpha-2026') = qa.u('org-a') AND qa.org('alpha-2027') = qa.u('org-a'), r);
  h1 := qa.teamhash(ARRAY['alpha-2025', 'alpha-2026', 'alpha-2027']);
  PERFORM qa.check('L2 only organization_id changed: every other column of the three seasons and all their roster/attendance/messaging/fundraising rows identical', h0 = h1, h0 || ' -> ' || h1);
  PERFORM qa.check('L3 completion status and successor chain unchanged',
    done = (SELECT jsonb_object_agg(campaign_slug, jsonb_build_array(season_completed_at, successor_campaign_slug)) FROM public.campaign_settings WHERE campaign_slug LIKE 'alpha-%'));
  PERFORM qa.check('L4 one audit row per changed season, written by the same call', qa.audits() = a0 + 3, (qa.audits() - a0)::text);
  PERFORM qa.check('L5 audit rows carry the real Platform Admin, action, previous/new school, partner visibility, request metadata',
    (SELECT count(*) FROM public.audit_logs WHERE action = 'school_link.set' AND campaign_slug LIKE 'alpha-%'
       AND actor_type = 'platform_admin' AND actor_id = qa.u('pa1') AND actor_email = 'pa1@example.test' AND admin_identifier = 'pa1@example.test'
       AND entity_type = 'campaign_settings' AND entity_id = campaign_slug
       AND previous_value = '{"organization_id":null,"school":null,"community_partners":{"teamApp":false,"publicPage":false}}'::jsonb
       AND new_value = jsonb_build_object('organization_id', qa.u('org-a'), 'school', 'North High', 'community_partners', '{"teamApp":true,"publicPage":false}'::jsonb)
       AND ip_address = '203.0.113.9' AND user_agent = 'qa-agent') = 3);
  PERFORM qa.check('L6 completed seasons are labelled in the audit summary (current season is not)',
    (SELECT count(*) FROM public.audit_logs WHERE action = 'school_link.set' AND summary LIKE '%(completed season)') = 2
    AND (SELECT summary FROM public.audit_logs WHERE action = 'school_link.set' AND campaign_slug = 'alpha-2027') = 'School linked for alpha-2027: North High');
  PERFORM qa.check('L7 the flag is off again after the call', coalesce(current_setting('elf.school_link', true), '') IN ('', 'off'));
END $$;

DO $$
DECLARE r text; h0 text; a0 bigint;
BEGIN
  -- Change: North -> South on one completed season only.
  h0 := qa.teamhash(ARRAY['alpha-2025', 'alpha-2026', 'alpha-2027']); a0 := qa.audits();
  r := qa.apply(qa.pa1(), 'alpha-2027', qa.u('org-b'), qa.s(qa.e('alpha-2025', qa.u('org-a'))));
  PERFORM qa.check('C1 change: a completed season moved to another school', r LIKE 'ok:%' AND qa.org('alpha-2025') = qa.u('org-b')
    AND qa.org('alpha-2026') = qa.u('org-a') AND qa.org('alpha-2027') = qa.u('org-a'), r);
  PERFORM qa.check('C2 change audit: previous North, new South, one row', qa.audits() = a0 + 1
    AND (SELECT previous_value ->> 'school' = 'North High' AND new_value ->> 'school' = 'South High'
           AND summary = 'School changed for alpha-2025: South High (completed season)'
         FROM public.audit_logs WHERE action = 'school_link.set' AND campaign_slug = 'alpha-2025' AND new_value ->> 'school' = 'South High'));
  PERFORM qa.check('C3 change touched nothing but organization_id', h0 = qa.teamhash(ARRAY['alpha-2025', 'alpha-2026', 'alpha-2027']));
  -- Unlink: completed season back to no school.
  a0 := qa.audits();
  r := qa.apply(qa.pa1(), 'alpha-2025', NULL, qa.s(qa.e('alpha-2025', qa.u('org-b'))));
  PERFORM qa.check('U1 unlink: a completed season unlinked (NULL)', r LIKE 'ok:%' AND qa.org('alpha-2025') IS NULL, r);
  PERFORM qa.check('U2 unlink audit row (school_link.unlink, new organization null)', qa.audits() = a0 + 1
    AND (SELECT action = 'school_link.unlink' AND new_value -> 'organization_id' = 'null'::jsonb AND previous_value ->> 'school' = 'South High'
         FROM public.audit_logs WHERE campaign_slug = 'alpha-2025' AND action = 'school_link.unlink'));
  PERFORM qa.check('U3 unlink touched nothing but organization_id', h0 = qa.teamhash(ARRAY['alpha-2025', 'alpha-2026', 'alpha-2027']));
  -- A season completed only by season_completed_at (no successor).
  r := qa.apply(qa.pa1(), 'gamma-2026', qa.u('org-b'), qa.s(qa.e('gamma-2026', NULL)));
  PERFORM qa.check('L8 a season completed by season_completed_at (no successor) can be linked', r LIKE 'ok:%' AND qa.org('gamma-2026') = qa.u('org-b'), r);
  -- Mixed: some seasons already have the target.
  r := qa.apply(qa.pa1(), 'alpha-2027', qa.u('org-a'), qa.s(qa.e('alpha-2025', NULL), qa.e('alpha-2026', qa.u('org-a'))));
  PERFORM qa.check('L9 seasons already on the target are reported unchanged and not audited',
    r LIKE 'ok:%' AND substr(r, 4)::jsonb = '{"updated":["alpha-2025"],"unchanged":["alpha-2026"]}'::jsonb, r);
END $$;

-- ── 2. Refusals write nothing (no season change, no audit row) ─────────
DO $$
DECLARE r text; h0 text; a0 bigint; c record;
BEGIN
  h0 := qa.dbhash(); a0 := qa.audits();
  FOR c IN SELECT * FROM (VALUES
    ('R1 stale: the season''s school changed since the preview', qa.pa1(), 'alpha-2027', qa.u('org-b'), qa.s(qa.e('alpha-2026', NULL)), 'school_link_stale'),
    ('R2 stale on ONE of three seasons refuses all three (no partial update)', qa.pa1(), 'alpha-2027', qa.u('org-b'),
       qa.s(qa.e('alpha-2025', qa.u('org-a')), qa.e('alpha-2026', qa.u('org-a')), qa.e('alpha-2027', qa.u('org-b'))), 'school_link_stale'),
    ('R3 nothing to change', qa.pa1(), 'alpha-2027', qa.u('org-a'), qa.s(qa.e('alpha-2027', qa.u('org-a'))), 'school_link_nothing_to_change'),
    ('R4 a season of another team', qa.pa1(), 'alpha-2027', qa.u('org-b'), qa.s(qa.e('alpha-2027', qa.u('org-a')), qa.e('beta-2027', NULL)), 'school_link_season_not_in_team'),
    ('R5 a season that does not exist', qa.pa1(), 'alpha-2027', qa.u('org-b'), qa.s(qa.e('alpha-2099', NULL)), 'school_link_season_not_in_team'),
    ('R6 a team that does not exist', qa.pa1(), 'nope-2027', qa.u('org-b'), qa.s(qa.e('alpha-2027', qa.u('org-a'))), 'school_link_team_not_found'),
    ('R7 a school that does not exist (never created)', qa.pa1(), 'alpha-2027', qa.u('org-missing'), qa.s(qa.e('alpha-2027', qa.u('org-a'))), 'school_link_organization_not_found'),
    ('A1 a signed-in account that is not a Platform Admin', jsonb_build_object('platform_admin_id', qa.u('pa1'), 'account_id', qa.u('coach-acct')), 'alpha-2027', qa.u('org-b'), qa.s(qa.e('alpha-2027', qa.u('org-a'))), 'school_link_actor_not_authorized'),
    ('A2 a forged admin id', jsonb_build_object('platform_admin_id', qa.u('forged'), 'account_id', qa.u('pa1-acct')), 'alpha-2027', qa.u('org-b'), qa.s(qa.e('alpha-2027', qa.u('org-a'))), 'school_link_actor_not_authorized'),
    ('A3 ids of two different admins mixed', jsonb_build_object('platform_admin_id', qa.u('pa1'), 'account_id', qa.u('pa2-acct')), 'alpha-2027', qa.u('org-b'), qa.s(qa.e('alpha-2027', qa.u('org-a'))), 'school_link_actor_not_authorized'),
    ('A4 no actor (e.g. a shared-password /admin session has no account)', '{}'::jsonb, 'alpha-2027', qa.u('org-b'), qa.s(qa.e('alpha-2027', qa.u('org-a'))), 'school_link_actor_invalid'),
    ('A5 malformed actor ids', '{"platform_admin_id":"admin","account_id":"x"}'::jsonb, 'alpha-2027', qa.u('org-b'), qa.s(qa.e('alpha-2027', qa.u('org-a'))), 'school_link_actor_invalid'),
    ('A6 null actor', NULL::jsonb, 'alpha-2027', qa.u('org-b'), qa.s(qa.e('alpha-2027', qa.u('org-a'))), 'school_link_actor_invalid'),
    ('I1 empty season list', qa.pa1(), 'alpha-2027', qa.u('org-b'), '[]'::jsonb, 'school_link_invalid'),
    ('I2 duplicate season', qa.pa1(), 'alpha-2027', qa.u('org-b'), qa.s(qa.e('alpha-2027', qa.u('org-a')), qa.e('alpha-2027', qa.u('org-a'))), 'school_link_invalid'),
    ('I3 season list is not an array', qa.pa1(), 'alpha-2027', qa.u('org-b'), '{"campaign_slug":"alpha-2027"}'::jsonb, 'school_link_invalid'),
    ('I4 missing expected_organization_id (no preview)', qa.pa1(), 'alpha-2027', qa.u('org-b'), '[{"campaign_slug":"alpha-2027"}]'::jsonb, 'school_link_invalid'),
    ('I5 expected_organization_id not a uuid', qa.pa1(), 'alpha-2027', qa.u('org-b'), '[{"campaign_slug":"alpha-2027","expected_organization_id":"x"}]'::jsonb, 'school_link_invalid'),
    ('I6 expected_organization_id wrong type', qa.pa1(), 'alpha-2027', qa.u('org-b'), '[{"campaign_slug":"alpha-2027","expected_organization_id":5}]'::jsonb, 'school_link_invalid'),
    ('I7 malformed season slug', qa.pa1(), 'alpha-2027', qa.u('org-b'), '[{"campaign_slug":"Alpha 2027;--","expected_organization_id":null}]'::jsonb, 'school_link_invalid'),
    ('I8 malformed team slug', qa.pa1(), 'ALPHA', qa.u('org-b'), qa.s(qa.e('alpha-2027', qa.u('org-a'))), 'school_link_invalid'),
    ('I9 more than 40 seasons', qa.pa1(), 'alpha-2027', qa.u('org-b'), (SELECT jsonb_agg(qa.e('s' || g, NULL)) FROM generate_series(1, 41) g), 'school_link_invalid')
  ) v(name, actor, team, org, seasons, want) LOOP
    r := qa.apply(c.actor, c.team, c.org, c.seasons);
    PERFORM qa.check(c.name || ' -> refused', r LIKE 'err:' || c.want || '%', r);
  END LOOP;
  PERFORM qa.check('R8 after every refusal: no season changed and no audit row written', h0 = qa.dbhash() AND qa.audits() = a0, (qa.audits() - a0)::text);
  PERFORM qa.check('R9 refusals carry fixed codes only (no SQL text, no ids)',
    (SELECT bool_and(detail ~ '^err:school_link_[a-z_]+$') FROM qa.results WHERE name ~ '^(R[1-7]|A[1-6]|I[1-9]) ' AND ok));
END $$;

-- ── 3. A failure after the audit insert rolls the audit rows back ──────
-- Test-only trigger: refuses any campaign_settings update that sets the
-- "boom" school. school_link_apply writes its audit rows BEFORE the update,
-- so this fails the call after the audit rows exist in the transaction.
CREATE FUNCTION qa.boom() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organization_id = qa.u('org-boom') AND NEW.campaign_slug = 'alpha-2027' THEN RAISE EXCEPTION 'qa_boom'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER qa_boom BEFORE UPDATE ON public.campaign_settings FOR EACH ROW EXECUTE FUNCTION qa.boom();
DO $$
DECLARE r text; h0 text; a0 bigint; n0 bigint;
BEGIN
  h0 := qa.dbhash(); a0 := qa.audits(); n0 := (SELECT count(*) FROM public.audit_logs);
  r := qa.apply(qa.pa1(), 'alpha-2027', qa.u('org-boom'),
       qa.s(qa.e('alpha-2025', qa.u('org-a')), qa.e('alpha-2026', qa.u('org-a')), qa.e('alpha-2027', qa.u('org-a'))));
  PERFORM qa.check('F1 the update failing on the 3rd season (after the audit insert) fails the whole call', r LIKE 'err:qa_boom%', r);
  PERFORM qa.check('F2 ... and leaves all three seasons on their previous school (no partial update)',
    qa.org('alpha-2025') = qa.u('org-a') AND qa.org('alpha-2026') = qa.u('org-a') AND qa.org('alpha-2027') = qa.u('org-a') AND h0 = qa.dbhash());
  PERFORM qa.check('F3 ... and no audit row survives', qa.audits() = a0 AND (SELECT count(*) FROM public.audit_logs) = n0);
  PERFORM qa.check('F4 ... and the flag did not survive the failure', coalesce(current_setting('elf.school_link', true), '') IN ('', 'off'));
END $$;
DROP TRIGGER qa_boom ON public.campaign_settings;

-- ── 4. Every other completed-season write stays blocked ────────────────
-- qa.flagged: the statement with elf.school_link = 'on' forced, as if a
-- caller could set it (subtransaction: flag and changes roll back).
CREATE FUNCTION qa.flagged(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    PERFORM set_config('elf.school_link', 'on', true);
    EXECUTE p_sql;
    RAISE EXCEPTION 'qa_allowed';
  EXCEPTION WHEN others THEN
    RETURN 'err:' || SQLERRM;
  END;
END $$;
DO $$
DECLARE r text; c record;
BEGIN
  FOR c IN SELECT * FROM (VALUES
    ('B1 organization_id directly, without the flag (e.g. service_role PATCH)', false, $q$UPDATE public.campaign_settings SET organization_id = qa.u('org-b') WHERE campaign_slug = 'alpha-2026'$q$),
    ('B2 with the flag: organization_id AND another column together', true, $q$UPDATE public.campaign_settings SET organization_id = qa.u('org-b'), school_name = 'X' WHERE campaign_slug = 'alpha-2026'$q$),
    ('B3 with the flag: completion status (season_completed_at)', true, $q$UPDATE public.campaign_settings SET season_completed_at = NULL WHERE campaign_slug = 'alpha-2026'$q$),
    ('B4 with the flag: successor relationship', true, $q$UPDATE public.campaign_settings SET successor_campaign_slug = NULL WHERE campaign_slug = 'alpha-2025'$q$),
    ('B5 with the flag: fundraising goal', true, $q$UPDATE public.campaign_settings SET goal_cents = 1 WHERE campaign_slug = 'alpha-2026'$q$),
    ('B6 with the flag: roster (another table)', true, $q$UPDATE public.athletes SET name = 'Z' WHERE campaign_slug = 'alpha-2026'$q$),
    ('B7 with the flag: roster insert', true, $q$INSERT INTO public.athletes (campaign_slug, name, class_year) VALUES ('alpha-2026', 'New', 'Junior')$q$),
    ('B8 with the flag: delete the completed season', true, $q$DELETE FROM public.campaign_settings WHERE campaign_slug = 'alpha-2025'$q$),
    ('B9 with the flag: roster delete', true, $q$DELETE FROM public.athletes WHERE campaign_slug = 'gamma-2026'$q$)
  ) v(name, flag, q) LOOP
    r := CASE WHEN c.flag THEN qa.flagged(c.q) ELSE qa.try(c.q) END;
    PERFORM qa.check(c.name || ' -> refused', r LIKE 'err:%season_completed_read_only%', r);
  END LOOP;
END $$;
-- The checks above ran inside qa.try's subtransaction; confirm directly too.
DO $$ BEGIN
  PERFORM qa.check('B10 completed seasons still intact after the attempts',
    (SELECT count(*) FROM public.campaign_settings WHERE campaign_slug IN ('alpha-2025', 'alpha-2026') AND successor_campaign_slug IS NOT NULL) = 2
    AND (SELECT season_completed_at IS NOT NULL FROM public.campaign_settings WHERE campaign_slug = 'alpha-2026')
    AND (SELECT count(*) FROM public.athletes WHERE campaign_slug IN ('alpha-2026', 'gamma-2026')) = 2);
END $$;

-- The flag never leaks out of school_link_apply into the caller's transaction.
BEGIN;
SELECT qa.try($q$SELECT public.school_link_apply(qa.pa1(), 'beta-2027', qa.u('org-b'), qa.s(qa.e('beta-2027', NULL)))::text$q$) AS r \gset
SELECT qa.check('X1 within one transaction: apply succeeds ...', :'r' LIKE 'ok:%', :'r');
SELECT qa.check('X2 ... the flag is off afterwards ...', current_setting('elf.school_link', true) = 'off');
SELECT qa.check('X3 ... and a following direct organization_id write on a completed season is still refused',
  qa.try($q$UPDATE public.campaign_settings SET organization_id = qa.u('org-b') WHERE campaign_slug = 'alpha-2026'$q$) LIKE 'err:%season_completed_read_only%');
ROLLBACK;
SELECT qa.check('X4 rolling back the caller''s transaction undoes the link and its audit rows',
  qa.org('beta-2027') IS NULL AND (SELECT count(*) FROM public.audit_logs WHERE campaign_slug = 'beta-2027') = 0);

-- ── 5. Privileges ──────────────────────────────────────────────────────
DO $$
DECLARE sig text := 'public.school_link_apply(jsonb,text,uuid,jsonb,jsonb)';
BEGIN
  PERFORM qa.check('P1 anon cannot execute', NOT has_function_privilege('anon', sig, 'EXECUTE')
    AND qa.apply(qa.pa1(), 'beta-2027', qa.u('org-b'), qa.s(qa.e('beta-2027', NULL)), 'anon') LIKE 'err:permission denied%');
  PERFORM qa.check('P2 authenticated cannot execute', NOT has_function_privilege('authenticated', sig, 'EXECUTE')
    AND qa.apply(qa.pa1(), 'beta-2027', qa.u('org-b'), qa.s(qa.e('beta-2027', NULL)), 'authenticated') LIKE 'err:permission denied%');
  PERFORM qa.check('P3 PUBLIC has no EXECUTE; only service_role (and the owner)',
    (SELECT bool_and(a.grantee <> 0) AND array_agg(DISTINCT pg_get_userbyid(a.grantee)::text ORDER BY pg_get_userbyid(a.grantee)::text) = ARRAY['postgres', 'service_role']
     FROM pg_proc p, aclexplode(p.proacl) a WHERE p.oid = sig::regprocedure AND a.privilege_type = 'EXECUTE'));
  PERFORM qa.check('P4 SECURITY DEFINER with an empty search_path',
    (SELECT prosecdef AND proconfig = ARRAY['search_path=""'] FROM pg_proc WHERE oid = sig::regprocedure));
  PERFORM qa.check('P5 service_role can execute (the app server path)', has_function_privilege('service_role', sig, 'EXECUTE'));
END $$;
