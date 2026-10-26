-- Complete Season — Phase 2: completed seasons are read-only.
--
-- Once a season is completed (campaign_settings.season_completed_at or
-- successor_campaign_slug set by team_season_complete()), every
-- team-scoped table below refuses INSERT, UPDATE and DELETE for that
-- team. History stays exactly as it was and stays readable.
--
-- ── How it is enforced ─────────────────────────────────────────────────
-- One BEFORE ROW trigger function, season_write_guard(), attached to each
-- protected table. It finds the row's team (directly from campaign_slug,
-- or through a parent row for child tables) and reads that team's
-- completion state WITH A KEY-SHARE LOCK on the campaign_settings row.
-- team_season_complete() holds that row FOR UPDATE for its whole
-- transaction, so a write that races a completion waits for it, then sees
-- the season completed and is refused. Nothing can slip in.
-- (KEY SHARE is the same lock every foreign-key check already takes; it
-- does not conflict with ordinary settings edits, only with the
-- completion's FOR UPDATE.)
--
-- ── What is still allowed on a completed season ────────────────────────
--   1. The transition itself (transaction-local flag elf.season_transition
--      = 'on', set only inside team_season_complete()).
--   2. PostgreSQL's own foreign-key actions after a referenced row was
--      really deleted elsewhere: a column cleared by ON DELETE SET NULL,
--      or a row removed by ON DELETE CASCADE (e.g. an ELF account being
--      deleted clears team_members.account_id and removes that account's
--      pending requests). Detected from the catalog, per foreign key.
--   3. Personal-data removal and moderation, when the app server marks
--      the request with the header x-elf-write-purpose: account_deletion
--      or moderation (read from PostgREST's request.headers). Only
--      removal-shaped changes are accepted: deleting a message, attachment,
--      like or comment, blanking a message (body/deleted_at), marking an
--      attachment removed, clearing an athlete photo. Only the server holds
--      the service-role key; anon/authenticated have no table access.
-- Deliberately NOT guarded (not season content, or must keep working):
--   donations (late Stripe webhooks), message_reads and notification
--   read/dismiss state, user_blocks and content_reports (safety),
--   push_subscriptions, notifications, audit_logs, automation_*,
--   fundraising_inquiries (platform-admin follow-up), team_orders /
--   team_order_items (legacy Stripe shop records), sponsor_relationships
--   (legacy admin CRM), account_team_order.
--
-- ── Attendance ─────────────────────────────────────────────────────────
-- Both attendance tables get the guard (only team_attendance_save_draft()
-- writes them, so a completed season's save is refused). A new trigger
-- also refuses a session dated before the team's season_started_at (in
-- the session's own time zone); the transition date itself is allowed, so
-- each season can hold a session for that day.
--
-- Errors are fixed codes: season_completed_read_only,
-- attendance_before_season_start.
--
-- ADDITIVE. Requires phase_s1_complete_season.sql. No data is written.

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.team_season_complete(text,jsonb,text,text,text,uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'phase_s2 requires phase_s1_complete_season.sql to be applied first';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Helpers
-- ═══════════════════════════════════════════════════════════════════════

-- Is this team's season completed? Takes a KEY SHARE lock on the team row
-- so a concurrent completion (FOR UPDATE) is waited for, never raced.
-- Unknown slug -> false (nothing to protect).
CREATE OR REPLACE FUNCTION public.season_is_completed(p_slug text)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
DECLARE
  v boolean;
BEGIN
  IF p_slug IS NULL THEN
    RETURN false;
  END IF;
  SELECT (c.season_completed_at IS NOT NULL OR c.successor_campaign_slug IS NOT NULL) INTO v
  FROM public.campaign_settings c WHERE c.campaign_slug = p_slug
  FOR KEY SHARE;
  RETURN coalesce(v, false);
END;
$$;

-- The server-declared purpose of this request (x-elf-write-purpose), or
-- NULL. PostgREST exposes request headers as the JSON setting
-- request.headers (header names lowercased).
CREATE OR REPLACE FUNCTION public.season_write_purpose()
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
  RETURN nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-elf-write-purpose';
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

-- Does the row referenced by single-column foreign key p_conoid, from
-- value p_value, still exist?
CREATE OR REPLACE FUNCTION public.season_fk_target_exists(p_conoid oid, p_value text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_table regclass;
  v_col   text;
  v_type  text;
  v       boolean;
BEGIN
  SELECT c.confrelid::regclass, a.attname, format_type(a.atttypid, a.atttypmod)
  INTO v_table, v_col, v_type
  FROM pg_catalog.pg_constraint c
  JOIN pg_catalog.pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = c.confkey[1]
  WHERE c.oid = p_conoid;
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s WHERE %I = $1::%s)', v_table, v_col, v_type) INTO v USING p_value;
  RETURN v;
END;
$$;

-- UPDATE: every changed column is a single-column ON DELETE SET NULL
-- foreign key that became NULL because its referenced row is gone.
CREATE OR REPLACE FUNCTION public.season_fk_cleared(p_rel oid, p_old jsonb, p_changed text[], p_new jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  k text;
  v_con oid;
BEGIN
  IF p_changed IS NULL OR cardinality(p_changed) = 0 THEN
    RETURN false;
  END IF;
  FOREACH k IN ARRAY p_changed LOOP
    IF p_new -> k <> 'null'::jsonb OR p_old -> k = 'null'::jsonb THEN
      RETURN false;
    END IF;
    SELECT c.oid INTO v_con
    FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.conrelid = p_rel AND c.contype = 'f' AND c.confdeltype = 'n'
      AND cardinality(c.conkey) = 1 AND a.attname = k
    LIMIT 1;
    IF v_con IS NULL OR public.season_fk_target_exists(v_con, p_old ->> k) THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

-- DELETE: the row is being removed by an ON DELETE CASCADE foreign key
-- whose referenced row is gone.
CREATE OR REPLACE FUNCTION public.season_fk_cascaded(p_rel oid, p_old jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.oid, a.attname
    FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.conrelid = p_rel AND c.contype = 'f' AND c.confdeltype = 'c' AND cardinality(c.conkey) = 1
  LOOP
    IF p_old ->> r.attname IS NOT NULL AND NOT public.season_fk_target_exists(r.oid, p_old ->> r.attname) THEN
      RETURN true;
    END IF;
  END LOOP;
  RETURN false;
END;
$$;

-- The team (campaign_slug) a row belongs to.
--   'slug'                      the row's own campaign_slug
--   'parent:<table>:<column>'   campaign_slug of public.<table> whose id
--                               is the row's <column>
CREATE OR REPLACE FUNCTION public.season_row_slug(p_resolver text, p_row jsonb)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  parts text[];
  v text;
BEGIN
  IF p_row IS NULL THEN
    RETURN NULL;
  END IF;
  IF p_resolver = 'slug' THEN
    RETURN p_row ->> 'campaign_slug';
  END IF;
  parts := string_to_array(p_resolver, ':');
  IF parts[1] <> 'parent' OR cardinality(parts) <> 3 OR p_row ->> parts[3] IS NULL THEN
    RETURN NULL;
  END IF;
  EXECUTE format('SELECT campaign_slug FROM public.%I WHERE id = $1::uuid', parts[2]) INTO v USING p_row ->> parts[3];
  RETURN v;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. The guard
-- ═══════════════════════════════════════════════════════════════════════

-- SECURITY DEFINER (owner rights, empty search_path): it must lock the
-- team row and call the helpers above whoever is writing; the helpers
-- themselves are not executable by any API role.
--
-- Trigger arguments:
--   0  how to find the team (see season_row_slug)
--   1  comma-separated columns a removal (account_deletion / moderation)
--      may change on UPDATE, or ''
--   2  'delete' when a removal may DELETE the row, else ''
CREATE OR REPLACE FUNCTION public.season_write_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old      jsonb;
  v_new      jsonb;
  v_changed  text[];
  v_purpose  text;
  v_done     boolean := false;
BEGIN
  IF current_setting('elf.season_transition', true) = 'on' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW); END IF;

  IF TG_TABLE_NAME = 'campaign_settings' THEN
    -- The team row itself: completed means completed before this change.
    v_done := TG_OP <> 'INSERT'
      AND (v_old ->> 'season_completed_at' IS NOT NULL OR v_old ->> 'successor_campaign_slug' IS NOT NULL);
  ELSE
    v_done := public.season_is_completed(public.season_row_slug(TG_ARGV[0], v_old))
           OR public.season_is_completed(public.season_row_slug(TG_ARGV[0], v_new));
  END IF;
  IF NOT v_done THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  v_purpose := public.season_write_purpose();

  IF TG_OP = 'UPDATE' THEN
    SELECT coalesce(array_agg(k), '{}') INTO v_changed
    FROM jsonb_object_keys(v_new) k WHERE v_new -> k IS DISTINCT FROM v_old -> k;
    IF cardinality(v_changed) = 0 THEN
      RETURN NEW;
    END IF;
    IF public.season_fk_cleared(TG_RELID, v_old, v_changed, v_new) THEN
      RETURN NEW;
    END IF;
    IF v_purpose IN ('account_deletion', 'moderation') AND coalesce(TG_ARGV[1], '') <> ''
       AND v_changed <@ string_to_array(TG_ARGV[1], ',') THEN
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF public.season_fk_cascaded(TG_RELID, v_old) THEN
      RETURN OLD;
    END IF;
    IF v_purpose IN ('account_deletion', 'moderation') AND coalesce(TG_ARGV[2], '') = 'delete' THEN
      RETURN OLD;
    END IF;
  END IF;

  RAISE EXCEPTION 'season_completed_read_only';
END;
$$;

-- Attach the guard. (table, resolver, removal columns, removal delete)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('campaign_settings',          'slug', '',               ''),
    ('athletes',                   'slug', 'profile_photo',  ''),
    ('team_members',               'slug', '',               ''),
    ('team_member_athletes',       'parent:team_members:team_member_id', '', ''),
    ('team_coaches',               'slug', '',               ''),
    ('calendar_events',            'slug', '',               ''),
    ('calendar_subscription_tokens','slug', '',              ''),
    ('message_threads',            'slug', '',               ''),
    ('messages',                   'parent:message_threads:thread_id', 'body,deleted_at', 'delete'),
    ('message_thread_participants','parent:message_threads:thread_id', '', ''),
    ('message_thread_athletes',    'parent:message_threads:thread_id', '', ''),
    ('message_attachments',        'parent:message_threads:thread_id', 'removed_at', 'delete'),
    ('announcements',              'slug', '',               ''),
    ('announcement_comments',      'slug', '',               'delete'),
    ('post_likes',                 'slug', '',               'delete'),
    ('team_attendance_sessions',   'slug', '',               ''),
    ('team_attendance_records',    'slug', '',               ''),
    ('team_tasks',                 'slug', '',               ''),
    ('team_task_resources',        'slug', '',               ''),
    ('team_task_acknowledgments',  'slug', '',               ''),
    ('sponsors',                   'slug', '',               ''),
    ('team_products',              'slug', '',               ''),
    ('team_product_variants',      'parent:team_products:product_id', '', ''),
    ('team_files',                 'slug', '',               ''),
    ('clearance_resources',        'slug', '',               ''),
    ('fund_uses',                  'slug', '',               ''),
    ('fundraising_contacts',       'slug', '',               ''),
    ('fundraising_contact_goals',  'slug', '',               ''),
    ('athlete_outreach',           'slug', '',               ''),
    ('campaign_coach_fundraisers', 'slug', '',               ''),
    ('team_join_codes',            'slug', '',               ''),
    ('team_staff_invitations',     'slug', '',               ''),
    ('parent_access_requests',     'slug', '',               ''),
    ('pending_athlete_requests',   'slug', '',               '')
  ) t(tbl, resolver, removal_cols, removal_delete)
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS season_write_guard ON public.%I', r.tbl);
    EXECUTE format(
      'CREATE TRIGGER season_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.season_write_guard(%L, %L, %L)',
      r.tbl, r.resolver, r.removal_cols, r.removal_delete);
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. Attendance: no session before the season started
-- ═══════════════════════════════════════════════════════════════════════

-- season_started_at is set only on a successor team (NULL = no limit). The
-- season's first day is its start instant's date in the session's own
-- time zone, so the transition date is allowed in both seasons.
CREATE OR REPLACE FUNCTION public.team_attendance_season_start_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_start timestamptz;
BEGIN
  SELECT c.season_started_at INTO v_start FROM public.campaign_settings c WHERE c.campaign_slug = NEW.campaign_slug;
  IF v_start IS NOT NULL AND NEW.session_date < public.team_attendance_local_date(v_start, NEW.time_zone) THEN
    RAISE EXCEPTION 'attendance_before_season_start';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS team_attendance_season_start_guard ON public.team_attendance_sessions;
CREATE TRIGGER team_attendance_season_start_guard
  BEFORE INSERT ON public.team_attendance_sessions
  FOR EACH ROW EXECUTE FUNCTION public.team_attendance_season_start_guard();

-- ═══════════════════════════════════════════════════════════════════════
-- 4. Privileges: none of these are callable through the API
-- ═══════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.season_is_completed(text)', 'public.season_write_purpose()',
    'public.season_fk_target_exists(oid,text)', 'public.season_fk_cleared(oid,jsonb,text[],jsonb)',
    'public.season_fk_cascaded(oid,jsonb)', 'public.season_row_slug(text,jsonb)',
    'public.season_write_guard()', 'public.team_attendance_season_start_guard()']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', f);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', f);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM service_role', f);
  END LOOP;
END $$;

COMMIT;
