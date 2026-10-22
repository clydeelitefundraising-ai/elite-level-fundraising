-- Complete Season Phase 2 behavior tests: completed seasons are read-only.
-- Disposable local database only. Run as superuser after baseline + later
-- migrations + Phase 1 fixtures + phase_s1 + phase_s2. Each check writes a
-- row to qa.results.
\set ON_ERROR_STOP on
SET client_min_messages = warning;

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
-- Refused on a completed season.
CREATE FUNCTION qa.ro(p_name text, p_sql text) RETURNS void LANGUAGE sql AS $$
  SELECT qa.expect_error(p_name, p_sql, 'season_completed_read_only') $$;
-- Runs without error (changes kept). p_purpose sets the request header the
-- way PostgREST does (request.headers, transaction-local).
CREATE FUNCTION qa.allowed(p_name text, p_sql text, p_purpose text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    IF p_purpose IS NOT NULL THEN
      PERFORM set_config('request.headers', jsonb_build_object('x-elf-write-purpose', p_purpose, 'accept', '*/*')::text, true);
    END IF;
    EXECUTE p_sql;
    PERFORM set_config('request.headers', '', true);
    PERFORM qa.check(p_name, true);
  EXCEPTION WHEN others THEN
    PERFORM set_config('request.headers', '', true);
    PERFORM qa.check(p_name, false, SQLERRM);
  END;
END $$;
-- Refused even with a purpose header.
CREATE FUNCTION qa.ro_purpose(p_name text, p_sql text, p_purpose text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    PERFORM set_config('request.headers', jsonb_build_object('x-elf-write-purpose', p_purpose)::text, true);
    EXECUTE p_sql;
    PERFORM set_config('request.headers', '', true);
    PERFORM qa.check(p_name, false, 'no error raised');
  EXCEPTION WHEN others THEN
    PERFORM set_config('request.headers', '', true);
    PERFORM qa.check(p_name, position('season_completed_read_only' in SQLERRM) > 0, SQLERRM);
  END;
END $$;
CREATE FUNCTION qa.put(p_k text, p_v text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO qa.vals VALUES (p_k, p_v) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v $$;
CREATE FUNCTION qa.get(p_k text) RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT v::jsonb FROM qa.vals WHERE k = p_k $$;
CREATE FUNCTION qa.u(p text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT md5(p)::uuid $$;
CREATE FUNCTION qa.coach(p text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$ SELECT jsonb_build_object('coach_id', qa.u(p)) $$;
CREATE FUNCTION qa.admin(p text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$ SELECT jsonb_build_object('platform_admin_id', qa.u(p)) $$;
CREATE FUNCTION qa.go(p_slug text, p_actor jsonb, p_key text, p_phrase text) RETURNS jsonb
LANGUAGE sql AS $$ SELECT public.team_season_complete(p_slug, p_actor, NULL, NULL,
  public.team_season_fingerprint(p_slug), qa.u(p_key), p_phrase) $$;
CREATE FUNCTION qa.na(p_code text) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT id FROM public.athletes WHERE previous_season_athlete_id = qa.u(p_code) $$;
CREATE FUNCTION qa.nc(p_acct text, p_slug text) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT id FROM public.team_coaches WHERE account_id = qa.u(p_acct) AND campaign_slug = p_slug $$;
CREATE FUNCTION qa.today(p_slug text) RETURNS date LANGUAGE sql STABLE AS $$ SELECT public.team_attendance_today(p_slug) $$;
-- Present for every athlete of a team (attendance save payload). The
-- confirm flag acknowledges athletes added after the date (a new season's
-- whole roster is "added" on its first day), so a refusal comes from the
-- season guards, not from attendance's own roster rule.
CREATE FUNCTION qa.all_present(p_slug text) RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('athlete_id', id, 'status', 'present', 'confirm_added_after_date', true) ORDER BY id), '[]'::jsonb)
  FROM public.athletes WHERE campaign_slug = p_slug $$;
-- Hash of every row of every public table.
CREATE FUNCTION qa.dbhash() RETURNS text LANGUAGE plpgsql AS $$
DECLARE t text; h text; acc text := '';
BEGIN
  FOR t IN SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' ORDER BY 1 LOOP
    EXECUTE format('SELECT md5(coalesce(string_agg(x::text, %L ORDER BY x::text), %L)) FROM public.%I x', '|', '', t) INTO h;
    acc := acc || t || '=' || h || ';';
  END LOOP;
  RETURN md5(acc);
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA qa TO PUBLIC;

-- ═══ Setup: one row in every protected table, then complete Lions ═════
INSERT INTO public.announcement_comments (id, campaign_slug, announcement_id, author_type, author_member_id, author_name, author_role, body, status)
  VALUES (qa.u('ac1'), 'lions-track-2027', qa.u('an1'), 'member', qa.u('m01'), 'Jo Junior', 'athlete', 'Great!', 'approved'),
         (qa.u('ac2'), 'lions-track-2027', qa.u('an1'), 'member', qa.u('m06'), 'Two Returning', 'parent', 'Thanks', 'approved');
INSERT INTO public.post_likes (id, campaign_slug, announcement_id, author_type, author_member_id)
  VALUES (qa.u('pl1'), 'lions-track-2027', qa.u('an1'), 'member', qa.u('m01')),
         (qa.u('pl2'), 'lions-track-2027', qa.u('an1'), 'member', qa.u('m06'));
INSERT INTO public.team_files (id, campaign_slug, name, storage_path, file_type, uploaded_by, coach_id)
  VALUES (qa.u('tf1'), 'lions-track-2027', 'Handbook.pdf', 'lions/handbook.pdf', 'pdf', 'Hana Head', qa.u('c01'));
INSERT INTO public.fundraising_contacts (id, campaign_slug, athlete_id, email, added_by_type)
  VALUES (qa.u('fc1'), 'lions-track-2027', qa.u('s02'), 'aunt@example.test', 'athlete');
INSERT INTO public.athlete_outreach (id, athlete_id, campaign_slug, status)
  VALUES (qa.u('ao1'), qa.u('s02'), 'lions-track-2027', 'contacted');
INSERT INTO public.campaign_coach_fundraisers (id, campaign_slug, coach_id) VALUES (qa.u('ccf1'), 'lions-track-2027', qa.u('c01'));
INSERT INTO public.team_staff_invitations (id, campaign_slug, email, normalized_email, full_name, role, token_hash, expires_at, revoked_at)
  VALUES (qa.u('si1'), 'lions-track-2027', 'x@example.test', 'x@example.test', 'X', 'booster', 'hash-si1', now() + interval '3 days', now());
INSERT INTO public.parent_access_requests (id, campaign_slug, account_id, parent_name, athlete_id, status)
  VALUES (qa.u('par1'), 'lions-track-2027', qa.u('a05'), 'Declined Parent', qa.u('s03'), 'declined');
INSERT INTO public.pending_athlete_requests (id, campaign_slug, account_id, full_name, class_year, status)
  VALUES (qa.u('pat1'), 'lions-track-2027', qa.u('a10'), 'Declined Kid', 'Freshman', 'declined');
INSERT INTO public.messages (id, thread_id, sender_type, sender_member_id, body, sender_name, sender_role)
  VALUES (qa.u('msg-m01'), qa.u('th1'), 'member', qa.u('m01'), 'Member message', 'Jo Junior', 'athlete'),
         (qa.u('msg-m06'), qa.u('th2'), 'member', qa.u('m06'), 'Parent message', 'Two Returning', 'parent');
INSERT INTO public.message_attachments (id, thread_id, message_id, status, uploader_actor_type, uploader_member_id, storage_path,
                                        original_filename, mime_type, byte_size, attachment_kind)
  VALUES (qa.u('att1'), qa.u('th1'), qa.u('msg-m01'), 'attached', 'member', qa.u('m01'), 'th1/a.png', 'a.png', 'image/png', 10, 'image'),
         (qa.u('att2'), qa.u('th1'), qa.u('msg-m01'), 'attached', 'member', qa.u('m01'), 'th1/b.png', 'b.png', 'image/png', 10, 'image');
INSERT INTO public.message_thread_athletes (id, thread_id, athlete_id) VALUES (qa.u('mta1'), qa.u('th1'), qa.u('s02'));
-- An uploaded-but-unsent attachment, so the real send function can be tried after completion.
INSERT INTO public.message_attachments (id, thread_id, status, uploader_actor_type, uploader_coach_id, storage_path,
                                        original_filename, mime_type, byte_size, attachment_kind)
  VALUES (qa.u('att-pending'), qa.u('th1'), 'pending', 'coach', qa.u('c01'), 'th1/p.png', 'p.png', 'image/png', 10, 'image');
INSERT INTO public.team_product_variants (id, product_id, name) VALUES (qa.u('pv1'), qa.u('g01'), 'Large');
INSERT INTO public.athletes (id, campaign_slug, name, class_year) VALUES (qa.u('s-other'), 'other-team-2027', 'Otis Other', 'Junior');

SELECT qa.check('S0 before completion, ordinary writes to Lions work (guards are invisible to active teams)', true);
SELECT qa.put('lions_go', qa.go('lions-track-2027', qa.coach('c01'), 'k-lions', 'COMPLETE 2027 SEASON')::text);
SELECT qa.check('S1 the season transition itself succeeds with every guard in place',
  qa.get('lions_go') ->> 'to_slug' = 'lions-track-2028' AND (qa.get('lions_go') -> 'summary' ->> 'athletes_carried')::int = 8,
  qa.get('lions_go') ->> 'summary');
SELECT qa.put('hash_after_completion', to_jsonb(qa.dbhash())::text);

-- ═══ A. Objects ═══════════════════════════════════════════════════════
SELECT qa.check('A1 the guard is attached (BEFORE INSERT/UPDATE/DELETE, per row) to all 34 protected tables',
  (SELECT count(*) FROM pg_trigger t WHERE t.tgname = 'season_write_guard' AND NOT t.tgisinternal
     AND (t.tgtype & 1) = 1 AND (t.tgtype & 2) = 2 AND (t.tgtype & 4) = 4 AND (t.tgtype & 8) = 8 AND (t.tgtype & 16) = 16) = 34);
SELECT qa.check('A2 not attached to tables that must keep working (donations, read state, blocks, reports, push, notifications, audit, inquiries)',
  NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'season_write_guard' AND tgrelid::regclass::text IN
    ('donations', 'message_reads', 'notification_reads', 'notification_coach_reads', 'user_blocks', 'content_reports', 'push_subscriptions',
     'notifications', 'audit_logs', 'fundraising_inquiries', 'team_orders', 'account_team_order', 'team_season_transitions')));
SELECT qa.check('A3 guard functions run as the owner with an empty search_path; no helper is executable by any API role',
  (SELECT bool_and(prosecdef) FROM pg_proc WHERE proname IN ('season_write_guard', 'team_attendance_season_start_guard'))
  AND (SELECT bool_and(array_to_string(proconfig, ',') LIKE '%search_path=""%') FROM pg_proc WHERE proname IN
       ('season_write_guard', 'team_attendance_season_start_guard', 'season_is_completed', 'season_write_purpose',
        'season_fk_target_exists', 'season_fk_cleared', 'season_fk_cascaded', 'season_row_slug'))
  AND NOT EXISTS (SELECT 1 FROM pg_proc p, unnest(ARRAY['anon', 'authenticated', 'service_role']) r
    WHERE p.proname IN ('season_write_guard', 'team_attendance_season_start_guard', 'season_is_completed', 'season_write_purpose',
      'season_fk_target_exists', 'season_fk_cleared', 'season_fk_cascaded', 'season_row_slug')
      AND has_function_privilege(r, p.oid, 'EXECUTE')));

-- ═══ P. Every protected mutation is refused on the completed season ══
-- Team record (admin reopen / edits / delete).
SELECT qa.ro('P01 reopen: archived=false refused',            $q$ UPDATE public.campaign_settings SET archived = false WHERE campaign_slug = 'lions-track-2027' $q$);
SELECT qa.ro('P02 reopen: clearing season_completed_at refused', $q$ UPDATE public.campaign_settings SET season_completed_at = NULL, successor_campaign_slug = NULL WHERE campaign_slug = 'lions-track-2027' $q$);
SELECT qa.ro('P03 settings edit refused',                     $q$ UPDATE public.campaign_settings SET school_name = 'X', fundraising_enabled = true WHERE campaign_slug = 'lions-track-2027' $q$);
SELECT qa.ro('P04 hard delete of the season refused',         $q$ DELETE FROM public.campaign_settings WHERE campaign_slug = 'lions-track-2027' $q$);
-- Roster and membership.
SELECT qa.ro('P05 athletes: insert',  $q$ INSERT INTO public.athletes (campaign_slug, name, class_year) VALUES ('lions-track-2027', 'New', 'Junior') $q$);
SELECT qa.ro('P06 athletes: update',  $q$ UPDATE public.athletes SET class_year = 'Senior' WHERE id = qa.u('s03') $q$);
SELECT qa.ro('P07 athletes: delete (graduate records are never deleted)', $q$ DELETE FROM public.athletes WHERE id = qa.u('s01') $q$);
SELECT qa.ro('P08 team_members: insert (join)', $q$ INSERT INTO public.team_members (campaign_slug, role, name, salt, account_id) VALUES ('lions-track-2027', 'parent', 'Late', 'x', qa.u('a13')) $q$);
SELECT qa.ro('P09 team_members: update', $q$ UPDATE public.team_members SET name = 'X' WHERE id = qa.u('m01') $q$);
SELECT qa.ro('P10 team_members: delete', $q$ DELETE FROM public.team_members WHERE id = qa.u('m02') $q$);
SELECT qa.ro('P11 parent links: insert', $q$ INSERT INTO public.team_member_athletes (team_member_id, athlete_id) VALUES (qa.u('m01'), qa.u('s03')) $q$);
SELECT qa.ro('P12 parent links: delete', $q$ DELETE FROM public.team_member_athletes WHERE team_member_id = qa.u('m04') $q$);
SELECT qa.ro('P13 coaches/staff: insert', $q$ INSERT INTO public.team_coaches (campaign_slug, name, email, role, password_hash, salt) VALUES ('lions-track-2027', 'N', 'n@x.test', 'assistant_coach', 'unused', 'x') $q$);
SELECT qa.ro('P14 coaches/staff: role change', $q$ UPDATE public.team_coaches SET role = 'head_coach' WHERE id = qa.u('c02') $q$);
SELECT qa.ro('P15 coaches/staff: remove', $q$ DELETE FROM public.team_coaches WHERE id = qa.u('c03') $q$);
SELECT qa.ro('P16 coach activation (link an account to a legacy coach row)', $q$ UPDATE public.team_coaches SET account_id = qa.u('a13') WHERE id = qa.u('c04') $q$);
-- Requests and invitations: no acceptance into a completed season.
SELECT qa.ro('P17 staff invitation: new',      $q$ INSERT INTO public.team_staff_invitations (campaign_slug, email, normalized_email, full_name, role, token_hash, expires_at) VALUES ('lions-track-2027', 'y@x.test', 'y@x.test', 'Y', 'booster', 'h-y', now() + interval '1 day') $q$);
SELECT qa.ro('P18 staff invitation: accept',   $q$ UPDATE public.team_staff_invitations SET accepted_at = now(), revoked_at = NULL WHERE id = qa.u('si1') $q$);
SELECT qa.ro('P19 parent request: new',        $q$ INSERT INTO public.parent_access_requests (campaign_slug, account_id, parent_name, athlete_id) VALUES ('lions-track-2027', qa.u('a13'), 'P', qa.u('s03')) $q$);
SELECT qa.ro('P20 parent request: approve',    $q$ UPDATE public.parent_access_requests SET status = 'approved' WHERE id = qa.u('par1') $q$);
SELECT qa.ro('P21 athlete request: new',       $q$ INSERT INTO public.pending_athlete_requests (campaign_slug, account_id, full_name, class_year) VALUES ('lions-track-2027', qa.u('a13'), 'K', 'Junior') $q$);
SELECT qa.ro('P22 athlete request: approve',   $q$ UPDATE public.pending_athlete_requests SET status = 'approved' WHERE id = qa.u('pat1') $q$);
SELECT qa.ro('P23 join code: new',             $q$ INSERT INTO public.team_join_codes (campaign_slug, code) VALUES ('lions-track-2027', 'NEWCD7') $q$);
SELECT qa.ro('P24 join code: reactivate',      $q$ UPDATE public.team_join_codes SET revoked = false WHERE campaign_slug = 'lions-track-2027' $q$);
-- Calendar.
SELECT qa.ro('P25 calendar: insert', $q$ INSERT INTO public.calendar_events (campaign_slug, title, event_date) VALUES ('lions-track-2027', 'X', current_date) $q$);
SELECT qa.ro('P26 calendar: update', $q$ UPDATE public.calendar_events SET title = 'X' WHERE id = qa.u('e01') $q$);
SELECT qa.ro('P27 calendar: delete', $q$ DELETE FROM public.calendar_events WHERE id = qa.u('e02') $q$);
SELECT qa.ro('P28 calendar feed: reissue for the old season', $q$ INSERT INTO public.calendar_subscription_tokens (campaign_slug) VALUES ('lions-track-2027') $q$);
SELECT qa.ro('P29 calendar feed: un-revoke', $q$ UPDATE public.calendar_subscription_tokens SET revoked_at = NULL WHERE id = qa.u('ct2') $q$);
-- Messaging (direct and group).
SELECT qa.ro('P30 new thread',          $q$ INSERT INTO public.message_threads (campaign_slug, created_by_type, created_by_coach_id, creator_name, creator_role) VALUES ('lions-track-2027', 'coach', qa.u('c01'), 'H', 'head_coach') $q$);
SELECT qa.ro('P31 rename group',        $q$ UPDATE public.message_threads SET group_name = 'X' WHERE id = qa.u('th1') $q$);
SELECT qa.ro('P32 hiding a thread with archived_at is refused too', $q$ UPDATE public.message_threads SET archived_at = now() WHERE id = qa.u('th1') $q$);
SELECT qa.ro('P33 delete thread',       $q$ DELETE FROM public.message_threads WHERE id = qa.u('th2') $q$);
SELECT qa.ro('P34 send a message (group)', $q$ INSERT INTO public.messages (thread_id, sender_type, sender_coach_id, body, sender_name, sender_role) VALUES (qa.u('th1'), 'coach', qa.u('c01'), 'hi', 'H', 'head_coach') $q$);
SELECT qa.ro('P35 send a message (direct)', $q$ INSERT INTO public.messages (thread_id, sender_type, sender_member_id, body, sender_name, sender_role) VALUES (qa.u('th2'), 'member', qa.u('m06'), 'hi', 'T', 'parent') $q$);
SELECT qa.ro('P36 send through send_message_with_attachments', $q$ SELECT public.send_message_with_attachments(qa.u('th1'), 'coach', qa.u('c01'), NULL, NULL, 'H', 'head_coach', 'hi', ARRAY[qa.u('att-pending')]) $q$);
SELECT qa.ro('P37 edit a message',      $q$ UPDATE public.messages SET body = 'edited' WHERE id = qa.u('msg-m01') $q$);
SELECT qa.ro('P38 delete a message (no purpose)', $q$ DELETE FROM public.messages WHERE id = qa.u('msg-m01') $q$);
SELECT qa.ro('P39 add a participant',   $q$ INSERT INTO public.message_thread_participants (thread_id, actor_type, member_id) VALUES (qa.u('th1'), 'member', qa.u('m06')) $q$);
SELECT qa.ro('P40 remove a participant', $q$ UPDATE public.message_thread_participants SET removed_at = now() WHERE thread_id = qa.u('th1') AND member_id = qa.u('m01') $q$);
SELECT qa.ro('P41 group roster: add',   $q$ INSERT INTO public.message_thread_athletes (thread_id, athlete_id) VALUES (qa.u('th1'), qa.u('s03')) $q$);
SELECT qa.ro('P42 group roster: remove', $q$ UPDATE public.message_thread_athletes SET removed_at = now() WHERE id = qa.u('mta1') $q$);
SELECT qa.ro('P43 new attachment (pending upload)', $q$ INSERT INTO public.message_attachments (thread_id, status, uploader_actor_type, uploader_coach_id, storage_path, original_filename, mime_type, byte_size, attachment_kind) VALUES (qa.u('th1'), 'pending', 'coach', qa.u('c01'), 'p', 'p.png', 'image/png', 1, 'image') $q$);
SELECT qa.ro('P44 remove attachment (no purpose)', $q$ UPDATE public.message_attachments SET removed_at = now() WHERE id = qa.u('att1') $q$);
-- Announcements.
SELECT qa.ro('P45 announcement: post',  $q$ INSERT INTO public.announcements (campaign_slug, title, author_name, author_role) VALUES ('lions-track-2027', 'X', 'H', 'head_coach') $q$);
SELECT qa.ro('P46 announcement: edit',  $q$ UPDATE public.announcements SET title = 'X' WHERE id = qa.u('an1') $q$);
SELECT qa.ro('P47 announcement: delete', $q$ DELETE FROM public.announcements WHERE id = qa.u('an1') $q$);
SELECT qa.ro('P48 comment: post',       $q$ INSERT INTO public.announcement_comments (campaign_slug, announcement_id, author_type, author_member_id, author_name, author_role, body) VALUES ('lions-track-2027', qa.u('an1'), 'member', qa.u('m01'), 'J', 'athlete', 'x') $q$);
SELECT qa.ro('P49 comment: approve/edit', $q$ UPDATE public.announcement_comments SET status = 'declined' WHERE id = qa.u('ac1') $q$);
SELECT qa.ro('P50 comment: delete (no purpose)', $q$ DELETE FROM public.announcement_comments WHERE id = qa.u('ac1') $q$);
SELECT qa.ro('P51 like',                $q$ INSERT INTO public.post_likes (campaign_slug, announcement_id, author_type, author_member_id) VALUES ('lions-track-2027', qa.u('an1'), 'member', qa.u('m08')) $q$);
SELECT qa.ro('P52 unlike (no purpose)', $q$ DELETE FROM public.post_likes WHERE id = qa.u('pl1') $q$);
-- To-Do.
SELECT qa.ro('P53 To-Do: new task',     $q$ INSERT INTO public.team_tasks (campaign_slug, title, audience) VALUES ('lions-track-2027', 'X', 'both') $q$);
SELECT qa.ro('P54 To-Do: edit task',    $q$ UPDATE public.team_tasks SET title = 'X' WHERE id = qa.u('tk1') $q$);
SELECT qa.ro('P55 To-Do: archive task', $q$ UPDATE public.team_tasks SET status = 'archived', archived_at = now() WHERE id = qa.u('tk1') $q$);
SELECT qa.ro('P56 To-Do: task resource', $q$ INSERT INTO public.team_task_resources (task_id, campaign_slug, kind, url) VALUES (qa.u('tk1'), 'lions-track-2027', 'link', 'https://x.test') $q$);
SELECT qa.ro('P57 To-Do: acknowledgment', $q$ INSERT INTO public.team_task_acknowledgments (campaign_slug, task_id, task_revision, requirement, athlete_id, member_id, account_id, full_name, statement_version, statement_text) VALUES ('lions-track-2027', qa.u('tk1'), 1, 'athlete', qa.u('s02'), qa.u('m01'), qa.u('a04'), 'J', 1, 'x') $q$);
-- Sponsors, Team Shop, files, resources, fund uses.
SELECT qa.ro('P58 sponsor: add',    $q$ INSERT INTO public.sponsors (campaign_slug, name, url, tier) VALUES ('lions-track-2027', 'N', 'https://n.test', 'gold') $q$);
SELECT qa.ro('P59 sponsor: edit',   $q$ UPDATE public.sponsors SET name = 'X' WHERE id = qa.u('sp1') $q$);
SELECT qa.ro('P60 sponsor: remove', $q$ DELETE FROM public.sponsors WHERE id = qa.u('sp2') $q$);
SELECT qa.ro('P61 shop: add product',  $q$ INSERT INTO public.team_products (campaign_slug, name, price_cents) VALUES ('lions-track-2027', 'N', 100) $q$);
SELECT qa.ro('P62 shop: edit price',   $q$ UPDATE public.team_products SET price_cents = 1 WHERE id = qa.u('g01') $q$);
SELECT qa.ro('P63 shop: remove product', $q$ DELETE FROM public.team_products WHERE id = qa.u('g02') $q$);
SELECT qa.ro('P64 shop: variant',      $q$ INSERT INTO public.team_product_variants (product_id, name) VALUES (qa.u('g01'), 'Small') $q$);
SELECT qa.ro('P65 shop: remove variant', $q$ DELETE FROM public.team_product_variants WHERE id = qa.u('pv1') $q$);
SELECT qa.ro('P66 files: upload',      $q$ INSERT INTO public.team_files (campaign_slug, name, storage_path, file_type, uploaded_by, coach_id) VALUES ('lions-track-2027', 'n', 'n', 'pdf', 'H', qa.u('c01')) $q$);
SELECT qa.ro('P67 files: rename',      $q$ UPDATE public.team_files SET name = 'X' WHERE id = qa.u('tf1') $q$);
SELECT qa.ro('P68 files: delete',      $q$ DELETE FROM public.team_files WHERE id = qa.u('tf1') $q$);
SELECT qa.ro('P69 clearance resource: add', $q$ INSERT INTO public.clearance_resources (campaign_slug, title, url) VALUES ('lions-track-2027', 'X', 'https://x.test') $q$);
SELECT qa.ro('P70 clearance resource: edit', $q$ UPDATE public.clearance_resources SET title = 'X' WHERE id = qa.u('cr1') $q$);
SELECT qa.ro('P71 fund use: add',      $q$ INSERT INTO public.fund_uses (campaign_slug, title, description) VALUES ('lions-track-2027', 'X', 'X') $q$);
SELECT qa.ro('P72 fund use: edit',     $q$ UPDATE public.fund_uses SET title = 'X' WHERE id = qa.u('f01') $q$);
-- Fundraising records other than donations.
SELECT qa.ro('P73 fundraising contact: add',  $q$ INSERT INTO public.fundraising_contacts (campaign_slug, athlete_id, email, added_by_type) VALUES ('lions-track-2027', qa.u('s02'), 'u@x.test', 'athlete') $q$);
SELECT qa.ro('P74 fundraising contact: edit', $q$ UPDATE public.fundraising_contacts SET notes = 'x' WHERE id = qa.u('fc1') $q$);
SELECT qa.ro('P75 contact goal: edit',        $q$ UPDATE public.fundraising_contact_goals SET goal = 99 WHERE id = qa.u('cg1') $q$);
SELECT qa.ro('P76 outreach: log',             $q$ INSERT INTO public.athlete_outreach (athlete_id, campaign_slug, status) VALUES (qa.u('s02'), 'lions-track-2027', 'resolved') $q$);
SELECT qa.ro('P77 coach fundraiser: toggle',  $q$ UPDATE public.campaign_coach_fundraisers SET active = false WHERE id = qa.u('ccf1') $q$);
SELECT qa.check('P78 none of the refused writes changed anything', qa.dbhash() = qa.get('hash_after_completion') #>> '{}');

-- ═══ T. Attendance ════════════════════════════════════════════════════
SELECT qa.expect_error('T1 attendance save on the completed season is refused (existing session)',
  $q$ SELECT public.team_attendance_save_draft('lions-track-2027', qa.today('lions-track-2027'), 1, qa.all_present('lions-track-2027'), qa.coach('c01')) $q$,
  'season_completed_read_only');
SELECT qa.expect_error('T2 attendance save on the completed season is refused (new date)',
  $q$ SELECT public.team_attendance_save_draft('lions-track-2027', qa.today('lions-track-2027') - 1, 0, qa.all_present('lions-track-2027'), qa.coach('c01')) $q$,
  'season_completed_read_only');
SELECT qa.put('t3', public.team_attendance_save_draft('lions-track-2028', qa.today('lions-track-2028'), 0, qa.all_present('lions-track-2028'),
  jsonb_build_object('coach_id', qa.nc('a01', 'lions-track-2028')))::text);
SELECT qa.check('T3 the transition date is allowed in the new season too (both seasons hold a session that day)',
  (qa.get('t3') ->> 'version')::int = 1
  AND (SELECT count(*) FROM public.team_attendance_sessions WHERE session_date = qa.today('lions-track-2027')
       AND campaign_slug IN ('lions-track-2027', 'lions-track-2028')) = 2,
  qa.get('t3')::text);
SELECT qa.expect_error('T4 the new season cannot take attendance for a date before it started',
  $q$ SELECT public.team_attendance_save_draft('lions-track-2028', qa.today('lions-track-2028') - 1, 0, qa.all_present('lions-track-2028'), jsonb_build_object('coach_id', qa.nc('a01', 'lions-track-2028'))) $q$,
  'attendance_before_season_start');
-- Boundary in the team's time zone: a season that started at 23:30
-- Phoenix time three days ago starts on that local date.
UPDATE public.campaign_settings SET season_started_at = ((qa.today('other-team-2027') - 3)::timestamp + time '23:30') AT TIME ZONE 'America/Phoenix'
  WHERE campaign_slug = 'other-team-2027';
SELECT qa.expect_error('T5 boundary: the day before the season''s local start date is refused',
  $q$ SELECT public.team_attendance_save_draft('other-team-2027', qa.today('other-team-2027') - 4, 0, qa.all_present('other-team-2027'), qa.coach('c15')) $q$,
  'attendance_before_season_start');
SELECT qa.check('T6 boundary: the start date itself (late that evening, local time) and later days are allowed',
  (public.team_attendance_save_draft('other-team-2027', qa.today('other-team-2027') - 3, 0, qa.all_present('other-team-2027'), qa.coach('c15')) ->> 'version')::int = 1
  AND (public.team_attendance_save_draft('other-team-2027', qa.today('other-team-2027'), 0, qa.all_present('other-team-2027'), qa.coach('c15')) ->> 'version')::int = 1);
UPDATE public.campaign_settings SET season_started_at = NULL WHERE campaign_slug = 'other-team-2027';
SELECT qa.check('T7 teams that never transitioned (season_started_at NULL) have no start limit',
  (public.team_attendance_save_draft('other-team-2027', qa.today('other-team-2027') - 10, 0, qa.all_present('other-team-2027'), qa.coach('c15')) ->> 'version')::int = 1);
SELECT qa.check('T8 the completed season''s attendance history is intact',
  (SELECT count(*) FROM public.team_attendance_records WHERE campaign_slug = 'lions-track-2027') = 10
  AND (SELECT version FROM public.team_attendance_sessions WHERE campaign_slug = 'lions-track-2027') = 1);

-- ═══ Q. What stays allowed on a completed season ══════════════════════
SELECT qa.put('hash_before_q', to_jsonb(qa.dbhash())::text);
SELECT qa.allowed('Q1 a late Stripe webhook donation records against the completed season',
  $q$ INSERT INTO public.donations (donor_name, amount, amount_cents, campaign_slug, athlete_id, stripe_session_id) VALUES ('Late', 5, 500, 'lions-track-2027', qa.u('s02'), 'cs_late_q1') $q$);
SELECT qa.expect_error('Q2 ...and a replayed webhook is still de-duplicated by the Stripe session id',
  $q$ INSERT INTO public.donations (donor_name, amount, amount_cents, campaign_slug, stripe_session_id) VALUES ('Late', 5, 500, 'lions-track-2027', 'cs_late_q1') $q$,
  'donations_stripe_session_id_key');
SELECT qa.allowed('Q3 marking a historical message read', $q$ INSERT INTO public.message_reads (message_id, actor_type, member_id) VALUES (qa.u('msg-m01'), 'member', qa.u('m06')) $q$);
SELECT qa.allowed('Q4 blocking someone (safety)', $q$ INSERT INTO public.user_blocks (campaign_slug, blocker_kind, blocker_id, blocked_kind, blocked_id) VALUES ('lions-track-2027', 'member', qa.u('m06'), 'member', qa.u('m01')) $q$);
SELECT qa.allowed('Q5 reporting historical content (safety)', $q$ INSERT INTO public.content_reports (campaign_slug, target_type, target_id, reporter_kind, reporter_id, reporter_name, reason) VALUES ('lions-track-2027', 'message', qa.u('msg-m01'), 'member', qa.u('m06'), 'Two Returning', 'harassment') $q$);
SELECT qa.allowed('Q6 a platform admin following up a fundraising inquiry', $q$ UPDATE public.fundraising_inquiries SET status = 'resolved' WHERE campaign_slug = 'lions-track-2027' $q$);
SELECT qa.allowed('Q7 web push registration', $q$ INSERT INTO public.push_subscriptions (campaign_slug, platform, endpoint, member_id) VALUES ('lions-track-2027', 'web', 'https://push.example.test/q7', qa.u('m02')) $q$);
SELECT qa.check('Q8 history is readable: messages, threads (not hidden), announcements, attendance, donations',
  (SELECT count(*) FROM public.messages m JOIN public.message_threads t ON t.id = m.thread_id WHERE t.campaign_slug = 'lions-track-2027') = 4
  AND (SELECT count(*) FROM public.message_threads WHERE campaign_slug = 'lions-track-2027' AND archived_at IS NULL) = 2
  AND (SELECT count(*) FROM public.announcements WHERE campaign_slug = 'lions-track-2027') = 1
  AND (SELECT count(*) FROM public.donations WHERE campaign_slug = 'lions-track-2027') = 3);

-- ═══ R. Removal purposes (account deletion, moderation) ═══════════════
SELECT qa.allowed('R1 moderation: blank a historical message', $q$ UPDATE public.messages SET body = '', deleted_at = now() WHERE id = qa.u('msg-m06') $q$, 'moderation');
SELECT qa.allowed('R2 moderation: mark an attachment removed', $q$ UPDATE public.message_attachments SET removed_at = now() WHERE id = qa.u('att2') $q$, 'moderation');
SELECT qa.allowed('R3 moderation: delete a comment', $q$ DELETE FROM public.announcement_comments WHERE id = qa.u('ac2') $q$, 'moderation');
SELECT qa.ro_purpose('R4 moderation cannot edit other columns', $q$ UPDATE public.messages SET sender_name = 'X' WHERE id = qa.u('msg-m01') $q$, 'moderation');
SELECT qa.ro_purpose('R5 moderation cannot post', $q$ INSERT INTO public.messages (thread_id, sender_type, sender_coach_id, body, sender_name, sender_role) VALUES (qa.u('th1'), 'coach', qa.u('c01'), 'x', 'H', 'head_coach') $q$, 'moderation');
SELECT qa.ro_purpose('R6 moderation cannot touch the roster', $q$ DELETE FROM public.athletes WHERE id = qa.u('s01') $q$, 'moderation');
SELECT qa.allowed('R7 account deletion: delete the person''s like, message and attachment', $q$
  DELETE FROM public.post_likes WHERE id = qa.u('pl2');
$q$, 'account_deletion');
SELECT qa.allowed('R7b account deletion: delete a message (its attachment cascades)', $q$ DELETE FROM public.messages WHERE id = qa.u('msg-m01') $q$, 'account_deletion');
SELECT qa.allowed('R8 account deletion: clear an athlete''s photo', $q$ UPDATE public.athletes SET profile_photo = NULL WHERE id = qa.u('s02') $q$, 'account_deletion');
SELECT qa.ro_purpose('R9 account deletion cannot rename an athlete', $q$ UPDATE public.athletes SET name = 'X' WHERE id = qa.u('s02') $q$, 'account_deletion');
SELECT qa.ro_purpose('R10 an unknown purpose is ignored', $q$ DELETE FROM public.post_likes WHERE id = qa.u('pl1') $q$, 'admin_override');
DO $$
BEGIN
  BEGIN
    PERFORM set_config('request.headers', 'not json', true);
    DELETE FROM public.post_likes WHERE id = qa.u('pl1');
    PERFORM qa.check('R11 a malformed request.headers is treated as no purpose', false, 'no error');
  EXCEPTION WHEN others THEN
    PERFORM qa.check('R11 a malformed request.headers is treated as no purpose', position('season_completed_read_only' in SQLERRM) > 0, SQLERRM);
  END;
END $$;
SELECT qa.check('R12 the removals did exactly that and nothing else',
  (SELECT body = '' AND deleted_at IS NOT NULL FROM public.messages WHERE id = qa.u('msg-m06'))
  AND NOT EXISTS (SELECT 1 FROM public.messages WHERE id = qa.u('msg-m01'))
  AND NOT EXISTS (SELECT 1 FROM public.message_attachments WHERE message_id = qa.u('msg-m01'))
  AND NOT EXISTS (SELECT 1 FROM public.post_likes WHERE id = qa.u('pl2'))
  AND EXISTS (SELECT 1 FROM public.post_likes WHERE id = qa.u('pl1'))
  AND (SELECT profile_photo IS NULL AND name = 'Jo Junior' FROM public.athletes WHERE id = qa.u('s02')));

-- ═══ S. Foreign-key actions after a real deletion elsewhere ════════════
-- Deleting an ELF account whose member row is on the completed season:
-- its account link is cleared and its requests cascade away; nothing else.
DELETE FROM public.elf_accounts WHERE id = qa.u('a05');
SELECT qa.check('S2 account deletion reaches the completed season: account link cleared, its request removed, history kept',
  (SELECT account_id IS NULL AND name = 'Sam Senior' FROM public.team_members WHERE id = qa.u('m02'))
  AND NOT EXISTS (SELECT 1 FROM public.parent_access_requests WHERE id = qa.u('par1'))
  AND EXISTS (SELECT 1 FROM public.athletes WHERE id = qa.u('s01')));
SELECT qa.ro('S3 clearing an account link while the account still exists is refused',
  $q$ UPDATE public.team_members SET account_id = NULL WHERE id = qa.u('m01') $q$);
SELECT qa.ro('S4 deleting a request while its account still exists is refused',
  $q$ DELETE FROM public.pending_athlete_requests WHERE id = qa.u('pat1') $q$);

-- ═══ W. Active teams behave exactly as before ═════════════════════════
SELECT qa.allowed('W1 new season: roster, membership, calendar, messaging, announcements, sponsors, shop, files, To-Do all writable', $q$
  INSERT INTO public.athletes (id, campaign_slug, name, class_year) VALUES (qa.u('w-ath'), 'lions-track-2028', 'New Freshman', 'Freshman');
  INSERT INTO public.team_members (campaign_slug, role, name, salt, account_id, athlete_id) VALUES ('lions-track-2028', 'athlete', 'New Freshman', 'x', qa.u('a13'), qa.u('w-ath'));
  INSERT INTO public.calendar_events (campaign_slug, title, event_date) VALUES ('lions-track-2028', 'Kickoff', current_date + 3);
  INSERT INTO public.message_threads (id, campaign_slug, created_by_type, created_by_coach_id, creator_name, creator_role) VALUES (qa.u('w-th'), 'lions-track-2028', 'coach', qa.nc('a01', 'lions-track-2028'), 'H', 'head_coach');
  INSERT INTO public.messages (thread_id, sender_type, sender_coach_id, body, sender_name, sender_role) VALUES (qa.u('w-th'), 'coach', qa.nc('a01', 'lions-track-2028'), 'Welcome', 'H', 'head_coach');
  INSERT INTO public.announcements (campaign_slug, title, author_name, author_role) VALUES ('lions-track-2028', 'Welcome back', 'H', 'head_coach');
  INSERT INTO public.sponsors (campaign_slug, name, url, tier) VALUES ('lions-track-2028', 'New Sponsor', 'https://n.test', 'gold');
  INSERT INTO public.team_products (campaign_slug, name, price_cents) VALUES ('lions-track-2028', 'Shirt', 1500);
  INSERT INTO public.team_files (campaign_slug, name, storage_path, file_type, uploaded_by, coach_id) VALUES ('lions-track-2028', 'n', 'n', 'pdf', 'H', qa.nc('a01', 'lions-track-2028'));
  INSERT INTO public.team_tasks (campaign_slug, title, audience) VALUES ('lions-track-2028', 'Physicals', 'both');
  UPDATE public.athletes SET event = 'Hurdles' WHERE id = qa.u('w-ath');
  DELETE FROM public.calendar_events WHERE campaign_slug = 'lions-track-2028' AND title = 'Kickoff';
  UPDATE public.campaign_settings SET description = 'New season' WHERE campaign_slug = 'lions-track-2028';
$q$);
SELECT qa.allowed('W2 other active teams are unaffected', $q$
  INSERT INTO public.athletes (campaign_slug, name, class_year) VALUES ('taken-2027', 'Any', 'Junior');
  UPDATE public.campaign_settings SET archived = true WHERE campaign_slug = 'archived-team-2027';
  UPDATE public.campaign_settings SET archived = false WHERE campaign_slug = 'archived-team-2027';
  DELETE FROM public.athletes WHERE campaign_slug = 'taken-2027' AND name = 'Any';
$q$);
SELECT qa.allowed('W3 rows that belong to no team (unknown slug) behave as before', $q$
  INSERT INTO public.athletes (campaign_slug, name) VALUES ('no-such-team', 'Orphan'); DELETE FROM public.athletes WHERE campaign_slug = 'no-such-team';
$q$);
-- As the API role the app uses (service_role): active writes work; completed
-- writes are refused by the season guard, not by a permission error.
DO $$
BEGIN
  BEGIN
    SET LOCAL ROLE service_role;
    INSERT INTO public.athletes (campaign_slug, name, class_year) VALUES ('lions-track-2028', 'Via API', 'Junior');
    RESET ROLE;
    PERFORM qa.check('W4 service_role: an active team''s write succeeds through the guard', true);
  EXCEPTION WHEN others THEN
    PERFORM qa.check('W4 service_role: an active team''s write succeeds through the guard', false, SQLERRM);
  END;
  BEGIN
    SET LOCAL ROLE service_role;
    INSERT INTO public.athletes (campaign_slug, name, class_year) VALUES ('lions-track-2027', 'Via API', 'Junior');
    RESET ROLE;
    PERFORM qa.check('W5 service_role: a completed season''s write is refused by the season guard', false, 'no error');
  EXCEPTION WHEN others THEN
    PERFORM qa.check('W5 service_role: a completed season''s write is refused by the season guard', position('season_completed_read_only' in SQLERRM) > 0, SQLERRM);
  END;
END $$;
SELECT qa.check('W6 new-season membership is independent of the old season (new member on 2028, none added to 2027)',
  (SELECT count(*) FROM public.team_members WHERE account_id = qa.u('a13') AND campaign_slug = 'lions-track-2028') = 1
  AND (SELECT count(*) FROM public.team_members WHERE account_id = qa.u('a13') AND campaign_slug = 'lions-track-2027') = 0);

-- ═══ C. The completed season can complete no further / reopen no way ══
SELECT qa.expect_error('C1 completing the completed season again is refused', $q$ SELECT qa.go('lions-track-2027', qa.coach('c01'), 'k-again', 'COMPLETE 2027 SEASON') $q$, 'season_already_completed');
SELECT qa.check('C2 the completed season is still completed and archived',
  (SELECT archived AND season_completed_at IS NOT NULL AND successor_campaign_slug = 'lions-track-2028' FROM public.campaign_settings WHERE campaign_slug = 'lions-track-2027'));
