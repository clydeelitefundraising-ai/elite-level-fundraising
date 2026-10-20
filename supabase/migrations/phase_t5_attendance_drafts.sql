-- Team Management Phase 5: attendance drafts — database foundation.
--
--   team_attendance_sessions          one session per team per local date
--   team_attendance_records           one row per athlete in a saved session
--   team_attendance_time_zone()       the team's IANA time zone (see below)
--   team_attendance_local_date()      an instant -> a calendar date in a zone
--   team_attendance_date_editable()   today and the previous 14 days
--   team_attendance_today()           the team's current local date
--   team_attendance_save_draft()      the ONLY way to create or change attendance
--   team_attendance_session_summaries() sessions in a date range, with counts
--   team_attendance_session_roster()  one session's athletes, for the editor
--
-- ADDITIVE ONLY. Creates two new tables and new functions. Does not alter,
-- drop, or write any existing table (athletes, team_coaches,
-- platform_admins, elf_accounts, campaign_settings ...). The new tables'
-- foreign keys reference existing tables; PostgreSQL implements those with
-- internal triggers on the referenced tables, which is the only catalog
-- change outside this migration's own objects. Wrapped in one transaction:
-- any error rolls the whole migration back. Safe to rerun.
--
-- ── Time zone ──────────────────────────────────────────────────────────
-- A session's date is a LOCAL calendar date in the team's time zone. No
-- team time-zone setting exists yet, so team_attendance_time_zone() returns
-- 'America/Phoenix' for every team. It is the ONLY place the zone is
-- decided: when a per-team IANA setting is added, only that function
-- changes (read the setting, fall back to America/Phoenix). Each session
-- stores the zone it was created in (time_zone), and its edit window is
-- always judged in that stored zone, so changing a team's zone later never
-- moves an existing session to a different day. Calendar code
-- (calendarShared.ts) is unaffected.
--
-- ── Rules enforced here (not only in the app) ──────────────────────────
--   * one session per team per date (UNIQUE), always created as a draft
--   * dates: today and the previous 14 days in the team's zone; never the
--     future. Older sessions stay readable but cannot be saved.
--   * only a Head Coach or Assistant Coach of THIS team, or a platform
--     admin, can save. The app server passes the resolved identity (a
--     team_coaches id or a platform_admins id); the database re-checks it.
--     Boosters, members, other teams' coaches are refused.
--     Trust boundary: like every ELF table, these are reachable only with
--     the service-role key, held by the app server. The database cannot
--     see the request's cookies (they are verified with secrets it does
--     not hold), so it cannot prove WHO is calling — only that the
--     identity it was given is an authorized one. The server must build
--     p_actor solely from its verified session (src/lib/
--     teamAttendanceActor.ts), never from anything the client sends.
--   * the submitted roster must match the team's roster exactly:
--     no duplicates, no other team's athletes, no deleted athletes, and no
--     required athlete left out (see "Roster changes")
--   * Present has no reason and no note; Absent needs a reason (Excused,
--     Unexcused, Other); notes are optional, at most 500 characters
--   * optimistic concurrency: every save names the version it started
--     from (0 = "create"); anything else is refused, never merged
--   * only draft sessions can be saved (Phase 6 adds finalization)
--   * every save is one transaction: all of it is written, or none of it
--
-- ── Roster changes ─────────────────────────────────────────────────────
-- A save must include every REQUIRED athlete: everyone on the team's
-- roster who was added on or before the session date (in the session's
-- zone), plus anyone who already has a record in that session. Athletes
-- added to the roster AFTER the session date are not required and are
-- never recorded silently: including one needs an explicit
-- "confirm_added_after_date": true from the coach.
-- team_attendance_session_roster() flags them (requires_decision) so the
-- editor can ask. An athlete with no recorded add date (athletes.created_at
-- is nullable) is treated as on the roster: required, never "added after".
-- Athletes deleted from the roster keep their records
-- (athlete_id becomes NULL; the name and grade snapshots stay); they are
-- no longer required and saves never touch those records again.
--
-- ── Write protection ───────────────────────────────────────────────────
-- Nobody but the table owner has INSERT/UPDATE/DELETE/TRUNCATE on either
-- table. team_attendance_save_draft() is SECURITY DEFINER (runs as the
-- owner, search_path = '') and is the only writer. In addition, triggers
-- refuse every write — even the owner's — unless the transaction-local
-- flag elf.team_attendance_write = 'on' is set (only the save function
-- sets it, and resets it before returning); rows can never be deleted or
-- truncated. The single exception is PostgreSQL clearing a foreign key
-- (ON DELETE SET NULL) after the referenced athlete, coach, account or
-- platform admin row was deleted; the guard checks that row is really gone.
--
-- ── Privacy ────────────────────────────────────────────────────────────
-- Absence notes can be sensitive. Errors raised here are fixed codes —
-- never names, notes or ids — so nothing about a student reaches server
-- logs through an error message.
--
-- ── Privileges ─────────────────────────────────────────────────────────
-- RLS enabled, no policies. Supabase's default privileges grant ALL on new
-- tables and EXECUTE on new functions to anon/authenticated/service_role;
-- this migration revokes all of it and grants back only: service_role
-- SELECT on both tables, and EXECUTE on the callable functions.
-- anon/authenticated get nothing.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Time-zone and date helpers
-- ═══════════════════════════════════════════════════════════════════════

-- The team's IANA time zone. Single point of change for future per-team
-- zones (see header). STABLE so it may read a setting later.
CREATE OR REPLACE FUNCTION public.team_attendance_time_zone(p_campaign_slug text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT 'America/Phoenix'::text;
$$;

-- The calendar date of an instant in a time zone. America/Phoenix has no
-- daylight saving time (UTC-7 all year); other zones are handled by
-- PostgreSQL's time-zone database.
CREATE OR REPLACE FUNCTION public.team_attendance_local_date(p_instant timestamptz, p_time_zone text)
RETURNS date
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT (p_instant AT TIME ZONE p_time_zone)::date;
$$;

-- Today and the previous 14 calendar days; never the future.
CREATE OR REPLACE FUNCTION public.team_attendance_date_editable(p_session_date date, p_today date)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT coalesce(p_session_date <= p_today AND p_session_date >= p_today - 14, false);
$$;

-- The team's current local date (so the app and the database agree on
-- "today").
CREATE OR REPLACE FUNCTION public.team_attendance_today(p_campaign_slug text)
RETURNS date
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT public.team_attendance_local_date(now(), public.team_attendance_time_zone(p_campaign_slug));
$$;

-- A JSON value -> uuid, or NULL unless it is a well-formed uuid string.
-- Internal to the save function.
CREATE OR REPLACE FUNCTION public.team_attendance_try_uuid(p_value jsonb)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
BEGIN
  IF jsonb_typeof(p_value) IS DISTINCT FROM 'string' THEN
    RETURN NULL;
  END IF;
  IF (p_value #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN NULL;
  END IF;
  RETURN (p_value #>> '{}')::uuid;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. team_attendance_sessions
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.team_attendance_sessions (
  id                            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_slug                 text        NOT NULL,
  -- Local calendar date in time_zone.
  session_date                  date        NOT NULL,
  -- The zone the session was created in; its edit window is judged here.
  time_zone                     text        NOT NULL,
  status                        text        NOT NULL DEFAULT 'draft',
  -- Optimistic concurrency: +1 on every save.
  version                       integer     NOT NULL DEFAULT 1,
  -- Who created / last saved. The identities the app has (an ELF account,
  -- possibly NULL for a legacy team-login coach; the team_coaches row; or
  -- a platform admin) plus a display-name snapshot, so history survives
  -- those rows being removed.
  created_by_account_id         uuid        REFERENCES public.elf_accounts(id)    ON DELETE SET NULL,
  created_by_coach_id           uuid        REFERENCES public.team_coaches(id)    ON DELETE SET NULL,
  created_by_platform_admin_id  uuid        REFERENCES public.platform_admins(id) ON DELETE SET NULL,
  created_by_name               text,
  updated_by_account_id         uuid        REFERENCES public.elf_accounts(id)    ON DELETE SET NULL,
  updated_by_coach_id           uuid        REFERENCES public.team_coaches(id)    ON DELETE SET NULL,
  updated_by_platform_admin_id  uuid        REFERENCES public.platform_admins(id) ON DELETE SET NULL,
  updated_by_name               text,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),

  -- One session per team per local date.
  CONSTRAINT tas_one_per_team_date UNIQUE (campaign_slug, session_date),
  -- Phase 5 is draft-only; Phase 6 widens this when it adds finalization.
  CONSTRAINT tas_status_check      CHECK (status IN ('draft')),
  CONSTRAINT tas_version_positive  CHECK (version >= 1),
  CONSTRAINT tas_time_zone_present CHECK (char_length(time_zone) BETWEEN 1 AND 64)
);
-- The UNIQUE index (campaign_slug, session_date) also serves "this team's
-- sessions between two dates".

ALTER TABLE public.team_attendance_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.team_attendance_sessions FROM PUBLIC;
REVOKE ALL ON TABLE public.team_attendance_sessions FROM anon;
REVOKE ALL ON TABLE public.team_attendance_sessions FROM authenticated;
REVOKE ALL ON TABLE public.team_attendance_sessions FROM service_role;
GRANT SELECT ON TABLE public.team_attendance_sessions TO service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. team_attendance_records
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.team_attendance_records (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Sessions are never deleted (guard below); RESTRICT keeps it that way.
  session_id             uuid        NOT NULL REFERENCES public.team_attendance_sessions(id) ON DELETE RESTRICT,
  -- Denormalized from the session (the guard checks they match) so
  -- reports can filter by team and date without a join.
  campaign_slug          text        NOT NULL,
  session_date           date        NOT NULL,
  -- Live link. Set to NULL (never deleted) if the athlete is deleted from
  -- the roster; the snapshots below keep the record readable.
  athlete_id             uuid        REFERENCES public.athletes(id) ON DELETE SET NULL,
  -- Read from athletes by the database at save time, never from the caller.
  athlete_name_snapshot  text        NOT NULL,
  class_year_snapshot    text,
  status                 text        NOT NULL,
  absence_reason         text,
  note                   text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  -- When/by whom status, reason or note last changed.
  updated_at             timestamptz NOT NULL DEFAULT now(),
  updated_by_name        text,

  CONSTRAINT tar_status_check   CHECK (status IN ('present', 'absent')),
  CONSTRAINT tar_reason_check   CHECK (absence_reason IS NULL OR absence_reason IN ('excused', 'unexcused', 'other')),
  -- Absent needs a reason; Present can't keep one.
  CONSTRAINT tar_reason_matches_status CHECK ((status = 'absent') = (absence_reason IS NOT NULL)),
  -- Present can't keep a note.
  CONSTRAINT tar_note_absent_only CHECK (status = 'absent' OR note IS NULL),
  CONSTRAINT tar_note_length CHECK (
    note IS NULL OR (char_length(note) BETWEEN 1 AND 500 AND note = btrim(note, E' \t\r\n'))
  )
);

-- One record per athlete per session.
CREATE UNIQUE INDEX IF NOT EXISTS tar_one_per_athlete
  ON public.team_attendance_records (session_id, athlete_id)
  WHERE athlete_id IS NOT NULL;
-- A session's records, including deleted athletes' (athlete_id NULL).
CREATE INDEX IF NOT EXISTS tar_session
  ON public.team_attendance_records (session_id);
-- One athlete's history over time; also serves ON DELETE SET NULL.
CREATE INDEX IF NOT EXISTS tar_athlete_date
  ON public.team_attendance_records (athlete_id, session_date)
  WHERE athlete_id IS NOT NULL;
-- A team's records over a date range (reports).
CREATE INDEX IF NOT EXISTS tar_campaign_date
  ON public.team_attendance_records (campaign_slug, session_date);

ALTER TABLE public.team_attendance_records ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.team_attendance_records FROM PUBLIC;
REVOKE ALL ON TABLE public.team_attendance_records FROM anon;
REVOKE ALL ON TABLE public.team_attendance_records FROM authenticated;
REVOKE ALL ON TABLE public.team_attendance_records FROM service_role;
GRANT SELECT ON TABLE public.team_attendance_records TO service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. Write guards
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.team_attendance_sessions_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'team_attendance_sessions_no_delete';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF current_setting('elf.team_attendance_write', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'team_attendance_write_via_function_only';
    END IF;
    IF NEW.status <> 'draft' OR NEW.version <> 1 THEN
      RAISE EXCEPTION 'team_attendance_sessions_invalid_insert';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE by the save function: the session's identity never changes,
  -- the version goes up by exactly one, the status never changes here.
  IF current_setting('elf.team_attendance_write', true) IS NOT DISTINCT FROM 'on' THEN
    IF (NEW.id, NEW.campaign_slug, NEW.session_date, NEW.time_zone, NEW.status, NEW.created_at,
        NEW.created_by_account_id, NEW.created_by_coach_id, NEW.created_by_platform_admin_id, NEW.created_by_name)
       IS DISTINCT FROM
       (OLD.id, OLD.campaign_slug, OLD.session_date, OLD.time_zone, OLD.status, OLD.created_at,
        OLD.created_by_account_id, OLD.created_by_coach_id, OLD.created_by_platform_admin_id, OLD.created_by_name)
    THEN
      RAISE EXCEPTION 'team_attendance_sessions_immutable';
    END IF;
    IF NEW.version <> OLD.version + 1 THEN
      RAISE EXCEPTION 'team_attendance_sessions_version_step';
    END IF;
    RETURN NEW;
  END IF;

  -- Any other UPDATE: only a foreign key being cleared because the row it
  -- pointed at was deleted (ON DELETE SET NULL).
  IF (NEW.id, NEW.campaign_slug, NEW.session_date, NEW.time_zone, NEW.status, NEW.version,
      NEW.created_by_name, NEW.updated_by_name, NEW.created_at, NEW.updated_at)
     IS DISTINCT FROM
     (OLD.id, OLD.campaign_slug, OLD.session_date, OLD.time_zone, OLD.status, OLD.version,
      OLD.created_by_name, OLD.updated_by_name, OLD.created_at, OLD.updated_at)
  THEN
    RAISE EXCEPTION 'team_attendance_write_via_function_only';
  END IF;
  IF (NEW.created_by_account_id IS DISTINCT FROM OLD.created_by_account_id AND (
        NEW.created_by_account_id IS NOT NULL
        OR EXISTS (SELECT 1 FROM public.elf_accounts a WHERE a.id = OLD.created_by_account_id)))
  OR (NEW.updated_by_account_id IS DISTINCT FROM OLD.updated_by_account_id AND (
        NEW.updated_by_account_id IS NOT NULL
        OR EXISTS (SELECT 1 FROM public.elf_accounts a WHERE a.id = OLD.updated_by_account_id)))
  OR (NEW.created_by_coach_id IS DISTINCT FROM OLD.created_by_coach_id AND (
        NEW.created_by_coach_id IS NOT NULL
        OR EXISTS (SELECT 1 FROM public.team_coaches c WHERE c.id = OLD.created_by_coach_id)))
  OR (NEW.updated_by_coach_id IS DISTINCT FROM OLD.updated_by_coach_id AND (
        NEW.updated_by_coach_id IS NOT NULL
        OR EXISTS (SELECT 1 FROM public.team_coaches c WHERE c.id = OLD.updated_by_coach_id)))
  OR (NEW.created_by_platform_admin_id IS DISTINCT FROM OLD.created_by_platform_admin_id AND (
        NEW.created_by_platform_admin_id IS NOT NULL
        OR EXISTS (SELECT 1 FROM public.platform_admins p WHERE p.id = OLD.created_by_platform_admin_id)))
  OR (NEW.updated_by_platform_admin_id IS DISTINCT FROM OLD.updated_by_platform_admin_id AND (
        NEW.updated_by_platform_admin_id IS NOT NULL
        OR EXISTS (SELECT 1 FROM public.platform_admins p WHERE p.id = OLD.updated_by_platform_admin_id)))
  THEN
    RAISE EXCEPTION 'team_attendance_write_via_function_only';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS team_attendance_sessions_guard ON public.team_attendance_sessions;
CREATE TRIGGER team_attendance_sessions_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.team_attendance_sessions
  FOR EACH ROW EXECUTE FUNCTION public.team_attendance_sessions_guard();

DROP TRIGGER IF EXISTS team_attendance_sessions_no_truncate ON public.team_attendance_sessions;
CREATE TRIGGER team_attendance_sessions_no_truncate
  BEFORE TRUNCATE ON public.team_attendance_sessions
  FOR EACH STATEMENT EXECUTE FUNCTION public.team_attendance_sessions_guard();

CREATE OR REPLACE FUNCTION public.team_attendance_records_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'team_attendance_records_no_delete';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF current_setting('elf.team_attendance_write', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'team_attendance_write_via_function_only';
    END IF;
    -- Same team and date as its session; the athlete (if any) is on that team.
    IF NOT EXISTS (
      SELECT 1 FROM public.team_attendance_sessions s
      WHERE s.id = NEW.session_id
        AND s.campaign_slug = NEW.campaign_slug
        AND s.session_date = NEW.session_date
    ) THEN
      RAISE EXCEPTION 'team_attendance_records_session_mismatch';
    END IF;
    IF NEW.athlete_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.athletes a
      WHERE a.id = NEW.athlete_id AND a.campaign_slug = NEW.campaign_slug
    ) THEN
      RAISE EXCEPTION 'team_attendance_records_athlete_mismatch';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE by the save function: which session/athlete a record belongs
  -- to never changes.
  IF current_setting('elf.team_attendance_write', true) IS NOT DISTINCT FROM 'on' THEN
    IF (NEW.id, NEW.session_id, NEW.campaign_slug, NEW.session_date, NEW.athlete_id, NEW.created_at)
       IS DISTINCT FROM
       (OLD.id, OLD.session_id, OLD.campaign_slug, OLD.session_date, OLD.athlete_id, OLD.created_at)
    THEN
      RAISE EXCEPTION 'team_attendance_records_immutable';
    END IF;
    RETURN NEW;
  END IF;

  -- Any other UPDATE: only athlete_id being cleared because the athlete
  -- was deleted from the roster (ON DELETE SET NULL).
  IF (NEW.id, NEW.session_id, NEW.campaign_slug, NEW.session_date, NEW.athlete_name_snapshot,
      NEW.class_year_snapshot, NEW.status, NEW.absence_reason, NEW.note, NEW.created_at,
      NEW.updated_at, NEW.updated_by_name)
     IS DISTINCT FROM
     (OLD.id, OLD.session_id, OLD.campaign_slug, OLD.session_date, OLD.athlete_name_snapshot,
      OLD.class_year_snapshot, OLD.status, OLD.absence_reason, OLD.note, OLD.created_at,
      OLD.updated_at, OLD.updated_by_name)
  THEN
    RAISE EXCEPTION 'team_attendance_write_via_function_only';
  END IF;
  IF NEW.athlete_id IS DISTINCT FROM OLD.athlete_id AND (
       NEW.athlete_id IS NOT NULL
       OR EXISTS (SELECT 1 FROM public.athletes a WHERE a.id = OLD.athlete_id)
  ) THEN
    RAISE EXCEPTION 'team_attendance_write_via_function_only';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS team_attendance_records_guard ON public.team_attendance_records;
CREATE TRIGGER team_attendance_records_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.team_attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.team_attendance_records_guard();

DROP TRIGGER IF EXISTS team_attendance_records_no_truncate ON public.team_attendance_records;
CREATE TRIGGER team_attendance_records_no_truncate
  BEFORE TRUNCATE ON public.team_attendance_records
  FOR EACH STATEMENT EXECUTE FUNCTION public.team_attendance_records_guard();

-- ═══════════════════════════════════════════════════════════════════════
-- 5. team_attendance_save_draft()
-- ═══════════════════════════════════════════════════════════════════════
--
-- p_expected_version  0 to create the session; otherwise the version the
--                     coach loaded. Anything else -> attendance_version_conflict.
-- p_records           JSON array, one object per athlete:
--                       { "athlete_id": uuid,
--                         "status": "present" | "absent",
--                         "absence_reason": null | "excused" | "unexcused" | "other",
--                         "note": null | text (trimmed; empty -> null; <= 500),
--                         "confirm_added_after_date": true   (only for an athlete
--                           added to the roster after the session date) }
-- p_actor             { "coach_id": uuid } or { "platform_admin_id": uuid } —
--                     resolved by the app server from the signed session.
--
-- Returns { session_id, session_date, version, saved_at, created,
--           counts: { total, present, absent, excused, unexcused, other } }
-- where counts describe the athletes saved by this call (no names).
--
-- Errors (fixed codes; no data in messages):
--   attendance_team_not_found, attendance_actor_invalid,
--   attendance_actor_not_authorized, attendance_date_invalid,
--   attendance_date_in_future, attendance_date_not_editable,
--   attendance_version_invalid, attendance_version_conflict,
--   attendance_session_not_found, attendance_session_not_draft,
--   attendance_records_invalid, attendance_records_too_many,
--   attendance_record_invalid, attendance_athlete_duplicate,
--   attendance_athlete_cross_team, attendance_athlete_removed,
--   attendance_roster_incomplete, attendance_late_athlete_unconfirmed,
--   attendance_roster_empty
CREATE OR REPLACE FUNCTION public.team_attendance_save_draft(
  p_campaign_slug     text,
  p_session_date      date,
  p_expected_version  integer,
  p_records           jsonb,
  p_actor             jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_coach_id    uuid;
  v_admin_id    uuid;
  v_account_id  uuid;
  v_name        text;
  v_zone        text;
  v_session     public.team_attendance_sessions%ROWTYPE;
  v_created     boolean := false;
  v_counts      jsonb;
  -- The submitted records, parsed once (a plain value, not a temp table:
  -- a SECURITY DEFINER function must not reuse a table the caller could
  -- have created first).
  v_sub         jsonb;
BEGIN
  -- ── Team ─────────────────────────────────────────────────────────────
  IF p_campaign_slug IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.campaign_settings c WHERE c.campaign_slug = p_campaign_slug
  ) THEN
    RAISE EXCEPTION 'attendance_team_not_found';
  END IF;

  -- ── Who is saving ────────────────────────────────────────────────────
  IF jsonb_typeof(p_actor) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'attendance_actor_invalid';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_actor) k WHERE k NOT IN ('coach_id', 'platform_admin_id')) THEN
    RAISE EXCEPTION 'attendance_actor_invalid';
  END IF;
  v_coach_id := public.team_attendance_try_uuid(p_actor -> 'coach_id');
  v_admin_id := public.team_attendance_try_uuid(p_actor -> 'platform_admin_id');
  IF (p_actor ? 'coach_id' AND v_coach_id IS NULL)
     OR (p_actor ? 'platform_admin_id' AND v_admin_id IS NULL)
     OR (v_coach_id IS NULL) = (v_admin_id IS NULL) THEN
    RAISE EXCEPTION 'attendance_actor_invalid';
  END IF;

  IF v_coach_id IS NOT NULL THEN
    -- A Head Coach or Assistant Coach of THIS team. Boosters (either
    -- table) and other teams' coaches are refused.
    SELECT tc.account_id, tc.name INTO v_account_id, v_name
    FROM public.team_coaches tc
    WHERE tc.id = v_coach_id
      AND tc.campaign_slug = p_campaign_slug
      AND tc.role IN ('head_coach', 'assistant_coach');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'attendance_actor_not_authorized';
    END IF;
  ELSE
    SELECT pa.account_id, a.name INTO v_account_id, v_name
    FROM public.platform_admins pa
    LEFT JOIN public.elf_accounts a ON a.id = pa.account_id
    WHERE pa.id = v_admin_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'attendance_actor_not_authorized';
    END IF;
  END IF;

  -- ── Date and session ─────────────────────────────────────────────────
  IF p_session_date IS NULL THEN
    RAISE EXCEPTION 'attendance_date_invalid';
  END IF;
  IF p_expected_version IS NULL OR p_expected_version < 0 THEN
    RAISE EXCEPTION 'attendance_version_invalid';
  END IF;

  IF p_expected_version > 0 THEN
    SELECT * INTO v_session
    FROM public.team_attendance_sessions s
    WHERE s.campaign_slug = p_campaign_slug AND s.session_date = p_session_date
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'attendance_session_not_found';
    END IF;
    -- Checked before the version, so a finalized session (Phase 6) is
    -- always reported as such, never as an ordinary conflict.
    IF v_session.status <> 'draft' THEN
      RAISE EXCEPTION 'attendance_session_not_draft';
    END IF;
    v_zone := v_session.time_zone;
  ELSE
    v_zone := public.team_attendance_time_zone(p_campaign_slug);
  END IF;

  IF p_session_date > public.team_attendance_local_date(now(), v_zone) THEN
    RAISE EXCEPTION 'attendance_date_in_future';
  END IF;
  IF NOT public.team_attendance_date_editable(p_session_date, public.team_attendance_local_date(now(), v_zone)) THEN
    RAISE EXCEPTION 'attendance_date_not_editable';
  END IF;

  IF p_expected_version > 0 AND v_session.version <> p_expected_version THEN
    RAISE EXCEPTION 'attendance_version_conflict';
  END IF;

  -- ── Submitted records: shape ─────────────────────────────────────────
  IF jsonb_typeof(p_records) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'attendance_records_invalid';
  END IF;
  IF jsonb_array_length(p_records) > 5000 THEN
    RAISE EXCEPTION 'attendance_records_too_many';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_records) e(v) WHERE jsonb_typeof(e.v) IS DISTINCT FROM 'object'
  ) THEN
    RAISE EXCEPTION 'attendance_record_invalid';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_records) e(v), jsonb_object_keys(e.v) k
    WHERE k NOT IN ('athlete_id', 'status', 'absence_reason', 'note', 'confirm_added_after_date')
  ) THEN
    RAISE EXCEPTION 'attendance_record_invalid';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'athlete_id', x.athlete_id, 'status', x.status, 'absence_reason', x.absence_reason,
    'note', x.note, 'confirm', x.confirm,
    -- coalesce: a NULL anywhere (e.g. a non-text status) is invalid, never "unknown".
    'valid', coalesce(
      x.athlete_id IS NOT NULL
      AND x.status IN ('present', 'absent')
      AND x.reason_ok AND x.note_ok AND x.confirm_ok
      AND (x.status = 'absent') = (x.absence_reason IS NOT NULL)
      AND (x.status = 'absent' OR x.note IS NULL)
      AND (x.note IS NULL OR char_length(x.note) <= 500),
      false)
  )), '[]'::jsonb)
  INTO v_sub
  FROM (
    SELECT
      public.team_attendance_try_uuid(e.v -> 'athlete_id') AS athlete_id,
      CASE WHEN jsonb_typeof(e.v -> 'status') = 'string' THEN e.v ->> 'status' END AS status,
      CASE WHEN jsonb_typeof(e.v -> 'absence_reason') = 'string' THEN e.v ->> 'absence_reason' END AS absence_reason,
      CASE WHEN jsonb_typeof(e.v -> 'note') = 'string'
           THEN nullif(btrim(e.v ->> 'note', E' \t\r\n'), '') END AS note,
      coalesce(e.v -> 'confirm_added_after_date' = 'true'::jsonb, false) AS confirm,
      coalesce(jsonb_typeof(e.v -> 'absence_reason'), 'null') = 'null'
        OR (e.v ->> 'absence_reason') IN ('excused', 'unexcused', 'other') AS reason_ok,
      coalesce(jsonb_typeof(e.v -> 'note'), 'null') IN ('null', 'string') AS note_ok,
      coalesce(jsonb_typeof(e.v -> 'confirm_added_after_date'), 'null') IN ('null', 'boolean') AS confirm_ok
    FROM jsonb_array_elements(p_records) e(v)
  ) x;

  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(v_sub) AS s(athlete_id uuid, status text, absence_reason text, note text, confirm boolean, valid boolean) WHERE NOT s.valid) THEN
    RAISE EXCEPTION 'attendance_record_invalid';
  END IF;

  -- ── Submitted records: against the authoritative roster ─────────────
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(v_sub) AS s(athlete_id uuid, status text, absence_reason text, note text, confirm boolean, valid boolean) GROUP BY s.athlete_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'attendance_athlete_duplicate';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(v_sub) AS s(athlete_id uuid, status text, absence_reason text, note text, confirm boolean, valid boolean)
    JOIN public.athletes a ON a.id = s.athlete_id
    WHERE a.campaign_slug IS DISTINCT FROM p_campaign_slug
  ) THEN
    RAISE EXCEPTION 'attendance_athlete_cross_team';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(v_sub) AS s(athlete_id uuid, status text, absence_reason text, note text, confirm boolean, valid boolean)
    WHERE NOT EXISTS (SELECT 1 FROM public.athletes a WHERE a.id = s.athlete_id)
  ) THEN
    RAISE EXCEPTION 'attendance_athlete_removed';
  END IF;
  -- Every required athlete: on the roster by the session date, or already
  -- recorded in this session. (An anti-join, so large rosters are one
  -- pass, not one scan of the submission per athlete.)
  IF EXISTS (
    SELECT 1
    FROM public.athletes a
    LEFT JOIN jsonb_to_recordset(v_sub) AS s(athlete_id uuid, status text, absence_reason text, note text, confirm boolean, valid boolean)
      ON s.athlete_id = a.id
    WHERE a.campaign_slug = p_campaign_slug
      AND s.athlete_id IS NULL
      AND (
        -- An athlete with no recorded add date counts as on the roster (required).
        coalesce(public.team_attendance_local_date(a.created_at, v_zone) <= p_session_date, true)
        OR EXISTS (
          SELECT 1 FROM public.team_attendance_records r
          WHERE r.session_id = v_session.id AND r.athlete_id = a.id
        )
      )
  ) THEN
    RAISE EXCEPTION 'attendance_roster_incomplete';
  END IF;
  -- Athletes added after the session date are recorded only on the
  -- coach's explicit decision.
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(v_sub) AS s(athlete_id uuid, status text, absence_reason text, note text, confirm boolean, valid boolean)
    JOIN public.athletes a ON a.id = s.athlete_id
    WHERE coalesce(public.team_attendance_local_date(a.created_at, v_zone) > p_session_date, false)
      AND NOT s.confirm
      AND NOT EXISTS (
        SELECT 1 FROM public.team_attendance_records r
        WHERE r.session_id = v_session.id AND r.athlete_id = a.id
      )
  ) THEN
    RAISE EXCEPTION 'attendance_late_athlete_unconfirmed';
  END IF;
  IF jsonb_array_length(v_sub) = 0 THEN
    RAISE EXCEPTION 'attendance_roster_empty';
  END IF;

  -- ── Write (one transaction) ──────────────────────────────────────────
  PERFORM set_config('elf.team_attendance_write', 'on', true);

  IF p_expected_version = 0 THEN
    INSERT INTO public.team_attendance_sessions (
      campaign_slug, session_date, time_zone, status, version,
      created_by_account_id, created_by_coach_id, created_by_platform_admin_id, created_by_name,
      updated_by_account_id, updated_by_coach_id, updated_by_platform_admin_id, updated_by_name
    ) VALUES (
      p_campaign_slug, p_session_date, v_zone, 'draft', 1,
      v_account_id, v_coach_id, v_admin_id, v_name,
      v_account_id, v_coach_id, v_admin_id, v_name
    )
    ON CONFLICT (campaign_slug, session_date) DO NOTHING
    RETURNING * INTO v_session;
    IF NOT FOUND THEN
      -- Someone else created this date's session first.
      RAISE EXCEPTION 'attendance_version_conflict';
    END IF;
    v_created := true;
  ELSE
    UPDATE public.team_attendance_sessions s
    SET version                      = s.version + 1,
        updated_by_account_id        = v_account_id,
        updated_by_coach_id          = v_coach_id,
        updated_by_platform_admin_id = v_admin_id,
        updated_by_name              = v_name,
        updated_at                   = now()
    WHERE s.id = v_session.id
    RETURNING * INTO v_session;
  END IF;

  BEGIN
    INSERT INTO public.team_attendance_records AS r (
      session_id, campaign_slug, session_date, athlete_id, athlete_name_snapshot,
      class_year_snapshot, status, absence_reason, note, updated_by_name
    )
    SELECT v_session.id, p_campaign_slug, p_session_date, a.id, a.name,
           a.class_year, s.status, s.absence_reason, s.note, v_name
    FROM jsonb_to_recordset(v_sub) AS s(athlete_id uuid, status text, absence_reason text, note text, confirm boolean, valid boolean)
    JOIN public.athletes a ON a.id = s.athlete_id
    ON CONFLICT (session_id, athlete_id) WHERE athlete_id IS NOT NULL DO UPDATE
    SET athlete_name_snapshot = EXCLUDED.athlete_name_snapshot,
        class_year_snapshot   = EXCLUDED.class_year_snapshot,
        status                = EXCLUDED.status,
        absence_reason        = EXCLUDED.absence_reason,
        note                  = EXCLUDED.note,
        updated_at = CASE WHEN (r.status, r.absence_reason, r.note)
                               IS DISTINCT FROM (EXCLUDED.status, EXCLUDED.absence_reason, EXCLUDED.note)
                          THEN now() ELSE r.updated_at END,
        updated_by_name = CASE WHEN (r.status, r.absence_reason, r.note)
                                    IS DISTINCT FROM (EXCLUDED.status, EXCLUDED.absence_reason, EXCLUDED.note)
                               THEN EXCLUDED.updated_by_name ELSE r.updated_by_name END
    WHERE (r.status, r.absence_reason, r.note, r.athlete_name_snapshot, r.class_year_snapshot)
          IS DISTINCT FROM
          (EXCLUDED.status, EXCLUDED.absence_reason, EXCLUDED.note, EXCLUDED.athlete_name_snapshot, EXCLUDED.class_year_snapshot);
  EXCEPTION
    -- An athlete deleted while this save was running.
    WHEN foreign_key_violation THEN
      RAISE EXCEPTION 'attendance_athlete_removed';
  END;

  -- If an athlete was deleted between the checks above and the insert,
  -- the join drops them: refuse rather than save a partial roster.
  IF (SELECT count(*) FROM public.team_attendance_records r
      JOIN jsonb_to_recordset(v_sub) AS s(athlete_id uuid, status text, absence_reason text, note text, confirm boolean, valid boolean) ON s.athlete_id = r.athlete_id
      WHERE r.session_id = v_session.id)
     <> jsonb_array_length(v_sub) THEN
    RAISE EXCEPTION 'attendance_athlete_removed';
  END IF;

  SELECT jsonb_build_object(
    'total',     count(*),
    'present',   count(*) FILTER (WHERE s.status = 'present'),
    'absent',    count(*) FILTER (WHERE s.status = 'absent'),
    'excused',   count(*) FILTER (WHERE s.absence_reason = 'excused'),
    'unexcused', count(*) FILTER (WHERE s.absence_reason = 'unexcused'),
    'other',     count(*) FILTER (WHERE s.absence_reason = 'other')
  ) INTO v_counts
  FROM jsonb_to_recordset(v_sub) AS s(athlete_id uuid, status text, absence_reason text, note text, confirm boolean, valid boolean);

  PERFORM set_config('elf.team_attendance_write', 'off', true);

  RETURN jsonb_build_object(
    'session_id',   v_session.id,
    'session_date', v_session.session_date,
    'version',      v_session.version,
    'saved_at',     v_session.updated_at,
    'created',      v_created,
    'counts',       v_counts
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 6. Reads
-- ═══════════════════════════════════════════════════════════════════════

-- A team's sessions between two dates (at most 366 days apart), newest
-- first, with counts. Counts cover athletes still on the team;
-- removed_count is records kept for athletes since deleted or moved.
CREATE OR REPLACE FUNCTION public.team_attendance_session_summaries(
  p_campaign_slug text,
  p_from          date,
  p_to            date
)
RETURNS TABLE (
  session_id       uuid,
  session_date     date,
  status           text,
  version          integer,
  time_zone        text,
  editable         boolean,
  created_at       timestamptz,
  updated_at       timestamptz,
  created_by_name  text,
  updated_by_name  text,
  recorded_count   integer,
  present_count    integer,
  absent_count     integer,
  excused_count    integer,
  unexcused_count  integer,
  other_count      integer,
  removed_count    integer
)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to OR p_to - p_from > 366 THEN
    RAISE EXCEPTION 'attendance_range_invalid';
  END IF;
  RETURN QUERY
  SELECT
    s.id, s.session_date, s.status, s.version, s.time_zone,
    s.status = 'draft'
      AND public.team_attendance_date_editable(s.session_date, public.team_attendance_local_date(now(), s.time_zone)),
    s.created_at, s.updated_at, s.created_by_name, s.updated_by_name,
    coalesce(c.recorded, 0), coalesce(c.present, 0), coalesce(c.absent, 0),
    coalesce(c.excused, 0), coalesce(c.unexcused, 0), coalesce(c.other, 0), coalesce(c.removed, 0)
  FROM public.team_attendance_sessions s
  LEFT JOIN LATERAL (
    SELECT
      count(*)::integer AS recorded,
      count(*) FILTER (WHERE a.id IS NOT NULL AND r.status = 'present')::integer AS present,
      count(*) FILTER (WHERE a.id IS NOT NULL AND r.status = 'absent')::integer AS absent,
      count(*) FILTER (WHERE a.id IS NOT NULL AND r.absence_reason = 'excused')::integer AS excused,
      count(*) FILTER (WHERE a.id IS NOT NULL AND r.absence_reason = 'unexcused')::integer AS unexcused,
      count(*) FILTER (WHERE a.id IS NOT NULL AND r.absence_reason = 'other')::integer AS other,
      count(*) FILTER (WHERE a.id IS NULL)::integer AS removed
    FROM public.team_attendance_records r
    LEFT JOIN public.athletes a ON a.id = r.athlete_id AND a.campaign_slug = s.campaign_slug
    WHERE r.session_id = s.id
  ) c ON true
  WHERE s.campaign_slug = p_campaign_slug
    AND s.session_date BETWEEN p_from AND p_to
  ORDER BY s.session_date DESC;
END;
$$;

-- One date's attendance for the editor: every athlete on the team's
-- roster now (with their record, if any) plus records kept for athletes
-- no longer on the team (on_roster = false). Works with or without a
-- saved session, and for any date (older sessions stay readable).
--   added_after_session_date  added to the roster after that date
--   requires_decision         added after that date AND not recorded:
--                             the coach must explicitly include them
-- Includes notes: callers must already have checked the viewer is a coach.
CREATE OR REPLACE FUNCTION public.team_attendance_session_roster(
  p_campaign_slug text,
  p_session_date  date
)
RETURNS TABLE (
  record_id                 uuid,
  athlete_id                uuid,
  athlete_name              text,
  class_year                text,
  on_roster                 boolean,
  added_after_session_date  boolean,
  has_record                boolean,
  requires_decision         boolean,
  status                    text,
  absence_reason            text,
  note                      text,
  record_updated_at         timestamptz,
  record_updated_by_name    text
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH sess AS (
    SELECT s.id, s.time_zone
    FROM public.team_attendance_sessions s
    WHERE s.campaign_slug = p_campaign_slug AND s.session_date = p_session_date
  ),
  zone AS (
    SELECT coalesce((SELECT sess.time_zone FROM sess), public.team_attendance_time_zone(p_campaign_slug)) AS tz
  )
  SELECT
    r.id, a.id, a.name, a.class_year, true,
    coalesce(public.team_attendance_local_date(a.created_at, (SELECT tz FROM zone)) > p_session_date, false),
    r.id IS NOT NULL,
    r.id IS NULL AND coalesce(public.team_attendance_local_date(a.created_at, (SELECT tz FROM zone)) > p_session_date, false),
    r.status, r.absence_reason, r.note, r.updated_at, r.updated_by_name
  FROM public.athletes a
  LEFT JOIN public.team_attendance_records r
    ON r.athlete_id = a.id AND r.session_id = (SELECT sess.id FROM sess)
  WHERE a.campaign_slug = p_campaign_slug
  UNION ALL
  SELECT
    r.id, r.athlete_id, r.athlete_name_snapshot, r.class_year_snapshot, false,
    false, true, false,
    r.status, r.absence_reason, r.note, r.updated_at, r.updated_by_name
  FROM public.team_attendance_records r
  WHERE r.session_id = (SELECT sess.id FROM sess)
    AND NOT EXISTS (
      SELECT 1 FROM public.athletes a WHERE a.id = r.athlete_id AND a.campaign_slug = p_campaign_slug
    );
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 7. Function privileges
-- ═══════════════════════════════════════════════════════════════════════

-- Internal: guards and the uuid parser. Nobody but the owner.
REVOKE ALL     ON FUNCTION public.team_attendance_sessions_guard() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.team_attendance_sessions_guard() FROM anon;
REVOKE EXECUTE ON FUNCTION public.team_attendance_sessions_guard() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.team_attendance_sessions_guard() FROM service_role;

REVOKE ALL     ON FUNCTION public.team_attendance_records_guard() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.team_attendance_records_guard() FROM anon;
REVOKE EXECUTE ON FUNCTION public.team_attendance_records_guard() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.team_attendance_records_guard() FROM service_role;

REVOKE ALL     ON FUNCTION public.team_attendance_try_uuid(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.team_attendance_try_uuid(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.team_attendance_try_uuid(jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.team_attendance_try_uuid(jsonb) FROM service_role;

-- Callable by the app server (service_role) only.
REVOKE ALL     ON FUNCTION public.team_attendance_time_zone(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.team_attendance_time_zone(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.team_attendance_time_zone(text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.team_attendance_time_zone(text) TO service_role;

REVOKE ALL     ON FUNCTION public.team_attendance_local_date(timestamptz, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.team_attendance_local_date(timestamptz, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.team_attendance_local_date(timestamptz, text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.team_attendance_local_date(timestamptz, text) TO service_role;

REVOKE ALL     ON FUNCTION public.team_attendance_date_editable(date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.team_attendance_date_editable(date, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.team_attendance_date_editable(date, date) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.team_attendance_date_editable(date, date) TO service_role;

REVOKE ALL     ON FUNCTION public.team_attendance_today(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.team_attendance_today(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.team_attendance_today(text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.team_attendance_today(text) TO service_role;

REVOKE ALL     ON FUNCTION public.team_attendance_save_draft(text, date, integer, jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.team_attendance_save_draft(text, date, integer, jsonb, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.team_attendance_save_draft(text, date, integer, jsonb, jsonb) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.team_attendance_save_draft(text, date, integer, jsonb, jsonb) TO service_role;

REVOKE ALL     ON FUNCTION public.team_attendance_session_summaries(text, date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.team_attendance_session_summaries(text, date, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.team_attendance_session_summaries(text, date, date) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.team_attendance_session_summaries(text, date, date) TO service_role;

REVOKE ALL     ON FUNCTION public.team_attendance_session_roster(text, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.team_attendance_session_roster(text, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.team_attendance_session_roster(text, date) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.team_attendance_session_roster(text, date) TO service_role;

COMMIT;
