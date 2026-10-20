-- Phase 5 attendance behavior tests. Disposable local database only.
-- Run as superuser after bootstrap + phase_t2 + phase_t3 + phase_t5. Each
-- check writes a row to qa.results; the runner prints failures and a
-- summary. Dates are relative to the team's real "today" in
-- America/Phoenix, so the suite is valid on any day.
\set ON_ERROR_STOP on

CREATE SCHEMA qa;
GRANT USAGE ON SCHEMA qa TO PUBLIC;
CREATE TABLE qa.results (n serial PRIMARY KEY, name text, ok boolean, detail text);
GRANT ALL ON qa.results TO PUBLIC;
GRANT ALL ON SEQUENCE qa.results_n_seq TO PUBLIC;
CREATE TABLE qa.vals (k text PRIMARY KEY, v text);
GRANT ALL ON qa.vals TO PUBLIC;

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

CREATE FUNCTION qa.u(p_code text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT ('00000000-0000-0000-0000-0000000000' || p_code)::uuid $$;
CREATE FUNCTION qa.coach(p_code text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$ SELECT jsonb_build_object('coach_id', qa.u(p_code)) $$;
CREATE FUNCTION qa.admin(p_code text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$ SELECT jsonb_build_object('platform_admin_id', qa.u(p_code)) $$;
CREATE FUNCTION qa.today() RETURNS date LANGUAGE sql STABLE AS $$ SELECT public.team_attendance_today('team-a') $$;
CREATE FUNCTION qa.d(p_offset integer) RETURNS date LANGUAGE sql STABLE AS $$ SELECT qa.today() + p_offset $$;
-- Everyone in p_codes, Present.
CREATE FUNCTION qa.p(p_codes text[]) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('athlete_id', qa.u(c), 'status', 'present') ORDER BY c), '[]'::jsonb) FROM unnest(p_codes) c $$;
CREATE FUNCTION qa.absent(p_code text, p_reason text, p_note text DEFAULT NULL) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_array(jsonb_build_object('athlete_id', qa.u(p_code), 'status', 'absent', 'absence_reason', p_reason, 'note', p_note)) $$;
CREATE FUNCTION qa.v(p_slug text, p_date date) RETURNS integer LANGUAGE sql STABLE AS $$
  SELECT version FROM public.team_attendance_sessions WHERE campaign_slug = p_slug AND session_date = p_date $$;
CREATE FUNCTION qa.sid(p_slug text, p_date date) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT id FROM public.team_attendance_sessions WHERE campaign_slug = p_slug AND session_date = p_date $$;
CREATE FUNCTION qa.save(p_slug text, p_date date, p_version integer, p_records jsonb, p_actor jsonb) RETURNS jsonb
LANGUAGE sql AS $$ SELECT public.team_attendance_save_draft(p_slug, p_date, p_version, p_records, p_actor) $$;
CREATE FUNCTION qa.rec(p_date date, p_code text) RETURNS public.team_attendance_records LANGUAGE sql STABLE AS $$
  SELECT r.* FROM public.team_attendance_records r
  WHERE r.session_id = qa.sid('team-a', p_date) AND r.athlete_id = qa.u(p_code) $$;
CREATE FUNCTION qa.fingerprint() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(md5(string_agg(row(s.*)::text, '|' ORDER BY s.id)), '') ||
         coalesce(md5((SELECT string_agg(row(r.*)::text, '|' ORDER BY r.id) FROM public.team_attendance_records r)), '')
  FROM public.team_attendance_sessions s $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA qa TO PUBLIC;

-- ═══ A. Objects, RLS, privileges ═══════════════════════════════════════
SELECT qa.check('A1 both tables have RLS enabled and no policies',
  (SELECT bool_and(relrowsecurity) FROM pg_class WHERE relname IN ('team_attendance_sessions', 'team_attendance_records'))
  AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename LIKE 'team_attendance%'));
SELECT qa.check('A2 anon/authenticated: no privilege of any kind on either table',
  NOT EXISTS (
    SELECT 1 FROM unnest(ARRAY['anon', 'authenticated']) r, unnest(ARRAY['team_attendance_sessions', 'team_attendance_records']) t,
      unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
    WHERE has_table_privilege(r, 'public.' || t, p)));
SELECT qa.check('A3 service_role: SELECT only (no INSERT/UPDATE/DELETE/TRUNCATE) on both tables',
  (SELECT bool_and(has_table_privilege('service_role', 'public.' || t, 'SELECT')) FROM unnest(ARRAY['team_attendance_sessions', 'team_attendance_records']) t)
  AND NOT EXISTS (
    SELECT 1 FROM unnest(ARRAY['team_attendance_sessions', 'team_attendance_records']) t,
      unnest(ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
    WHERE has_table_privilege('service_role', 'public.' || t, p)));
SELECT qa.check('A4 anon/authenticated cannot execute ANY attendance function',
  NOT EXISTS (
    SELECT 1 FROM pg_proc p, unnest(ARRAY['anon', 'authenticated']) r
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'team_attendance%'
      AND has_function_privilege(r, p.oid, 'EXECUTE')));
SELECT qa.check('A5 service_role executes exactly the 7 callable functions (not the guards or the uuid parser)',
  (SELECT array_agg(p.proname ORDER BY p.proname) FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'team_attendance%'
     AND has_function_privilege('service_role', p.oid, 'EXECUTE'))
  = ARRAY['team_attendance_date_editable', 'team_attendance_local_date', 'team_attendance_save_draft',
          'team_attendance_session_roster', 'team_attendance_session_summaries', 'team_attendance_time_zone',
          'team_attendance_today']::name[]);
SELECT qa.check('A6 only the save function is SECURITY DEFINER; every attendance function pins search_path to empty',
  (SELECT array_agg(proname) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname LIKE 'team_attendance%' AND prosecdef)
    = ARRAY['team_attendance_save_draft']::name[]
  AND NOT EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname LIKE 'team_attendance%'
                  AND coalesce(array_to_string(proconfig, ','), '') <> 'search_path=""'));
SET ROLE anon;
SELECT qa.expect_error('A7 anon calling the save function is refused by privileges',
  $q$SELECT public.team_attendance_save_draft('team-a', qa.today(), 0, '[]', qa.coach('c1'))$q$, 'permission denied');
SELECT qa.expect_error('A8 anon reading sessions is refused', $q$SELECT count(*) FROM public.team_attendance_sessions$q$, 'permission denied');
RESET ROLE;
SET ROLE authenticated;
SELECT qa.expect_error('A9 authenticated reading records is refused', $q$SELECT count(*) FROM public.team_attendance_records$q$, 'permission denied');
SELECT qa.expect_error('A10 authenticated calling the roster read is refused',
  $q$SELECT * FROM public.team_attendance_session_roster('team-a', qa.today())$q$, 'permission denied');
RESET ROLE;

-- ═══ B. Time zone and dates ═════════════════════════════════════════════
SELECT qa.check('B1 Phoenix midnight: 06:59:59 UTC is still the previous local day',
  public.team_attendance_local_date('2026-10-20 06:59:59+00', 'America/Phoenix') = '2026-10-19');
SELECT qa.check('B2 Phoenix midnight: 07:00:00 UTC is the next local day',
  public.team_attendance_local_date('2026-10-20 07:00:00+00', 'America/Phoenix') = '2026-10-20');
SELECT qa.check('B3 03:00 UTC (already tomorrow in UTC) is still today in Phoenix',
  public.team_attendance_local_date('2026-10-20 03:00:00+00', 'America/Phoenix') = '2026-10-19');
SELECT qa.check('B4 no daylight saving in Phoenix: UTC-7 in July and on the US DST start day',
  public.team_attendance_local_date('2026-07-01 06:59:59+00', 'America/Phoenix') = '2026-06-30'
  AND public.team_attendance_local_date('2026-03-08 06:59:59+00', 'America/Phoenix') = '2026-03-07'
  AND public.team_attendance_local_date('2026-03-08 07:00:00+00', 'America/Phoenix') = '2026-03-08');
SELECT qa.check('B5 another zone works too (future per-team zones): New York, across DST',
  public.team_attendance_local_date('2026-07-01 03:59:59+00', 'America/New_York') = '2026-06-30'
  AND public.team_attendance_local_date('2026-01-15 04:59:59+00', 'America/New_York') = '2026-01-14');
SELECT qa.check('B6 edit window: today and 14 days back are editable; 15 back, tomorrow and NULL are not',
  public.team_attendance_date_editable('2026-10-19', '2026-10-19')
  AND public.team_attendance_date_editable('2026-10-05', '2026-10-19')
  AND NOT public.team_attendance_date_editable('2026-10-04', '2026-10-19')
  AND NOT public.team_attendance_date_editable('2026-10-20', '2026-10-19')
  AND NOT public.team_attendance_date_editable(NULL, '2026-10-19')
  AND NOT public.team_attendance_date_editable('2026-10-19', NULL));
SELECT qa.check('B7 the window crosses month and year boundaries correctly',
  public.team_attendance_date_editable('2026-12-18', '2027-01-01')
  AND NOT public.team_attendance_date_editable('2026-12-17', '2027-01-01')
  AND public.team_attendance_date_editable('2028-02-15', '2028-02-29'));
SELECT qa.check('B8 every team is America/Phoenix in Phase 5; today = the Phoenix date of now()',
  public.team_attendance_time_zone('team-a') = 'America/Phoenix'
  AND public.team_attendance_time_zone('anything') = 'America/Phoenix'
  AND public.team_attendance_today('team-a') = (now() AT TIME ZONE 'America/Phoenix')::date);

-- ═══ C. First session creation ══════════════════════════════════════════
SET ROLE service_role;
INSERT INTO qa.vals SELECT 'C_first', qa.save('team-a', qa.today(), 0,
  qa.p(ARRAY['b3', 'b4']) || qa.absent('b1', 'excused', E'  Doctor appointment \n')
  || qa.absent('b2', 'unexcused') || qa.absent('b5', 'other'),
  qa.coach('c1'))::text;
RESET ROLE;
SELECT qa.check('C1 first save creates the session: created, version 1, counts (no names)',
  (SELECT v::jsonb FROM qa.vals WHERE k = 'C_first') @> jsonb_build_object('created', true, 'version', 1, 'session_date', qa.today(),
     'counts', jsonb_build_object('total', 5, 'present', 2, 'absent', 3, 'excused', 1, 'unexcused', 1, 'other', 1))
  AND (SELECT v::jsonb ? 'saved_at' AND v::jsonb ? 'session_id' FROM qa.vals WHERE k = 'C_first'),
  (SELECT v FROM qa.vals WHERE k = 'C_first'));
SELECT qa.check('C2 the session is a draft in America/Phoenix, created and updated by the Head Coach (ids + name)',
  EXISTS (SELECT 1 FROM public.team_attendance_sessions s
          WHERE s.campaign_slug = 'team-a' AND s.session_date = qa.today() AND s.status = 'draft' AND s.version = 1
            AND s.time_zone = 'America/Phoenix'
            AND s.created_by_coach_id = qa.u('c1') AND s.created_by_account_id = qa.u('a1') AND s.created_by_platform_admin_id IS NULL
            AND s.created_by_name = 'Hana Head' AND s.updated_by_coach_id = qa.u('c1') AND s.updated_by_name = 'Hana Head'));
SELECT qa.check('C3 one record per athlete, including Present ones; snapshots read from the roster',
  (SELECT count(*) FROM public.team_attendance_records WHERE session_id = qa.sid('team-a', qa.today())) = 5
  AND (qa.rec(qa.today(), 'b1')).athlete_name_snapshot = 'Ava Adams' AND (qa.rec(qa.today(), 'b1')).class_year_snapshot = 'Freshman'
  AND (qa.rec(qa.today(), 'b3')).class_year_snapshot IS NULL AND (qa.rec(qa.today(), 'b3')).status = 'present'
  AND (qa.rec(qa.today(), 'b4')).status = 'present' AND (qa.rec(qa.today(), 'b4')).absence_reason IS NULL);
SELECT qa.check('C4 absences keep their reasons; the note is trimmed; no note stays NULL',
  (qa.rec(qa.today(), 'b1')).absence_reason = 'excused' AND (qa.rec(qa.today(), 'b1')).note = 'Doctor appointment'
  AND (qa.rec(qa.today(), 'b2')).absence_reason = 'unexcused' AND (qa.rec(qa.today(), 'b2')).note IS NULL
  AND (qa.rec(qa.today(), 'b5')).absence_reason = 'other');
SELECT qa.check('C5 records carry the team and date of their session, and who saved them',
  NOT EXISTS (SELECT 1 FROM public.team_attendance_records r WHERE r.session_id = qa.sid('team-a', qa.today())
              AND (r.campaign_slug <> 'team-a' OR r.session_date <> qa.today() OR r.updated_by_name <> 'Hana Head')));
SELECT qa.check('C6 the write flag is off again after a save',
  coalesce(current_setting('elf.team_attendance_write', true), '') IN ('', 'off'));

-- ═══ D. Reopening ═══════════════════════════════════════════════════════
SET ROLE service_role;
SELECT qa.check('D1 summaries: the session with counts, editable, nothing removed',
  EXISTS (SELECT 1 FROM public.team_attendance_session_summaries('team-a', qa.d(-30), qa.today()) s
          WHERE s.session_date = qa.today() AND s.version = 1 AND s.status = 'draft' AND s.editable
            AND s.recorded_count = 5 AND s.present_count = 2 AND s.absent_count = 3
            AND s.excused_count = 1 AND s.unexcused_count = 1 AND s.other_count = 1 AND s.removed_count = 0
            AND s.created_by_name = 'Hana Head'));
SELECT qa.check('D2 roster read: every athlete with their saved status and note; nobody needs a decision',
  (SELECT count(*) FROM public.team_attendance_session_roster('team-a', qa.today())) = 5
  AND NOT EXISTS (SELECT 1 FROM public.team_attendance_session_roster('team-a', qa.today()) r
                  WHERE NOT r.on_roster OR NOT r.has_record OR r.requires_decision OR r.added_after_session_date)
  AND EXISTS (SELECT 1 FROM public.team_attendance_session_roster('team-a', qa.today()) r
              WHERE r.athlete_id = qa.u('b1') AND r.status = 'absent' AND r.absence_reason = 'excused'
                AND r.note = 'Doctor appointment' AND r.record_updated_by_name = 'Hana Head'));
SELECT qa.check('D3 roster read for a date with no session: the roster, nothing recorded',
  (SELECT count(*) FROM public.team_attendance_session_roster('team-a', qa.d(-1)) r
   WHERE r.on_roster AND NOT r.has_record AND r.status IS NULL AND r.record_id IS NULL) = 5);
SELECT qa.check('D4 summaries only show this team''s sessions in the range',
  NOT EXISTS (SELECT 1 FROM public.team_attendance_session_summaries('team-b', qa.d(-30), qa.today()))
  AND NOT EXISTS (SELECT 1 FROM public.team_attendance_session_summaries('team-a', qa.d(-30), qa.d(-1))));
SELECT qa.expect_error('D5 summaries refuse a reversed range', $q$SELECT * FROM public.team_attendance_session_summaries('team-a', qa.today(), qa.d(-1))$q$, 'attendance_range_invalid');
SELECT qa.expect_error('D6 summaries refuse a range over 366 days', $q$SELECT * FROM public.team_attendance_session_summaries('team-a', qa.d(-400), qa.today())$q$, 'attendance_range_invalid');
RESET ROLE;

-- ═══ E. Saving again (another coach) ════════════════════════════════════
INSERT INTO qa.vals SELECT 'E_b1_updated', (qa.rec(qa.today(), 'b1')).updated_at::text;
SELECT pg_sleep(0.05);
SET ROLE service_role;
INSERT INTO qa.vals SELECT 'E_second', qa.save('team-a', qa.today(), 1,
  qa.p(ARRAY['b2', 'b3', 'b4']) || qa.absent('b1', 'excused', 'Doctor appointment') || qa.absent('b5', 'other'),
  qa.coach('c2'))::text;
RESET ROLE;
SELECT qa.check('E1 an Assistant Coach saves the next version; not a new session',
  (SELECT v::jsonb FROM qa.vals WHERE k = 'E_second') @> '{"created": false, "version": 2, "counts": {"total": 5, "present": 3, "absent": 2}}'
  AND (SELECT count(*) FROM public.team_attendance_sessions WHERE campaign_slug = 'team-a' AND session_date = qa.today()) = 1,
  (SELECT v FROM qa.vals WHERE k = 'E_second'));
SELECT qa.check('E2 switching to Present leaves no reason or note',
  (qa.rec(qa.today(), 'b2')).status = 'present' AND (qa.rec(qa.today(), 'b2')).absence_reason IS NULL
  AND (qa.rec(qa.today(), 'b2')).note IS NULL AND (qa.rec(qa.today(), 'b2')).updated_by_name = 'Avi Assist');
SELECT qa.check('E3 unchanged records keep who/when they were last changed',
  (qa.rec(qa.today(), 'b1')).updated_by_name = 'Hana Head'
  AND (qa.rec(qa.today(), 'b1')).updated_at::text = (SELECT v FROM qa.vals WHERE k = 'E_b1_updated'));
SELECT qa.check('E4 the session records the new editor; the creator is unchanged',
  EXISTS (SELECT 1 FROM public.team_attendance_sessions s WHERE s.id = qa.sid('team-a', qa.today())
          AND s.updated_by_coach_id = qa.u('c2') AND s.updated_by_name = 'Avi Assist' AND s.updated_by_account_id = qa.u('a2')
          AND s.created_by_coach_id = qa.u('c1') AND s.created_by_name = 'Hana Head' AND s.updated_at >= s.created_at));

-- ═══ F. Optimistic concurrency ══════════════════════════════════════════
INSERT INTO qa.vals SELECT 'F_before', qa.fingerprint();
SET ROLE service_role;
SELECT qa.expect_error('F1 a stale version is refused',
  $q$SELECT qa.save('team-a', qa.today(), 1, qa.p(ARRAY['b1','b2','b3','b4','b5']), qa.coach('c1'))$q$, 'attendance_version_conflict');
SELECT qa.expect_error('F2 "create" (version 0) when the date already has a session is a conflict, not a duplicate',
  $q$SELECT qa.save('team-a', qa.today(), 0, qa.p(ARRAY['b1','b2','b3','b4','b5']), qa.coach('c1'))$q$, 'attendance_version_conflict');
SELECT qa.expect_error('F3 a version ahead of the session is a conflict',
  $q$SELECT qa.save('team-a', qa.today(), 7, qa.p(ARRAY['b1','b2','b3','b4','b5']), qa.coach('c1'))$q$, 'attendance_version_conflict');
SELECT qa.expect_error('F4 a non-zero version for a date with no session is refused',
  $q$SELECT qa.save('team-a', qa.d(-1), 1, qa.p(ARRAY['b1','b2','b3','b4','b5']), qa.coach('c1'))$q$, 'attendance_session_not_found');
SELECT qa.expect_error('F5 a negative version is refused', $q$SELECT qa.save('team-a', qa.today(), -1, qa.p(ARRAY['b1']), qa.coach('c1'))$q$, 'attendance_version_invalid');
SELECT qa.expect_error('F6 a NULL version is refused', $q$SELECT qa.save('team-a', qa.today(), NULL, qa.p(ARRAY['b1']), qa.coach('c1'))$q$, 'attendance_version_invalid');
RESET ROLE;
SELECT qa.check('F7 refused saves changed nothing', qa.fingerprint() = (SELECT v FROM qa.vals WHERE k = 'F_before'));
SELECT qa.check('F8 one session per team per date is also a database constraint',
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tas_one_per_team_date' AND contype = 'u'
          AND pg_get_constraintdef(oid) = 'UNIQUE (campaign_slug, session_date)'));

-- ═══ G. Record validation (version 2, Head Coach, today) ════════════════
SET ROLE service_role;
SELECT qa.expect_error('G1 records must be an array', $q$SELECT qa.save('team-a', qa.today(), 2, '{}', qa.coach('c1'))$q$, 'attendance_records_invalid');
SELECT qa.expect_error('G2 NULL records are refused', $q$SELECT qa.save('team-a', qa.today(), 2, NULL, qa.coach('c1'))$q$, 'attendance_records_invalid');
SELECT qa.expect_error('G3 each record must be an object', $q$SELECT qa.save('team-a', qa.today(), 2, qa.p(ARRAY['b1','b2','b3','b4','b5']) || '[1]', qa.coach('c1'))$q$, 'attendance_record_invalid');
SELECT qa.expect_error('G4 unknown fields are refused (no names or ids from the client)',
  $q$SELECT qa.save('team-a', qa.today(), 2, qa.p(ARRAY['b2','b3','b4','b5']) || jsonb_build_array(jsonb_build_object('athlete_id', qa.u('b1'), 'status', 'present', 'athlete_name', 'X')), qa.coach('c1'))$q$, 'attendance_record_invalid');
SELECT qa.expect_error('G5 a malformed athlete id is refused',
  $q$SELECT qa.save('team-a', qa.today(), 2, qa.p(ARRAY['b1','b2','b3','b4','b5']) || '[{"athlete_id": "abc", "status": "present"}]', qa.coach('c1'))$q$, 'attendance_record_invalid');
SELECT qa.expect_error('G6 an unknown status is refused',
  $q$SELECT qa.save('team-a', qa.today(), 2, qa.p(ARRAY['b2','b3','b4','b5']) || jsonb_build_array(jsonb_build_object('athlete_id', qa.u('b1'), 'status', 'late')), qa.coach('c1'))$q$, 'attendance_record_invalid');
SELECT qa.expect_error('G7 a non-text status is refused (never treated as unknown/valid)',
  $q$SELECT qa.save('team-a', qa.today(), 2, qa.p(ARRAY['b2','b3','b4','b5']) || jsonb_build_array(jsonb_build_object('athlete_id', qa.u('b1'), 'status', 1)), qa.coach('c1'))$q$, 'attendance_record_invalid');
SELECT qa.expect_error('G8 a missing status is refused',
  $q$SELECT qa.save('team-a', qa.today(), 2, qa.p(ARRAY['b2','b3','b4','b5']) || jsonb_build_array(jsonb_build_object('athlete_id', qa.u('b1'))), qa.coach('c1'))$q$, 'attendance_record_invalid');
SELECT qa.expect_error('G9 Absent without a reason is refused',
  $q$SELECT qa.save('team-a', qa.today(), 2, qa.p(ARRAY['b2','b3','b4','b5']) || qa.absent('b1', NULL), qa.coach('c1'))$q$, 'attendance_record_invalid');
SELECT qa.expect_error('G10 Present with a reason is refused',
  $q$SELECT qa.save('team-a', qa.today(), 2, qa.p(ARRAY['b2','b3','b4','b5']) || jsonb_build_array(jsonb_build_object('athlete_id', qa.u('b1'), 'status', 'present', 'absence_reason', 'excused')), qa.coach('c1'))$q$, 'attendance_record_invalid');
SELECT qa.expect_error('G11 Present with a note is refused',
  $q$SELECT qa.save('team-a', qa.today(), 2, qa.p(ARRAY['b2','b3','b4','b5']) || jsonb_build_array(jsonb_build_object('athlete_id', qa.u('b1'), 'status', 'present', 'note', 'hi')), qa.coach('c1'))$q$, 'attendance_record_invalid');
SELECT qa.expect_error('G12 an unknown absence reason is refused',
  $q$SELECT qa.save('team-a', qa.today(), 2, qa.p(ARRAY['b2','b3','b4','b5']) || qa.absent('b1', 'sick'), qa.coach('c1'))$q$, 'attendance_record_invalid');
SELECT qa.expect_error('G13 a note over 500 characters is refused',
  $q$SELECT qa.save('team-a', qa.today(), 2, qa.p(ARRAY['b2','b3','b4','b5']) || qa.absent('b1', 'other', repeat('x', 501)), qa.coach('c1'))$q$, 'attendance_record_invalid');
SELECT qa.expect_error('G14 a non-text note is refused',
  $q$SELECT qa.save('team-a', qa.today(), 2, qa.p(ARRAY['b2','b3','b4','b5']) || jsonb_build_array(jsonb_build_object('athlete_id', qa.u('b1'), 'status', 'absent', 'absence_reason', 'other', 'note', 5)), qa.coach('c1'))$q$, 'attendance_record_invalid');
SELECT qa.expect_error('G15 a non-boolean confirmation is refused',
  $q$SELECT qa.save('team-a', qa.today(), 2, qa.p(ARRAY['b2','b3','b4','b5']) || jsonb_build_array(jsonb_build_object('athlete_id', qa.u('b1'), 'status', 'present', 'confirm_added_after_date', 'yes')), qa.coach('c1'))$q$, 'attendance_record_invalid');
SELECT qa.expect_error('G16 the same athlete twice is refused',
  $q$SELECT qa.save('team-a', qa.today(), 2, qa.p(ARRAY['b1','b2','b3','b4','b5']) || qa.p(ARRAY['b1']), qa.coach('c1'))$q$, 'attendance_athlete_duplicate');
SELECT qa.expect_error('G17 another team''s athlete is refused',
  $q$SELECT qa.save('team-a', qa.today(), 2, qa.p(ARRAY['b1','b2','b3','b4','b5','b9']), qa.coach('c1'))$q$, 'attendance_athlete_cross_team');
SELECT qa.expect_error('G18 an athlete that does not exist is refused',
  $q$SELECT qa.save('team-a', qa.today(), 2, qa.p(ARRAY['b1','b2','b3','b4','b5','ee']), qa.coach('c1'))$q$, 'attendance_athlete_removed');
SELECT qa.expect_error('G19 leaving out a roster athlete is refused (no silent partial saves)',
  $q$SELECT qa.save('team-a', qa.today(), 2, qa.p(ARRAY['b1','b2','b3','b4']), qa.coach('c1'))$q$, 'attendance_roster_incomplete');
SELECT qa.expect_error('G20 an empty submission for a team with athletes is incomplete',
  $q$SELECT qa.save('team-a', qa.today(), 2, '[]', qa.coach('c1'))$q$, 'attendance_roster_incomplete');
SELECT qa.expect_error('G21 a team with no athletes has nothing to save',
  $q$SELECT qa.save('team-empty', qa.today(), 0, '[]', qa.coach('c7'))$q$, 'attendance_roster_empty');
SELECT qa.expect_error('G22 more than 5,000 records are refused',
  $q$SELECT qa.save('team-a', qa.today(), 2, (SELECT jsonb_agg(jsonb_build_object('athlete_id', gen_random_uuid(), 'status', 'present')) FROM generate_series(1, 5001)), qa.coach('c1'))$q$, 'attendance_records_too_many');
RESET ROLE;
SELECT qa.check('G23 none of the refused submissions changed anything', qa.fingerprint() = (SELECT v FROM qa.vals WHERE k = 'F_before'));
SET ROLE service_role;
SELECT qa.save('team-a', qa.today(), 2,
  qa.p(ARRAY['b3', 'b4']) || qa.absent('b1', 'other', repeat('n', 500)) || qa.absent('b2', 'excused', E' \t\n ') || qa.absent('b5', 'unexcused'),
  qa.coach('c1'));
RESET ROLE;
SELECT qa.check('G24 a 500-character note is accepted; a whitespace-only note is stored as no note',
  char_length((qa.rec(qa.today(), 'b1')).note) = 500 AND (qa.rec(qa.today(), 'b2')).note IS NULL
  AND (qa.rec(qa.today(), 'b2')).absence_reason = 'excused' AND qa.v('team-a', qa.today()) = 3);

-- ═══ H. Team and actor authorization ════════════════════════════════════
SET ROLE service_role;
SELECT qa.expect_error('H1 an unknown team is refused', $q$SELECT qa.save('no-such-team', qa.today(), 0, '[]', qa.coach('c1'))$q$, 'attendance_team_not_found');
SELECT qa.expect_error('H2 a NULL team is refused', $q$SELECT qa.save(NULL, qa.today(), 0, '[]', qa.coach('c1'))$q$, 'attendance_team_not_found');
SELECT qa.expect_error('H3 a missing actor is refused', $q$SELECT qa.save('team-a', qa.d(-1), 0, qa.p(ARRAY['b1','b2','b3','b4','b5']), NULL)$q$, 'attendance_actor_invalid');
SELECT qa.expect_error('H4 an actor that is not an object is refused', $q$SELECT qa.save('team-a', qa.d(-1), 0, qa.p(ARRAY['b1','b2','b3','b4','b5']), '"c1"')$q$, 'attendance_actor_invalid');
SELECT qa.expect_error('H5 an empty actor is refused', $q$SELECT qa.save('team-a', qa.d(-1), 0, qa.p(ARRAY['b1','b2','b3','b4','b5']), '{}')$q$, 'attendance_actor_invalid');
SELECT qa.expect_error('H6 both a coach and a platform admin is refused', $q$SELECT qa.save('team-a', qa.d(-1), 0, qa.p(ARRAY['b1','b2','b3','b4','b5']), qa.coach('c1') || qa.admin('f1'))$q$, 'attendance_actor_invalid');
SELECT qa.expect_error('H7 extra actor fields (e.g. a name) are refused', $q$SELECT qa.save('team-a', qa.d(-1), 0, qa.p(ARRAY['b1','b2','b3','b4','b5']), qa.coach('c1') || '{"name": "Someone"}')$q$, 'attendance_actor_invalid');
SELECT qa.expect_error('H8 a malformed coach id is refused', $q$SELECT qa.save('team-a', qa.d(-1), 0, qa.p(ARRAY['b1','b2','b3','b4','b5']), '{"coach_id": "c1"}')$q$, 'attendance_actor_invalid');
SELECT qa.expect_error('H9 a JSON null coach id is refused', $q$SELECT qa.save('team-a', qa.d(-1), 0, qa.p(ARRAY['b1','b2','b3','b4','b5']), '{"coach_id": null}')$q$, 'attendance_actor_invalid');
SELECT qa.expect_error('H10 a booster (team_coaches role booster) is refused', $q$SELECT qa.save('team-a', qa.d(-1), 0, qa.p(ARRAY['b1','b2','b3','b4','b5']), qa.coach('c3'))$q$, 'attendance_actor_not_authorized');
SELECT qa.expect_error('H11 a booster/athlete team member id passed as a coach is refused', $q$SELECT qa.save('team-a', qa.d(-1), 0, qa.p(ARRAY['b1','b2','b3','b4','b5']), qa.coach('d1'))$q$, 'attendance_actor_not_authorized');
SELECT qa.expect_error('H12 an athlete member id passed as a coach is refused', $q$SELECT qa.save('team-a', qa.d(-1), 0, qa.p(ARRAY['b1','b2','b3','b4','b5']), qa.coach('d2'))$q$, 'attendance_actor_not_authorized');
SELECT qa.expect_error('H13 another team''s Head Coach is refused', $q$SELECT qa.save('team-a', qa.d(-1), 0, qa.p(ARRAY['b1','b2','b3','b4','b5']), qa.coach('c4'))$q$, 'attendance_actor_not_authorized');
SELECT qa.expect_error('H14 a coach id that does not exist is refused', $q$SELECT qa.save('team-a', qa.d(-1), 0, qa.p(ARRAY['b1','b2','b3','b4','b5']), qa.coach('ee'))$q$, 'attendance_actor_not_authorized');
SELECT qa.expect_error('H15 a platform admin id that does not exist is refused', $q$SELECT qa.save('team-a', qa.d(-1), 0, qa.p(ARRAY['b1','b2','b3','b4','b5']), qa.admin('ee'))$q$, 'attendance_actor_not_authorized');
SELECT qa.save('team-a', qa.d(-2), 0, qa.p(ARRAY['b1','b2','b3','b4','b5']), qa.admin('f1'));
SELECT qa.save('team-a', qa.d(-1), 0, qa.p(ARRAY['b1','b2','b3','b4','b5']), qa.coach('c5'));
RESET ROLE;
SELECT qa.check('H16 none of the refused actors created a session for that date', qa.sid('team-a', qa.d(-1)) IS NOT NULL
  AND (SELECT created_by_coach_id = qa.u('c5') FROM public.team_attendance_sessions WHERE id = qa.sid('team-a', qa.d(-1))));
SELECT qa.check('H17 a platform admin can save, recorded under their own identity (never as a coach)',
  EXISTS (SELECT 1 FROM public.team_attendance_sessions s WHERE s.id = qa.sid('team-a', qa.d(-2))
          AND s.created_by_platform_admin_id = qa.u('f1') AND s.created_by_account_id = qa.u('a4')
          AND s.created_by_coach_id IS NULL AND s.created_by_name = 'Ada Admin'));
SELECT qa.check('H18 a legacy team-login Head Coach (no ELF account) can save',
  EXISTS (SELECT 1 FROM public.team_attendance_sessions s WHERE s.id = qa.sid('team-a', qa.d(-1))
          AND s.created_by_coach_id = qa.u('c5') AND s.created_by_account_id IS NULL AND s.created_by_name = 'Lee Legacy'));

-- ═══ I. Date rules ══════════════════════════════════════════════════════
SET ROLE service_role;
SELECT qa.expect_error('I1 tomorrow is refused (no future dates)', $q$SELECT qa.save('team-a', qa.d(1), 0, qa.p(ARRAY['b1','b2','b3','b4','b5']), qa.coach('c1'))$q$, 'attendance_date_in_future');
SELECT qa.expect_error('I2 15 days ago is refused', $q$SELECT qa.save('team-a', qa.d(-15), 0, qa.p(ARRAY['b1','b2','b3','b4','b5']), qa.coach('c1'))$q$, 'attendance_date_not_editable');
SELECT qa.expect_error('I3 a NULL date is refused', $q$SELECT qa.save('team-a', NULL, 0, qa.p(ARRAY['b1','b2','b3','b4','b5']), qa.coach('c1'))$q$, 'attendance_date_invalid');
SELECT qa.save('team-a', qa.d(-14), 0, qa.p(ARRAY['b1','b2','b3','b4','b5']), qa.coach('c1'));
RESET ROLE;
SELECT qa.check('I4 14 days ago is accepted', qa.v('team-a', qa.d(-14)) = 1);
SELECT qa.check('I5 no session exists for the refused dates', qa.sid('team-a', qa.d(1)) IS NULL AND qa.sid('team-a', qa.d(-15)) IS NULL);
-- An older session (as if created three weeks ago) stays readable but
-- can't be saved. Seeded by the owner through the write flag.
DO $$ BEGIN
  PERFORM set_config('elf.team_attendance_write', 'on', true);
  INSERT INTO public.team_attendance_sessions (campaign_slug, session_date, time_zone, created_by_name, updated_by_name)
  VALUES ('team-a', qa.d(-20), 'America/Phoenix', 'Hana Head', 'Hana Head');
  INSERT INTO public.team_attendance_records (session_id, campaign_slug, session_date, athlete_id, athlete_name_snapshot, class_year_snapshot, status, absence_reason)
  VALUES (qa.sid('team-a', qa.d(-20)), 'team-a', qa.d(-20), qa.u('b1'), 'Ava Adams', 'Freshman', 'absent', 'excused');
END $$;
SET ROLE service_role;
SELECT qa.expect_error('I6 an existing session older than 14 days can no longer be saved',
  $q$SELECT qa.save('team-a', qa.d(-20), 1, qa.p(ARRAY['b1','b2','b3','b4','b5']), qa.coach('c1'))$q$, 'attendance_date_not_editable');
SELECT qa.check('I7 ...but it stays readable: summaries (not editable) and roster',
  EXISTS (SELECT 1 FROM public.team_attendance_session_summaries('team-a', qa.d(-30), qa.today()) s
          WHERE s.session_date = qa.d(-20) AND NOT s.editable AND s.absent_count = 1 AND s.excused_count = 1)
  AND EXISTS (SELECT 1 FROM public.team_attendance_session_roster('team-a', qa.d(-20)) r
              WHERE r.athlete_id = qa.u('b1') AND r.has_record AND r.absence_reason = 'excused'));
SELECT qa.check('I8 summaries mark sessions inside the window editable',
  (SELECT bool_and(s.editable) FROM public.team_attendance_session_summaries('team-a', qa.d(-14), qa.today()) s));
SELECT qa.save('team-b', qa.today(), 0, qa.p(ARRAY['b9']), qa.coach('c4'));
RESET ROLE;
SELECT qa.check('I9 two teams can each have a session on the same date',
  qa.sid('team-a', qa.today()) IS NOT NULL AND qa.sid('team-b', qa.today()) IS NOT NULL
  AND qa.sid('team-a', qa.today()) <> qa.sid('team-b', qa.today()));

-- ═══ J. Athletes added after a session date ═════════════════════════════
INSERT INTO public.athletes (id, campaign_slug, name, class_year, created_at)
VALUES (qa.u('b6'), 'team-a', 'Fay Fox', 'Freshman', now());
SET ROLE service_role;
SELECT qa.check('J1 an athlete added today is flagged on an earlier date: added after, needs a coach decision',
  EXISTS (SELECT 1 FROM public.team_attendance_session_roster('team-a', qa.d(-3)) r
          WHERE r.athlete_id = qa.u('b6') AND r.on_roster AND r.added_after_session_date AND r.requires_decision
            AND NOT r.has_record AND r.status IS NULL));
SELECT qa.check('J2 ...but not on today''s date (added on the session date counts as on the roster)',
  EXISTS (SELECT 1 FROM public.team_attendance_session_roster('team-a', qa.today()) r
          WHERE r.athlete_id = qa.u('b6') AND NOT r.added_after_session_date AND NOT r.requires_decision AND NOT r.has_record));
SELECT qa.save('team-a', qa.d(-3), 0, qa.p(ARRAY['b1','b2','b3','b4','b5']), qa.coach('c1'));
SELECT qa.check('J3 saving an earlier date without the newly added athlete is allowed (no invented attendance)',
  qa.v('team-a', qa.d(-3)) = 1
  AND NOT EXISTS (SELECT 1 FROM public.team_attendance_records WHERE session_id = qa.sid('team-a', qa.d(-3)) AND athlete_id = qa.u('b6'))
  AND EXISTS (SELECT 1 FROM public.team_attendance_session_roster('team-a', qa.d(-3)) r WHERE r.athlete_id = qa.u('b6') AND r.requires_decision));
SELECT qa.expect_error('J4 including them without the coach''s explicit confirmation is refused',
  $q$SELECT qa.save('team-a', qa.d(-3), 1, qa.p(ARRAY['b1','b2','b3','b4','b5','b6']), qa.coach('c1'))$q$, 'attendance_late_athlete_unconfirmed');
SELECT qa.save('team-a', qa.d(-3), 1,
  qa.p(ARRAY['b1','b2','b3','b4','b5']) || jsonb_build_array(jsonb_build_object('athlete_id', qa.u('b6'), 'status', 'present', 'confirm_added_after_date', true)),
  qa.coach('c1'));
SELECT qa.check('J5 with the explicit confirmation they are recorded; no longer needs a decision',
  qa.v('team-a', qa.d(-3)) = 2
  AND EXISTS (SELECT 1 FROM public.team_attendance_session_roster('team-a', qa.d(-3)) r
              WHERE r.athlete_id = qa.u('b6') AND r.has_record AND NOT r.requires_decision AND r.status = 'present'));
SELECT qa.expect_error('J6 once recorded, they are required in later saves of that session',
  $q$SELECT qa.save('team-a', qa.d(-3), 2, qa.p(ARRAY['b1','b2','b3','b4','b5']), qa.coach('c1'))$q$, 'attendance_roster_incomplete');
SELECT qa.expect_error('J7 an athlete added on the session date is required (today)',
  $q$SELECT qa.save('team-a', qa.today(), qa.v('team-a', qa.today()), qa.p(ARRAY['b1','b2','b3','b4','b5']), qa.coach('c1'))$q$, 'attendance_roster_incomplete');
SELECT qa.save('team-a', qa.today(), qa.v('team-a', qa.today()), qa.p(ARRAY['b1','b2','b3','b4','b5','b6']), qa.coach('c2'));
RESET ROLE;
SELECT qa.check('J8 the confirmation flag is not needed for an athlete on the roster by that date',
  qa.v('team-a', qa.today()) = 4 AND (qa.rec(qa.today(), 'b6')).status = 'present');

-- ═══ K. Athletes removed from the roster ════════════════════════════════
INSERT INTO qa.vals SELECT 'K_b4_today', row(qa.rec(qa.today(), 'b4'))::text;
INSERT INTO qa.vals SELECT 'K_b4_count', (SELECT count(*) FROM public.team_attendance_records WHERE athlete_id = qa.u('b4'))::text;
SET ROLE service_role;
DELETE FROM public.athletes WHERE id = qa.u('b4');
RESET ROLE;
SELECT qa.check('K1 deleting an athlete keeps every one of their records, unlinked, with name and grade',
  (SELECT count(*) FROM public.team_attendance_records WHERE athlete_name_snapshot = 'Dee Diaz' AND athlete_id IS NULL AND class_year_snapshot = 'Senior')::text
    = (SELECT v FROM qa.vals WHERE k = 'K_b4_count')
  AND (SELECT v::integer FROM qa.vals WHERE k = 'K_b4_count') >= 5);
SET ROLE service_role;
SELECT qa.check('K2 the roster read shows the removed athlete separately (not on roster) with their saved status',
  EXISTS (SELECT 1 FROM public.team_attendance_session_roster('team-a', qa.today()) r
          WHERE r.athlete_id IS NULL AND NOT r.on_roster AND r.athlete_name = 'Dee Diaz' AND r.class_year = 'Senior'
            AND r.has_record AND r.status = 'present' AND r.record_id IS NOT NULL));
SELECT qa.check('K3 summaries count the removed record separately, not in present/absent',
  EXISTS (SELECT 1 FROM public.team_attendance_session_summaries('team-a', qa.today(), qa.today()) s
          WHERE s.recorded_count = 6 AND s.removed_count = 1 AND s.present_count + s.absent_count = 5));
SELECT qa.expect_error('K4 submitting a deleted athlete is refused',
  $q$SELECT qa.save('team-a', qa.today(), qa.v('team-a', qa.today()), qa.p(ARRAY['b1','b2','b3','b4','b5','b6']), qa.coach('c1'))$q$, 'attendance_athlete_removed');
INSERT INTO qa.vals SELECT 'K_removed_row', (SELECT row(r.*)::text FROM public.team_attendance_records r
  WHERE r.session_id = qa.sid('team-a', qa.today()) AND r.athlete_id IS NULL);
SELECT qa.save('team-a', qa.today(), qa.v('team-a', qa.today()),
  qa.p(ARRAY['b1','b2','b3','b6']) || qa.absent('b5', 'excused'), qa.coach('c1'));
RESET ROLE;
SELECT qa.check('K5 later saves no longer require the removed athlete and never touch their record',
  qa.v('team-a', qa.today()) = 5
  AND (SELECT row(r.*)::text FROM public.team_attendance_records r WHERE r.session_id = qa.sid('team-a', qa.today()) AND r.athlete_id IS NULL)
      = (SELECT v FROM qa.vals WHERE k = 'K_removed_row'));

-- ═══ L. Identity rows removed later ═════════════════════════════════════
SET ROLE service_role;
SELECT qa.save('team-a', qa.d(-14), 1, qa.p(ARRAY['b1','b2','b3','b5']), qa.coach('c2'));
RESET ROLE;
DELETE FROM public.team_coaches WHERE id = qa.u('c2');
SELECT qa.check('L1 removing an Assistant Coach keeps the attendance and their name; only the link is cleared',
  NOT EXISTS (SELECT 1 FROM public.team_attendance_sessions WHERE updated_by_coach_id = qa.u('c2') OR created_by_coach_id = qa.u('c2'))
  AND EXISTS (SELECT 1 FROM public.team_attendance_sessions WHERE updated_by_name = 'Avi Assist' AND updated_by_coach_id IS NULL)
  AND (qa.rec(qa.today(), 'b6')).updated_by_name = 'Avi Assist');
DELETE FROM public.elf_accounts WHERE id = qa.u('a1');
SELECT qa.check('L2 deleting a coach''s ELF account keeps the attendance; the account link is cleared, the name kept',
  NOT EXISTS (SELECT 1 FROM public.team_attendance_sessions WHERE created_by_account_id = qa.u('a1') OR updated_by_account_id = qa.u('a1'))
  AND EXISTS (SELECT 1 FROM public.team_attendance_sessions WHERE created_by_coach_id = qa.u('c1') AND created_by_account_id IS NULL AND created_by_name = 'Hana Head'));

-- ═══ M. Direct writes are impossible ════════════════════════════════════
SET ROLE service_role;
SELECT qa.expect_error('M1 service_role cannot INSERT a session directly',
  $q$INSERT INTO public.team_attendance_sessions (campaign_slug, session_date, time_zone) VALUES ('team-a', qa.d(-4), 'America/Phoenix')$q$, 'permission denied');
SELECT qa.expect_error('M2 service_role cannot UPDATE a record directly',
  $q$UPDATE public.team_attendance_records SET status = 'present', absence_reason = NULL WHERE athlete_id = qa.u('b5')$q$, 'permission denied');
SELECT qa.expect_error('M3 service_role cannot DELETE a session', $q$DELETE FROM public.team_attendance_sessions$q$, 'permission denied');
SELECT qa.expect_error('M4 service_role cannot TRUNCATE records', $q$TRUNCATE public.team_attendance_records$q$, 'permission denied');
SELECT qa.expect_error('M5 service_role cannot turn the write flag into a direct write (no privilege)',
  $q$DO $d$ BEGIN PERFORM set_config('elf.team_attendance_write', 'on', true); UPDATE public.team_attendance_sessions SET version = version + 1; END $d$$q$, 'permission denied');
RESET ROLE;
INSERT INTO qa.vals SELECT 'M_before', qa.fingerprint();
SET ROLE supa_owner;
SELECT qa.expect_error('M6 even the owner cannot insert a session without the save function',
  $q$INSERT INTO public.team_attendance_sessions (campaign_slug, session_date, time_zone) VALUES ('team-a', qa.d(-4), 'America/Phoenix')$q$, 'team_attendance_write_via_function_only');
SELECT qa.expect_error('M7 ...or change a record',
  $q$UPDATE public.team_attendance_records SET note = 'x' WHERE athlete_id = qa.u('b5')$q$, 'team_attendance_write_via_function_only');
SELECT qa.expect_error('M8 ...or bump a session version',
  $q$UPDATE public.team_attendance_sessions SET version = version + 1 WHERE campaign_slug = 'team-a'$q$, 'team_attendance_write_via_function_only');
SELECT qa.expect_error('M9 ...or unlink a record from an athlete who still exists',
  $q$UPDATE public.team_attendance_records SET athlete_id = NULL WHERE athlete_id = qa.u('b5')$q$, 'team_attendance_write_via_function_only');
SELECT qa.expect_error('M10 ...or delete a record', $q$DELETE FROM public.team_attendance_records WHERE athlete_id = qa.u('b5')$q$, 'team_attendance_records_no_delete');
SELECT qa.expect_error('M11 ...or delete a session', $q$DELETE FROM public.team_attendance_sessions WHERE campaign_slug = 'team-b'$q$, 'team_attendance_sessions_no_delete');
SELECT qa.expect_error('M12 ...or truncate sessions', $q$TRUNCATE public.team_attendance_sessions CASCADE$q$, 'team_attendance_sessions_no_delete');
SELECT qa.expect_error('M13 ...or truncate records', $q$TRUNCATE public.team_attendance_records$q$, 'team_attendance_records_no_delete');
SELECT qa.expect_error('M14 with the flag: a record can''t move to another athlete',
  $q$DO $d$ BEGIN PERFORM set_config('elf.team_attendance_write', 'on', true);
     UPDATE public.team_attendance_records SET athlete_id = qa.u('b1') WHERE athlete_id = qa.u('b5') AND session_date = qa.today(); END $d$$q$, 'team_attendance_records_immutable');
SELECT qa.expect_error('M15 with the flag: a session version can only go up by one',
  $q$DO $d$ BEGIN PERFORM set_config('elf.team_attendance_write', 'on', true);
     UPDATE public.team_attendance_sessions SET version = version + 2 WHERE id = qa.sid('team-a', qa.today()); END $d$$q$, 'team_attendance_sessions_version_step');
SELECT qa.expect_error('M16 with the flag: a session can''t change date or team',
  $q$DO $d$ BEGIN PERFORM set_config('elf.team_attendance_write', 'on', true);
     UPDATE public.team_attendance_sessions SET session_date = qa.d(-4), version = version + 1 WHERE id = qa.sid('team-a', qa.today()); END $d$$q$, 'team_attendance_sessions_immutable');
SELECT qa.expect_error('M17 with the flag: a record must match its session''s team and date',
  $q$DO $d$ BEGIN PERFORM set_config('elf.team_attendance_write', 'on', true);
     INSERT INTO public.team_attendance_records (session_id, campaign_slug, session_date, athlete_name_snapshot, status)
     VALUES (qa.sid('team-a', qa.today()), 'team-b', qa.today(), 'X', 'present'); END $d$$q$, 'team_attendance_records_session_mismatch');
SELECT qa.expect_error('M18 with the flag: a record can''t point at another team''s athlete',
  $q$DO $d$ BEGIN PERFORM set_config('elf.team_attendance_write', 'on', true);
     INSERT INTO public.team_attendance_records (session_id, campaign_slug, session_date, athlete_id, athlete_name_snapshot, status)
     VALUES (qa.sid('team-a', qa.d(-2)), 'team-a', qa.d(-2), qa.u('b9'), 'Bea Bell', 'present'); END $d$$q$, 'team_attendance_records_athlete_mismatch');
SELECT qa.expect_error('M19 with the flag: a new session must start as a version-1 draft',
  $q$DO $d$ BEGIN PERFORM set_config('elf.team_attendance_write', 'on', true);
     INSERT INTO public.team_attendance_sessions (campaign_slug, session_date, time_zone, version) VALUES ('team-a', qa.d(-4), 'America/Phoenix', 3); END $d$$q$, 'team_attendance_sessions_invalid_insert');
SELECT qa.expect_error('M20 constraint: Present can''t carry a reason',
  $q$DO $d$ BEGIN PERFORM set_config('elf.team_attendance_write', 'on', true);
     UPDATE public.team_attendance_records SET status = 'present' WHERE athlete_id = qa.u('b5') AND session_date = qa.today(); END $d$$q$, 'tar_reason_matches_status');
SELECT qa.expect_error('M21 constraint: Present can''t carry a note',
  $q$DO $d$ BEGIN PERFORM set_config('elf.team_attendance_write', 'on', true);
     UPDATE public.team_attendance_records SET note = 'x' WHERE athlete_id = qa.u('b1') AND session_date = qa.today(); END $d$$q$, 'tar_note_absent_only');
SELECT qa.expect_error('M22 constraint: notes are at most 500 characters',
  $q$DO $d$ BEGIN PERFORM set_config('elf.team_attendance_write', 'on', true);
     UPDATE public.team_attendance_records SET note = repeat('y', 501) WHERE athlete_id = qa.u('b5') AND session_date = qa.today(); END $d$$q$, 'tar_note_length');
SELECT qa.expect_error('M23 constraint: notes are stored trimmed',
  $q$DO $d$ BEGIN PERFORM set_config('elf.team_attendance_write', 'on', true);
     UPDATE public.team_attendance_records SET note = ' padded ' WHERE athlete_id = qa.u('b5') AND session_date = qa.today(); END $d$$q$, 'tar_note_length');
SELECT qa.expect_error('M24 constraint: only present/absent',
  $q$DO $d$ BEGIN PERFORM set_config('elf.team_attendance_write', 'on', true);
     UPDATE public.team_attendance_records SET status = 'late', absence_reason = NULL WHERE athlete_id = qa.u('b1') AND session_date = qa.today(); END $d$$q$, 'tar_status_check');
SELECT qa.expect_error('M25 constraint: one record per athlete per session',
  $q$DO $d$ BEGIN PERFORM set_config('elf.team_attendance_write', 'on', true);
     INSERT INTO public.team_attendance_records (session_id, campaign_slug, session_date, athlete_id, athlete_name_snapshot, status)
     VALUES (qa.sid('team-a', qa.today()), 'team-a', qa.today(), qa.u('b1'), 'Ava Adams', 'present'); END $d$$q$, 'tar_one_per_athlete');
SELECT qa.expect_error('M26 constraint: one session per team per date, even through the flag',
  $q$DO $d$ BEGIN PERFORM set_config('elf.team_attendance_write', 'on', true);
     INSERT INTO public.team_attendance_sessions (campaign_slug, session_date, time_zone) VALUES ('team-a', qa.today(), 'America/Phoenix'); END $d$$q$, 'tas_one_per_team_date');
SELECT qa.expect_error('M27 constraint: Phase 5 sessions are drafts only',
  $q$DO $d$ BEGIN PERFORM set_config('elf.team_attendance_write', 'on', true);
     UPDATE public.team_attendance_sessions SET status = 'finalized', version = version + 1 WHERE id = qa.sid('team-a', qa.today()); END $d$$q$, 'team_attendance_sessions_immutable');
RESET ROLE;
SELECT qa.check('M28 none of the direct write attempts changed anything', qa.fingerprint() = (SELECT v FROM qa.vals WHERE k = 'M_before'));

-- ═══ N. Atomicity ═══════════════════════════════════════════════════════
INSERT INTO qa.vals SELECT 'N_before', qa.fingerprint();
SET ROLE service_role;
SELECT qa.expect_error('N1 one bad record at the end fails the whole save',
  $q$SELECT qa.save('team-a', qa.today(), qa.v('team-a', qa.today()), qa.p(ARRAY['b1','b2','b3','b6']) || qa.absent('b5', 'bogus'), qa.coach('c1'))$q$, 'attendance_record_invalid');
SELECT qa.expect_error('N2 a failing first save creates no session',
  $q$SELECT qa.save('team-a', qa.d(-5), 0, qa.p(ARRAY['b1','b2','b3','b6']) || qa.absent('b5', NULL), qa.coach('c1'))$q$, 'attendance_record_invalid');
RESET ROLE;
SELECT qa.check('N3 failed saves left sessions and records exactly as they were', qa.fingerprint() = (SELECT v FROM qa.vals WHERE k = 'N_before')
  AND qa.sid('team-a', qa.d(-5)) IS NULL);
BEGIN;
SET LOCAL ROLE service_role;
SELECT qa.save('team-a', qa.d(-6), 0, qa.p(ARRAY['b1','b2','b3','b5']), qa.coach('c1'));
ROLLBACK;
SELECT qa.check('N4 a save inside a rolled-back transaction leaves nothing', qa.sid('team-a', qa.d(-6)) IS NULL
  AND qa.fingerprint() = (SELECT v FROM qa.vals WHERE k = 'N_before'));
SET ROLE service_role;
SELECT qa.save('team-a', qa.d(-6), 0, qa.p(ARRAY['b1','b2','b3','b5']), qa.coach('c1'));
RESET ROLE;
SET ROLE supa_owner;
SELECT qa.expect_error('N5 the write flag does not leak: a direct write right after a save is still refused',
  $q$UPDATE public.team_attendance_records SET note = 'x' WHERE session_date = qa.d(-6)$q$, 'team_attendance_write_via_function_only');
RESET ROLE;

-- ═══ O. Phase 6 protection: only drafts can be saved ════════════════════
-- Simulates Phase 6 on its own team: widen the status check and finalize
-- one session directly (as Phase 6's own function would).
SET ROLE service_role;
SELECT qa.save('team-c', qa.today(), 0, qa.p(ARRAY['ba']), qa.coach('c6'));
RESET ROLE;
ALTER TABLE public.team_attendance_sessions DROP CONSTRAINT tas_status_check;
ALTER TABLE public.team_attendance_sessions ADD CONSTRAINT tas_status_check CHECK (status IN ('draft', 'finalized'));
ALTER TABLE public.team_attendance_sessions DISABLE TRIGGER team_attendance_sessions_guard;
UPDATE public.team_attendance_sessions SET status = 'finalized' WHERE campaign_slug = 'team-c';
ALTER TABLE public.team_attendance_sessions ENABLE TRIGGER team_attendance_sessions_guard;
INSERT INTO qa.vals SELECT 'O_before', qa.fingerprint();
SET ROLE service_role;
SELECT qa.expect_error('O1 a finalized session cannot be saved with its current version',
  $q$SELECT qa.save('team-c', qa.today(), qa.v('team-c', qa.today()), qa.absent('ba', 'excused'), qa.coach('c6'))$q$, 'attendance_session_not_draft');
SELECT qa.expect_error('O2 ...nor with a stale version (reported as finalized, not as a conflict)',
  $q$SELECT qa.save('team-c', qa.today(), 99, qa.absent('ba', 'excused'), qa.coach('c6'))$q$, 'attendance_session_not_draft');
SELECT qa.expect_error('O3 ...nor recreated as a new draft for the same date',
  $q$SELECT qa.save('team-c', qa.today(), 0, qa.absent('ba', 'excused'), qa.coach('c6'))$q$, 'attendance_version_conflict');
SELECT qa.check('O4 summaries show the finalized session as not editable',
  EXISTS (SELECT 1 FROM public.team_attendance_session_summaries('team-c', qa.today(), qa.today()) s WHERE s.status = 'finalized' AND NOT s.editable));
RESET ROLE;
SET ROLE supa_owner;
SELECT qa.expect_error('O5 even with the write flag, a session''s status can''t be changed outside Phase 6',
  $q$DO $d$ BEGIN PERFORM set_config('elf.team_attendance_write', 'on', true);
     UPDATE public.team_attendance_sessions SET status = 'draft', version = version + 1 WHERE campaign_slug = 'team-c'; END $d$$q$, 'team_attendance_sessions_immutable');
RESET ROLE;
SELECT qa.check('O6 the finalized session and its record are unchanged', qa.fingerprint() = (SELECT v FROM qa.vals WHERE k = 'O_before'));
ALTER TABLE public.team_attendance_sessions DROP CONSTRAINT tas_status_check;
ALTER TABLE public.team_attendance_sessions ADD CONSTRAINT tas_status_check CHECK (status IN ('draft')) NOT VALID;

-- ═══ P. Error messages carry no student data ════════════════════════════
SET ROLE service_role;
DO $$
DECLARE v_msg text;
BEGIN
  BEGIN
    PERFORM qa.save('team-a', qa.today(), qa.v('team-a', qa.today()),
      qa.p(ARRAY['b1','b2','b3','b6']) || qa.absent('b5', 'other', 'Private medical detail'), qa.coach('c3'));
  EXCEPTION WHEN others THEN v_msg := SQLERRM;
  END;
  PERFORM qa.check('P1 a refused save''s error is a fixed code (no names, notes or ids)',
    v_msg = 'attendance_actor_not_authorized', v_msg);
END $$;
RESET ROLE;

-- ═══ Q. Large roster (2,000 athletes) ═══════════════════════════════════
INSERT INTO public.campaign_settings VALUES ('team-large');
INSERT INTO public.team_coaches (id, campaign_slug, name, role) VALUES (qa.u('c8'), 'team-large', 'Lars Large', 'head_coach');
INSERT INTO public.athletes (campaign_slug, name, class_year, created_at)
SELECT 'team-large', 'Athlete ' || lpad(g::text, 4, '0'), (ARRAY['Freshman','Sophomore','Junior','Senior'])[1 + g % 4], '2026-01-01T12:00:00Z'
FROM generate_series(1, 2000) g;
SET ROLE service_role;
DO $$
DECLARE
  v_payload jsonb; v_t0 timestamptz; v_first interval; v_second interval; v_res jsonb;
BEGIN
  SELECT jsonb_agg(CASE WHEN row_number <= 100
                        THEN jsonb_build_object('athlete_id', id, 'status', 'absent', 'absence_reason', 'excused', 'note', 'Note ' || row_number)
                        ELSE jsonb_build_object('athlete_id', id, 'status', 'present') END)
  INTO v_payload
  FROM (SELECT a.id, row_number() OVER (ORDER BY a.name) FROM public.athletes a WHERE a.campaign_slug = 'team-large') x;
  v_t0 := clock_timestamp();
  v_res := public.team_attendance_save_draft('team-large', qa.today(), 0, v_payload, qa.coach('c8'));
  v_first := clock_timestamp() - v_t0;
  -- Second save: everyone Present again (100 changes) on version 1.
  SELECT jsonb_agg(jsonb_build_object('athlete_id', a.id, 'status', 'present')) INTO v_payload
  FROM public.athletes a WHERE a.campaign_slug = 'team-large';
  v_t0 := clock_timestamp();
  v_res := public.team_attendance_save_draft('team-large', qa.today(), 1, v_payload, qa.coach('c8'));
  v_second := clock_timestamp() - v_t0;
  PERFORM qa.check('Q1 2,000-athlete first save and full re-save each finish well under 5 seconds',
    v_first < interval '5 seconds' AND v_second < interval '5 seconds',
    'first ' || v_first || ', second ' || v_second);
  INSERT INTO qa.vals VALUES ('Q_timing', 'first ' || v_first || ', second ' || v_second);
  PERFORM qa.check('Q2 ...and stores exactly one record per athlete, all Present after the re-save',
    v_res @> '{"version": 2, "counts": {"total": 2000, "present": 2000, "absent": 0}}'
    AND (SELECT count(*) FROM public.team_attendance_records WHERE session_id = qa.sid('team-large', qa.today()) AND status = 'present') = 2000,
    v_res::text);
END $$;
SELECT qa.check('Q3 the roster read and summary cover all 2,000 athletes',
  (SELECT count(*) FROM public.team_attendance_session_roster('team-large', qa.today()) WHERE has_record AND on_roster) = 2000
  AND EXISTS (SELECT 1 FROM public.team_attendance_session_summaries('team-large', qa.today(), qa.today()) WHERE recorded_count = 2000 AND present_count = 2000));
RESET ROLE;

-- ═══ R. Athletes with no recorded add date ══════════════════════════════
-- athletes.created_at is nullable; an unknown add date must count as on
-- the roster (required), never as "added after" or optional.
INSERT INTO public.campaign_settings VALUES ('team-n');
INSERT INTO public.team_coaches (id, campaign_slug, name, role) VALUES (qa.u('c9'), 'team-n', 'Nia Null', 'head_coach');
INSERT INTO public.athletes (id, campaign_slug, name, class_year, created_at) VALUES
  (qa.u('e1'), 'team-n', 'Ned Known', 'Senior', '2026-01-01T12:00:00Z'),
  (qa.u('e2'), 'team-n', 'Nora Nodate', 'Junior', NULL);
SET ROLE service_role;
SELECT qa.check('R1 the roster read never returns NULL flags: no add date = on the roster, no decision needed',
  EXISTS (SELECT 1 FROM public.team_attendance_session_roster('team-n', qa.d(-5)) r
          WHERE r.athlete_id = qa.u('e2') AND r.added_after_session_date = false AND r.requires_decision = false));
SELECT qa.expect_error('R2 leaving out an athlete with no add date is refused (required)',
  $q$SELECT qa.save('team-n', qa.d(-5), 0, qa.p(ARRAY['e1']), qa.coach('c9'))$q$, 'attendance_roster_incomplete');
SELECT qa.save('team-n', qa.d(-5), 0, qa.p(ARRAY['e1', 'e2']), qa.coach('c9'));
RESET ROLE;
SELECT qa.check('R3 ...and saving them needs no "added after" confirmation',
  qa.v('team-n', qa.d(-5)) = 1
  AND (SELECT count(*) FROM public.team_attendance_records WHERE session_id = qa.sid('team-n', qa.d(-5))) = 2);

-- ═══ S. Identity swapping (a forwarded/forged actor) ════════════════════
-- The database can't see the session cookie (see the migration header);
-- it does refuse every identity that isn't exactly an authorized coach
-- row of this team or a platform_admins row.
SET ROLE service_role;
SELECT qa.expect_error('S1 a Head Coach''s ELF account id passed as a coach id is refused',
  $q$SELECT qa.save('team-n', qa.d(-4), 0, qa.p(ARRAY['e1','e2']), jsonb_build_object('coach_id', qa.u('a1')))$q$, 'attendance_actor_not_authorized');
SELECT qa.expect_error('S2 a platform admin''s account id passed as a platform admin id is refused',
  $q$SELECT qa.save('team-n', qa.d(-4), 0, qa.p(ARRAY['e1','e2']), jsonb_build_object('platform_admin_id', qa.u('a4')))$q$, 'attendance_actor_not_authorized');
SELECT qa.expect_error('S3 a coach id passed as a platform admin id is refused',
  $q$SELECT qa.save('team-n', qa.d(-4), 0, qa.p(ARRAY['e1','e2']), jsonb_build_object('platform_admin_id', qa.u('c9')))$q$, 'attendance_actor_not_authorized');
SELECT qa.expect_error('S4 a platform admin id passed as a coach id is refused',
  $q$SELECT qa.save('team-n', qa.d(-4), 0, qa.p(ARRAY['e1','e2']), jsonb_build_object('coach_id', qa.u('f1')))$q$, 'attendance_actor_not_authorized');
SELECT qa.expect_error('S5 a client-style actor carrying an account id or role claim is refused outright',
  $q$SELECT qa.save('team-n', qa.d(-4), 0, qa.p(ARRAY['e1','e2']), qa.coach('c9') || '{"account_id": "00000000-0000-0000-0000-0000000000a1", "role": "head_coach"}')$q$, 'attendance_actor_invalid');
SELECT qa.expect_error('S6 an actor given as an array of identities is refused',
  $q$SELECT qa.save('team-n', qa.d(-4), 0, qa.p(ARRAY['e1','e2']), jsonb_build_array(qa.coach('c9')))$q$, 'attendance_actor_invalid');
RESET ROLE;
SELECT qa.check('S7 none of the swapped identities created a session', qa.sid('team-n', qa.d(-4)) IS NULL);
