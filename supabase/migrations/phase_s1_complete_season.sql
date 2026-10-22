-- Complete Season — Phase 1: database foundation (schema + functions).
--
-- A season is completed by creating a SUCCESSOR team (a new
-- campaign_settings row, normally "<slug>-<year+1>") and marking the old
-- team completed and archived. Every team table is keyed by campaign_slug,
-- so the old season's history (announcements, messages, attendance,
-- donations, To-Do, sponsors, files) simply stays where it is, under the
-- old URL. Returning athletes (grades advanced), eligible parents, staff
-- and team configuration are copied to the successor. Seniors graduate:
-- their records stay in the old season and are never deleted.
--
-- The whole transition is ONE call to team_season_complete(), i.e. one
-- transaction: all of it happens, or none of it does.
--
-- ── DORMANT IN THIS PHASE ──────────────────────────────────────────────
-- Nothing in the app calls these functions, and EXECUTE on the data
-- functions is revoked from every API role (anon, authenticated AND
-- service_role), so they cannot be reached through PostgREST at all —
-- not even with the server key. A later phase grants EXECUTE to
-- service_role, and only after Phase 2 (read-only enforcement for
-- completed seasons) is live. Until then only the table owner (SQL
-- editor) can run them.
--
-- ── What this migration adds ───────────────────────────────────────────
--   campaign_settings  program_id, season_started_at, season_completed_at,
--                      predecessor_campaign_slug, successor_campaign_slug
--   athletes           previous_season_athlete_id
--   team_season_transitions   immutable audit log, one row per completion
--   season_next_label / season_next_slug / season_next_class   pure rules
--   team_season_fingerprint / team_season_preview / team_season_complete
--   (+ internal helpers, see section 4)
--
-- ADDITIVE. The only existing data written is the one-time backfill
-- program_id = team_id (each existing team becomes its own program).
-- Requires phase_t5_attendance_drafts.sql (uses team_attendance_today()
-- for the team's local "today").
--
-- ── Why some obvious constraints are deliberately absent ────────────────
-- No CHECK ties season_completed_at to successor_campaign_slug, and no
-- CHECK on team_season_transitions' actor ids: those columns are cleared by
-- ON DELETE SET NULL, and this codebase has a reproduced bug class where a
-- CHECK plus ON DELETE SET NULL turns an ordinary delete into an opaque
-- check_violation (see phase_7_team_hub.sql / phase_3b2). The functions
-- enforce those rules instead.
--
-- ── Errors ─────────────────────────────────────────────────────────────
-- Fixed codes only (season_*), never names or ids, so nothing about a
-- student reaches server logs through an error message (same convention as
-- attendance).
--
-- ── Privileges ─────────────────────────────────────────────────────────
-- Supabase's default privileges grant ALL on new tables and EXECUTE on new
-- functions to anon/authenticated/service_role. Everything is revoked by
-- name below and only what is listed is granted back.

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.team_attendance_today(text)') IS NULL THEN
    RAISE EXCEPTION 'phase_s1 requires phase_t5_attendance_drafts.sql (public.team_attendance_today) to be applied first';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Team lineage
-- ═══════════════════════════════════════════════════════════════════════

-- program_id: shared by every season of one program (the chain of
-- successor teams). Existing teams each start their own program, keyed by
-- their existing (unique, stable) team_id.
-- season_started_at: when this team became the active season through a
-- transition; NULL for every team that predates Complete Season (= no
-- restriction). Phase 2 uses it for attendance dates.
-- predecessor/successor: the previous and next season. ON DELETE SET NULL
-- so the existing admin hard-delete keeps working (the link is cleared, the
-- other season is untouched). Slugs are never renamed anywhere in the app,
-- so no ON UPDATE action is needed.
ALTER TABLE public.campaign_settings
  ADD COLUMN IF NOT EXISTS program_id                uuid,
  ADD COLUMN IF NOT EXISTS season_started_at         timestamptz,
  ADD COLUMN IF NOT EXISTS season_completed_at       timestamptz,
  ADD COLUMN IF NOT EXISTS predecessor_campaign_slug text
    REFERENCES public.campaign_settings(campaign_slug) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS successor_campaign_slug   text
    REFERENCES public.campaign_settings(campaign_slug) ON DELETE SET NULL;

UPDATE public.campaign_settings SET program_id = team_id WHERE program_id IS NULL;

ALTER TABLE public.campaign_settings
  ALTER COLUMN program_id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN program_id SET NOT NULL;

ALTER TABLE public.campaign_settings DROP CONSTRAINT IF EXISTS campaign_settings_not_own_successor;
ALTER TABLE public.campaign_settings ADD  CONSTRAINT campaign_settings_not_own_successor
  CHECK (successor_campaign_slug <> campaign_slug);
ALTER TABLE public.campaign_settings DROP CONSTRAINT IF EXISTS campaign_settings_not_own_predecessor;
ALTER TABLE public.campaign_settings ADD  CONSTRAINT campaign_settings_not_own_predecessor
  CHECK (predecessor_campaign_slug <> campaign_slug);

-- A season has at most one next and one previous season: the program's
-- seasons form a single line, never a fork.
CREATE UNIQUE INDEX IF NOT EXISTS campaign_settings_successor_uniq
  ON public.campaign_settings (successor_campaign_slug) WHERE successor_campaign_slug IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS campaign_settings_predecessor_uniq
  ON public.campaign_settings (predecessor_campaign_slug) WHERE predecessor_campaign_slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS campaign_settings_program_idx
  ON public.campaign_settings (program_id);

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Athlete identity across seasons
-- ═══════════════════════════════════════════════════════════════════════

-- The new-season athlete points at the same person's previous-season
-- record. History (donations, attendance, outreach) stays on the old
-- record; this link lets a later phase follow a career. Each old record
-- advances at most once.
ALTER TABLE public.athletes
  ADD COLUMN IF NOT EXISTS previous_season_athlete_id uuid
    REFERENCES public.athletes(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS athletes_previous_season_uniq
  ON public.athletes (previous_season_athlete_id) WHERE previous_season_athlete_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. Season-transition audit log
-- ═══════════════════════════════════════════════════════════════════════

-- One row per completed season, written in the same transaction as the
-- transition itself. Counts and ids only — never names. No foreign key on
-- the slugs: the audit row must outlive an admin hard-delete of either
-- team. result is the exact value the completing call returned, so a
-- retried call (same idempotency key) returns the identical answer.
CREATE TABLE IF NOT EXISTS public.team_season_transitions (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key          uuid        NOT NULL,
  request_hash             text        NOT NULL,
  program_id               uuid        NOT NULL,
  from_campaign_slug       text        NOT NULL,
  to_campaign_slug         text        NOT NULL,
  from_season_label        text        NOT NULL,
  to_season_label          text        NOT NULL,
  preview_fingerprint      text        NOT NULL,
  actor_kind               text        NOT NULL,
  actor_coach_id           uuid        REFERENCES public.team_coaches(id)    ON DELETE SET NULL,
  actor_platform_admin_id  uuid        REFERENCES public.platform_admins(id) ON DELETE SET NULL,
  actor_account_id         uuid        REFERENCES public.elf_accounts(id)    ON DELETE SET NULL,
  actor_name               text        NOT NULL,
  summary                  jsonb       NOT NULL,
  flagged_athlete_ids      uuid[]      NOT NULL DEFAULT '{}',
  result                   jsonb       NOT NULL,
  completed_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_season_transitions_idempotency_key_key UNIQUE (idempotency_key),
  CONSTRAINT team_season_transitions_from_key            UNIQUE (from_campaign_slug),
  CONSTRAINT team_season_transitions_to_key              UNIQUE (to_campaign_slug),
  CONSTRAINT team_season_transitions_actor_kind_check
    CHECK (actor_kind IN ('head_coach', 'platform_admin')),
  CONSTRAINT team_season_transitions_request_hash_check
    CHECK (request_hash ~ '^[0-9a-f]{32}$')
);

CREATE INDEX IF NOT EXISTS team_season_transitions_program_idx
  ON public.team_season_transitions (program_id, completed_at);

ALTER TABLE public.team_season_transitions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.team_season_transitions FROM PUBLIC;
REVOKE ALL ON TABLE public.team_season_transitions FROM anon;
REVOKE ALL ON TABLE public.team_season_transitions FROM authenticated;
REVOKE ALL ON TABLE public.team_season_transitions FROM service_role;
GRANT SELECT ON TABLE public.team_season_transitions TO service_role;

-- Write protection: rows are inserted only by team_season_complete() (which
-- sets the transaction-local flag elf.season_transition = 'on'), and are
-- never edited, deleted or truncated — even by the owner. The one exception
-- is PostgreSQL clearing an actor foreign key (ON DELETE SET NULL) after
-- the referenced coach, platform admin or account row was really deleted.
CREATE OR REPLACE FUNCTION public.team_season_transitions_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'team_season_transitions_immutable';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF current_setting('elf.season_transition', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'team_season_transitions_write_via_function_only';
    END IF;
    RETURN NEW;
  END IF;

  IF (NEW.id, NEW.idempotency_key, NEW.request_hash, NEW.program_id, NEW.from_campaign_slug,
      NEW.to_campaign_slug, NEW.from_season_label, NEW.to_season_label, NEW.preview_fingerprint,
      NEW.actor_kind, NEW.actor_name, NEW.summary, NEW.flagged_athlete_ids, NEW.result, NEW.completed_at)
     IS DISTINCT FROM
     (OLD.id, OLD.idempotency_key, OLD.request_hash, OLD.program_id, OLD.from_campaign_slug,
      OLD.to_campaign_slug, OLD.from_season_label, OLD.to_season_label, OLD.preview_fingerprint,
      OLD.actor_kind, OLD.actor_name, OLD.summary, OLD.flagged_athlete_ids, OLD.result, OLD.completed_at)
  THEN
    RAISE EXCEPTION 'team_season_transitions_immutable';
  END IF;
  IF (NEW.actor_coach_id IS DISTINCT FROM OLD.actor_coach_id AND (
        NEW.actor_coach_id IS NOT NULL
        OR EXISTS (SELECT 1 FROM public.team_coaches c WHERE c.id = OLD.actor_coach_id)))
  OR (NEW.actor_platform_admin_id IS DISTINCT FROM OLD.actor_platform_admin_id AND (
        NEW.actor_platform_admin_id IS NOT NULL
        OR EXISTS (SELECT 1 FROM public.platform_admins p WHERE p.id = OLD.actor_platform_admin_id)))
  OR (NEW.actor_account_id IS DISTINCT FROM OLD.actor_account_id AND (
        NEW.actor_account_id IS NOT NULL
        OR EXISTS (SELECT 1 FROM public.elf_accounts a WHERE a.id = OLD.actor_account_id)))
  THEN
    RAISE EXCEPTION 'team_season_transitions_immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS team_season_transitions_guard ON public.team_season_transitions;
CREATE TRIGGER team_season_transitions_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.team_season_transitions
  FOR EACH ROW EXECUTE FUNCTION public.team_season_transitions_guard();

DROP TRIGGER IF EXISTS team_season_transitions_no_truncate ON public.team_season_transitions;
CREATE TRIGGER team_season_transitions_no_truncate
  BEFORE TRUNCATE ON public.team_season_transitions
  FOR EACH STATEMENT EXECUTE FUNCTION public.team_season_transitions_guard();

-- ═══════════════════════════════════════════════════════════════════════
-- 4. Rules (pure functions)
-- ═══════════════════════════════════════════════════════════════════════

-- Next season label, or NULL when the format isn't recognized (the coach
-- must then type one). Supported, with or without a trailing "Season" (any
-- capitalization, kept exactly as written):
--   2027            -> 2028
--   26-27           -> 27-28      (two-digit years wrap: 99-00 -> 00-01)
--   2026-27         -> 2027-28
--   2026-2027       -> 2027-2028
-- Separators "-", "/" and "–" are kept as written. Anything else -> NULL.
CREATE OR REPLACE FUNCTION public.season_next_label(p_label text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v text := btrim(p_label);
  -- En dash, written as a code point so the function source stays ASCII
  -- whatever client encoding the migration is run with.
  dash constant text := chr(8211);
  m text[];
  y1 integer;
  y2 integer;
BEGIN
  IF v IS NULL OR v = '' THEN
    RETURN NULL;
  END IF;

  -- YYYY<sep>YYYY or YYYY<sep>YY
  m := regexp_match(v, '^([0-9]{4})(\s*[-/' || dash || ']\s*)([0-9]{4}|[0-9]{2})((\s+[Ss][Ee][Aa][Ss][Oo][Nn])?)$');
  IF m IS NOT NULL THEN
    y1 := m[1]::integer;
    IF y1 >= 9999 THEN RETURN NULL; END IF;
    IF length(m[3]) = 4 THEN
      y2 := m[3]::integer;
      IF y2 >= 9999 THEN RETURN NULL; END IF;
      RETURN (y1 + 1)::text || m[2] || (y2 + 1)::text || m[4];
    END IF;
    RETURN (y1 + 1)::text || m[2] || lpad(((m[3]::integer + 1) % 100)::text, 2, '0') || m[4];
  END IF;

  -- YY<sep>YY
  m := regexp_match(v, '^([0-9]{2})(\s*[-/' || dash || ']\s*)([0-9]{2})((\s+[Ss][Ee][Aa][Ss][Oo][Nn])?)$');
  IF m IS NOT NULL THEN
    RETURN lpad(((m[1]::integer + 1) % 100)::text, 2, '0') || m[2]
        || lpad(((m[3]::integer + 1) % 100)::text, 2, '0') || m[4];
  END IF;

  -- YYYY
  m := regexp_match(v, '^([0-9]{4})((\s+[Ss][Ee][Aa][Ss][Oo][Nn])?)$');
  IF m IS NOT NULL THEN
    y1 := m[1]::integer;
    IF y1 >= 9999 THEN RETURN NULL; END IF;
    RETURN (y1 + 1)::text || m[2];
  END IF;

  RETURN NULL;
END;
$$;

-- The year a label ENDS in, as a four-digit year when known, else as a
-- two-digit year (0-99); NULL when the label has no recognizable year.
-- Used only to warn when the derived slug and label disagree.
CREATE OR REPLACE FUNCTION public.season_label_end_year(p_label text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN m IS NULL THEN NULL
    ELSE m[1]::integer
  END
  FROM (SELECT regexp_match(btrim(coalesce(p_label, '')),
          '([0-9]{4}|[0-9]{2})(\s+[Ss][Ee][Aa][Ss][Oo][Nn])?$') AS m) s;
$$;

-- A valid team slug: same rule as the admin tools (^[a-z0-9][a-z0-9-]*$),
-- 3 to 80 characters.
CREATE OR REPLACE FUNCTION public.season_slug_valid(p_slug text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT coalesce(p_slug ~ '^[a-z0-9][a-z0-9-]*$' AND length(p_slug) BETWEEN 3 AND 80, false);
$$;

-- Next slug: a trailing "-YYYY" advances one year
-- ("monroe-valley-track-and-field-2027" -> "...-2028"). NULL when the slug
-- has no trailing year (the coach must then type one).
CREATE OR REPLACE FUNCTION public.season_next_slug(p_slug text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  m text[];
  v text;
BEGIN
  m := regexp_match(coalesce(p_slug, ''), '^([a-z0-9][a-z0-9-]*-)([0-9]{4})$');
  IF m IS NULL OR m[2]::integer >= 9999 THEN
    RETURN NULL;
  END IF;
  v := m[1] || (m[2]::integer + 1)::text;
  IF NOT public.season_slug_valid(v) THEN
    RETURN NULL;
  END IF;
  RETURN v;
END;
$$;

-- An athlete's grade next season. Matching ignores surrounding spaces and
-- capitalization; a recognized grade is written in its standard spelling.
--   Freshman -> Sophomore, Sophomore -> Junior, Junior -> Senior   advance
--   Senior                                                         graduate
--   6th / 7th / 8th Grade (unchanged)                              unchanged
--   blank, Other, anything else (e.g. "RS Sophomore") — kept exactly
--   as stored                                                      flag
CREATE OR REPLACE FUNCTION public.season_next_class(p_class text, OUT next_class text, OUT outcome text)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
BEGIN
  CASE lower(btrim(coalesce(p_class, '')))
    WHEN 'freshman'  THEN next_class := 'Sophomore'; outcome := 'advance';
    WHEN 'sophomore' THEN next_class := 'Junior';    outcome := 'advance';
    WHEN 'junior'    THEN next_class := 'Senior';    outcome := 'advance';
    WHEN 'senior'    THEN next_class := NULL;        outcome := 'graduate';
    WHEN '6th grade' THEN next_class := '6th Grade'; outcome := 'unchanged';
    WHEN '7th grade' THEN next_class := '7th Grade'; outcome := 'unchanged';
    WHEN '8th grade' THEN next_class := '8th Grade'; outcome := 'unchanged';
    ELSE                  next_class := p_class;     outcome := 'flag';
  END CASE;
END;
$$;

-- Why a grade is flagged: 'blank', 'other' or 'nonstandard'.
CREATE OR REPLACE FUNCTION public.season_flag_reason(p_class text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN btrim(coalesce(p_class, '')) = ''          THEN 'blank'
    WHEN lower(btrim(p_class)) = 'other'            THEN 'other'
    ELSE 'nonstandard'
  END;
$$;

-- A join code: 6 characters from generateJoinCode()'s alphabet (no 0/O,
-- 1/I). 32 symbols divide 256, so each byte maps without bias. Bytes come
-- from the fully random first six bytes of a version-4 uuid.
CREATE OR REPLACE FUNCTION public.season_new_join_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
DECLARE
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea;
  v text;
  i integer;
  attempt integer;
BEGIN
  FOR attempt IN 1..10 LOOP
    b := uuid_send(gen_random_uuid());
    v := '';
    FOR i IN 0..5 LOOP
      v := v || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM public.team_join_codes j WHERE j.code = v) THEN
      RETURN v;
    END IF;
  END LOOP;
  RAISE EXCEPTION 'season_join_code_unavailable';
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 5. Who completes a season
-- ═══════════════════════════════════════════════════════════════════════

-- p_actor is { "coach_id": uuid } or { "platform_admin_id": uuid } — the
-- same shape as attendance. The app server must build it solely from its
-- verified session, never from anything the client sends; the database
-- re-checks it. Allowed: a Head Coach of THIS team with an ELF account, or
-- a platform admin. Assistant coaches, boosters, members and other teams'
-- coaches are refused; a legacy (account-less) Head Coach is refused with
-- its own code so the app can explain why.
CREATE OR REPLACE FUNCTION public.team_season_actor(
  p_actor jsonb,
  p_slug  text,
  OUT actor_kind              text,
  OUT actor_coach_id          uuid,
  OUT actor_platform_admin_id uuid,
  OUT actor_account_id        uuid,
  OUT actor_name              text)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_coach uuid;
  v_admin uuid;
  v_coach_account uuid;
  v_coach_name text;
BEGIN
  IF jsonb_typeof(p_actor) IS DISTINCT FROM 'object'
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_actor) k WHERE k NOT IN ('coach_id', 'platform_admin_id')) THEN
    RAISE EXCEPTION 'season_actor_invalid';
  END IF;
  v_coach := public.team_attendance_try_uuid(p_actor -> 'coach_id');
  v_admin := public.team_attendance_try_uuid(p_actor -> 'platform_admin_id');
  IF (p_actor ? 'coach_id' AND v_coach IS NULL)
     OR (p_actor ? 'platform_admin_id' AND v_admin IS NULL)
     OR (v_coach IS NULL) = (v_admin IS NULL) THEN
    RAISE EXCEPTION 'season_actor_invalid';
  END IF;

  IF v_coach IS NOT NULL THEN
    SELECT tc.account_id, tc.name INTO v_coach_account, v_coach_name
    FROM public.team_coaches tc
    WHERE tc.id = v_coach AND tc.campaign_slug = p_slug AND tc.role = 'head_coach';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'season_actor_not_authorized';
    END IF;
    IF v_coach_account IS NULL THEN
      RAISE EXCEPTION 'season_actor_account_required';
    END IF;
    actor_kind := 'head_coach';
    actor_coach_id := v_coach;
    actor_account_id := v_coach_account;
    actor_name := v_coach_name;
  ELSE
    SELECT pa.account_id, coalesce(a.name, '') INTO actor_account_id, actor_name
    FROM public.platform_admins pa
    LEFT JOIN public.elf_accounts a ON a.id = pa.account_id
    WHERE pa.id = v_admin;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'season_actor_not_authorized';
    END IF;
    actor_kind := 'platform_admin';
    actor_platform_admin_id := v_admin;
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 6. Carryover plans (shared by preview and complete, so the two can never
--    disagree about who carries over)
-- ═══════════════════════════════════════════════════════════════════════

-- Every athlete on the team with next season's grade and outcome.
CREATE OR REPLACE FUNCTION public.team_season_athlete_plan(p_slug text)
RETURNS TABLE (athlete_id uuid, name text, class_year text, next_class text, outcome text, flag_reason text)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT a.id, a.name, a.class_year, c.next_class, c.outcome,
         CASE WHEN c.outcome = 'flag' THEN public.season_flag_reason(a.class_year) END
  FROM public.athletes a
  CROSS JOIN LATERAL public.season_next_class(a.class_year) c
  WHERE a.campaign_slug = p_slug;
$$;

-- Every team_members row with its decision:
--   carry        copied to the successor
--   no_account   would carry, but has no ELF account -> must rejoin
--   graduated    athlete (or every linked child) graduates
--   unlinked     athlete/parent row linked to no athlete of this team
-- A member's children are the legacy team_members.athlete_id plus every
-- team_member_athletes link (the same union the app uses), restricted to
-- athletes of THIS team. primary_athlete_id is the athlete_id the new row
-- keeps: the legacy athlete_id when that athlete returns, else NULL (the
-- returning children are still linked through team_member_athletes).
CREATE OR REPLACE FUNCTION public.team_season_member_plan(p_slug text)
RETURNS TABLE (member_id uuid, role text, name text, account_id uuid, decision text,
               primary_athlete_id uuid, returning_children integer)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH returning_athletes AS (
    SELECT p.athlete_id FROM public.team_season_athlete_plan(p_slug) p WHERE p.outcome <> 'graduate'
  ),
  children AS (
    SELECT m.id AS member_id, m.athlete_id
    FROM public.team_members m
    JOIN public.athletes a ON a.id = m.athlete_id AND a.campaign_slug = p_slug
    WHERE m.campaign_slug = p_slug
    UNION
    SELECT l.team_member_id, l.athlete_id
    FROM public.team_member_athletes l
    JOIN public.team_members m ON m.id = l.team_member_id AND m.campaign_slug = p_slug
    JOIN public.athletes a ON a.id = l.athlete_id AND a.campaign_slug = p_slug
  ),
  per_member AS (
    SELECT m.id, m.role, m.name, m.account_id, m.athlete_id,
           (SELECT count(*) FROM children c WHERE c.member_id = m.id)::integer AS kids,
           (SELECT count(*) FROM children c JOIN returning_athletes r ON r.athlete_id = c.athlete_id
             WHERE c.member_id = m.id)::integer AS returning_kids,
           (m.athlete_id IN (SELECT athlete_id FROM returning_athletes)) AS legacy_returns
    FROM public.team_members m
    WHERE m.campaign_slug = p_slug
  )
  SELECT p.id, p.role, p.name, p.account_id,
         CASE
           WHEN p.role = 'booster' THEN
             CASE WHEN p.account_id IS NULL THEN 'no_account' ELSE 'carry' END
           WHEN p.role = 'athlete' THEN
             CASE
               WHEN p.athlete_id IS NULL OR p.kids = 0 THEN 'unlinked'
               WHEN NOT coalesce(p.legacy_returns, false) THEN 'graduated'
               WHEN p.account_id IS NULL THEN 'no_account'
               ELSE 'carry'
             END
           ELSE  -- parent
             CASE
               WHEN p.kids = 0 THEN 'unlinked'
               WHEN p.returning_kids = 0 THEN 'graduated'
               WHEN p.account_id IS NULL THEN 'no_account'
               ELSE 'carry'
             END
         END,
         CASE WHEN coalesce(p.legacy_returns, false) THEN p.athlete_id END,
         p.returning_kids
  FROM per_member p;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 7. Fingerprint
-- ═══════════════════════════════════════════════════════════════════════

-- A hash of everything a transition's outcome depends on: the team's
-- season state, its athletes and grades, members, parent links, coaches,
-- future calendar events, safety blocks and pending requests/invitations.
-- The preview returns it; team_season_complete() refuses to run when it no
-- longer matches (the coach must preview again), and re-checks it before
-- finishing. Names are deliberately NOT included: a name edit doesn't
-- change who carries over, and names are copied at execution time.
CREATE OR REPLACE FUNCTION public.team_season_fingerprint(p_slug text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT md5(concat_ws('|',
    (SELECT concat_ws(':', cs.season, coalesce(cs.archived, false), coalesce(cs.status, ''),
                      coalesce(cs.season_completed_at::text, ''), coalesce(cs.successor_campaign_slug, ''))
       FROM public.campaign_settings cs WHERE cs.campaign_slug = p_slug),
    'A' || coalesce((SELECT string_agg(a.id::text || ':' || coalesce(a.class_year, '~'), ',' ORDER BY a.id)
       FROM public.athletes a WHERE a.campaign_slug = p_slug), ''),
    'M' || coalesce((SELECT string_agg(concat_ws(':', m.id, m.role, coalesce(m.account_id::text, '~'),
                                                 coalesce(m.athlete_id::text, '~')), ',' ORDER BY m.id)
       FROM public.team_members m WHERE m.campaign_slug = p_slug), ''),
    'L' || coalesce((SELECT string_agg(l.team_member_id::text || ':' || l.athlete_id::text, ','
                                       ORDER BY l.team_member_id, l.athlete_id)
       FROM public.team_member_athletes l
       JOIN public.team_members m ON m.id = l.team_member_id AND m.campaign_slug = p_slug), ''),
    'C' || coalesce((SELECT string_agg(concat_ws(':', c.id, c.role, coalesce(c.account_id::text, '~')), ',' ORDER BY c.id)
       FROM public.team_coaches c WHERE c.campaign_slug = p_slug), ''),
    'E' || coalesce((SELECT string_agg(e.id::text || ':' || e.event_date::text, ',' ORDER BY e.id)
       FROM public.calendar_events e
       WHERE e.campaign_slug = p_slug AND e.event_date >= public.team_attendance_today(p_slug)), ''),
    'B' || coalesce((SELECT string_agg(b.id::text, ',' ORDER BY b.id)
       FROM public.user_blocks b WHERE b.campaign_slug = p_slug), ''),
    'P' || coalesce((SELECT string_agg(x.id::text, ',' ORDER BY x.id) FROM (
         SELECT r.id FROM public.pending_athlete_requests r WHERE r.campaign_slug = p_slug AND r.status = 'pending'
         UNION ALL
         SELECT r.id FROM public.parent_access_requests r WHERE r.campaign_slug = p_slug AND r.status = 'pending'
         UNION ALL
         SELECT i.id FROM public.team_staff_invitations i
         WHERE i.campaign_slug = p_slug AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()
       ) x), '')
  ));
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 8. Preview (read-only)
-- ═══════════════════════════════════════════════════════════════════════

-- Everything the coach must see before confirming. Writes nothing. Names
-- appear only here (for an authorized Head Coach / platform admin, who can
-- already see the roster) — never in errors or the audit log.
--
-- p_to_slug / p_to_season_label: optional overrides; when omitted the next
-- slug/label are derived. Blockers prevent completion; warnings don't.
CREATE OR REPLACE FUNCTION public.team_season_preview(
  p_from_slug        text,
  p_actor            jsonb,
  p_to_slug          text DEFAULT NULL,
  p_to_season_label  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  src           public.campaign_settings%ROWTYPE;
  actor         record;
  v_today       date;
  v_to          text;
  v_to_source   text;
  v_label       text;
  v_label_source text;
  v_phrase      text;
  v_blockers    text[] := '{}';
  v_warnings    text[] := '{}';
  v_slug_year   integer;
  v_label_year  integer;
  v_roster      jsonb;
  v_members     jsonb;
  v_coaches     jsonb;
  v_pending_ath integer;
  v_pending_par integer;
  v_pending_inv integer;
  v_flagged     integer;
  v_no_acct_m   integer;
  v_no_acct_c   integer;
  v_head        integer;
  v_inquiries   integer;
  v_recent_don  integer;
  v_att_drafts  integer;
BEGIN
  SELECT * INTO src FROM public.campaign_settings WHERE campaign_slug = p_from_slug;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'season_team_not_found';
  END IF;
  SELECT * INTO actor FROM public.team_season_actor(p_actor, p_from_slug);
  v_today := public.team_attendance_today(p_from_slug);

  -- ── Team state ──────────────────────────────────────────────────────
  IF src.season_completed_at IS NOT NULL OR src.successor_campaign_slug IS NOT NULL THEN
    v_blockers := array_append(v_blockers, 'season_already_completed');
  ELSIF coalesce(src.archived, false) OR src.status = 'archived' THEN
    v_blockers := array_append(v_blockers, 'season_team_archived');
  END IF;

  -- ── Successor slug ──────────────────────────────────────────────────
  IF nullif(btrim(p_to_slug), '') IS NOT NULL THEN
    v_to := btrim(p_to_slug);
    v_to_source := 'provided';
  ELSE
    v_to := public.season_next_slug(p_from_slug);
    v_to_source := CASE WHEN v_to IS NULL THEN 'required' ELSE 'derived' END;
  END IF;
  IF v_to IS NULL THEN
    v_blockers := array_append(v_blockers, 'season_successor_slug_required');
  ELSIF NOT public.season_slug_valid(v_to) THEN
    v_blockers := array_append(v_blockers, 'season_successor_slug_invalid');
  ELSIF v_to = p_from_slug THEN
    v_blockers := array_append(v_blockers, 'season_successor_slug_same');
  ELSIF EXISTS (SELECT 1 FROM public.campaign_settings c WHERE c.campaign_slug = v_to)
     OR EXISTS (SELECT 1 FROM public.team_season_transitions t WHERE t.to_campaign_slug = v_to) THEN
    v_blockers := array_append(v_blockers, 'season_successor_slug_taken');
  END IF;

  -- ── Season label ────────────────────────────────────────────────────
  IF nullif(btrim(p_to_season_label), '') IS NOT NULL THEN
    v_label := btrim(p_to_season_label);
    v_label_source := 'provided';
  ELSE
    v_label := public.season_next_label(src.season);
    v_label_source := CASE WHEN v_label IS NULL THEN 'required' ELSE 'derived' END;
  END IF;
  IF v_label IS NULL THEN
    v_blockers := array_append(v_blockers, 'season_label_required');
  ELSIF length(v_label) > 40 THEN
    v_blockers := array_append(v_blockers, 'season_label_invalid');
  END IF;

  -- Mixed formats are fine ("...-2028" with "27-28 Season"); a slug year
  -- that disagrees with the label's end year is only a warning.
  IF v_to IS NOT NULL AND v_label IS NOT NULL AND v_to ~ '-[0-9]{4}$' THEN
    v_slug_year  := right(v_to, 4)::integer;
    v_label_year := public.season_label_end_year(v_label);
    IF v_label_year IS NOT NULL AND (
         (v_label_year >= 100 AND v_label_year <> v_slug_year)
      OR (v_label_year < 100 AND v_label_year <> v_slug_year % 100)) THEN
      v_warnings := array_append(v_warnings, 'season_label_slug_year_mismatch');
    END IF;
  END IF;

  v_phrase := 'COMPLETE ' || CASE
    WHEN btrim(coalesce(src.season, '')) = '' THEN 'SEASON'
    ELSE upper(regexp_replace(btrim(src.season), '\s+', ' ', 'g'))
  END;

  -- ── Roster ──────────────────────────────────────────────────────────
  SELECT jsonb_build_object(
    'total',                   count(*),
    'graduating',              count(*) FILTER (WHERE p.outcome = 'graduate'),
    'returning',               count(*) FILTER (WHERE p.outcome <> 'graduate'),
    'freshman_to_sophomore',   count(*) FILTER (WHERE p.outcome = 'advance' AND p.next_class = 'Sophomore'),
    'sophomore_to_junior',     count(*) FILTER (WHERE p.outcome = 'advance' AND p.next_class = 'Junior'),
    'junior_to_senior',        count(*) FILTER (WHERE p.outcome = 'advance' AND p.next_class = 'Senior'),
    'unchanged_middle_school', count(*) FILTER (WHERE p.outcome = 'unchanged'),
    'flagged', coalesce(jsonb_agg(jsonb_build_object(
                 'athlete_id', p.athlete_id, 'name', p.name, 'class_year', p.class_year, 'reason', p.flag_reason)
               ORDER BY p.name, p.athlete_id) FILTER (WHERE p.outcome = 'flag'), '[]'::jsonb)
  ), count(*) FILTER (WHERE p.outcome = 'flag')
  INTO v_roster, v_flagged
  FROM public.team_season_athlete_plan(p_from_slug) p;

  -- ── Members ─────────────────────────────────────────────────────────
  SELECT jsonb_build_object(
    'athletes_carried',          count(*) FILTER (WHERE m.decision = 'carry' AND m.role = 'athlete'),
    'parents_carried',           count(*) FILTER (WHERE m.decision = 'carry' AND m.role = 'parent'),
    'boosters_carried',          count(*) FILTER (WHERE m.decision = 'carry' AND m.role = 'booster'),
    'athletes_graduated',        count(*) FILTER (WHERE m.decision = 'graduated' AND m.role = 'athlete'),
    'parents_graduates_only',    count(*) FILTER (WHERE m.decision = 'graduated' AND m.role = 'parent'),
    'unlinked_not_carried',      count(*) FILTER (WHERE m.decision = 'unlinked'),
    'parent_links_carried',      (SELECT count(*) FROM public.team_member_athletes l
                                   JOIN public.team_season_member_plan(p_from_slug) mp
                                     ON mp.member_id = l.team_member_id AND mp.decision = 'carry'
                                   JOIN public.team_season_athlete_plan(p_from_slug) ap
                                     ON ap.athlete_id = l.athlete_id AND ap.outcome <> 'graduate'),
    'must_rejoin', coalesce(jsonb_agg(jsonb_build_object(
                     'member_id', m.member_id, 'name', m.name, 'role', m.role)
                   ORDER BY m.role, m.name, m.member_id) FILTER (WHERE m.decision = 'no_account'), '[]'::jsonb)
  ), count(*) FILTER (WHERE m.decision = 'no_account')
  INTO v_members, v_no_acct_m
  FROM public.team_season_member_plan(p_from_slug) m;

  -- ── Coaches ─────────────────────────────────────────────────────────
  SELECT jsonb_build_object(
    'head_carried',      count(*) FILTER (WHERE c.account_id IS NOT NULL AND c.role = 'head_coach'),
    'assistant_carried', count(*) FILTER (WHERE c.account_id IS NOT NULL AND c.role = 'assistant_coach'),
    'booster_carried',   count(*) FILTER (WHERE c.account_id IS NOT NULL AND c.role = 'booster'),
    'must_rejoin', coalesce(jsonb_agg(jsonb_build_object('coach_id', c.id, 'name', c.name, 'role', c.role)
                   ORDER BY c.role, c.name, c.id) FILTER (WHERE c.account_id IS NULL), '[]'::jsonb),
    'actor_carried', (actor.actor_kind = 'head_coach')
  ), count(*) FILTER (WHERE c.account_id IS NULL),
     count(*) FILTER (WHERE c.account_id IS NOT NULL AND c.role = 'head_coach')
  INTO v_coaches, v_no_acct_c, v_head
  FROM public.team_coaches c WHERE c.campaign_slug = p_from_slug;

  IF v_head = 0 THEN
    v_blockers := array_append(v_blockers, 'season_no_head_coach_carried');
  END IF;

  -- ── Open items ──────────────────────────────────────────────────────
  SELECT count(*) INTO v_pending_ath FROM public.pending_athlete_requests r
    WHERE r.campaign_slug = p_from_slug AND r.status = 'pending';
  SELECT count(*) INTO v_pending_par FROM public.parent_access_requests r
    WHERE r.campaign_slug = p_from_slug AND r.status = 'pending';
  SELECT count(*) INTO v_pending_inv FROM public.team_staff_invitations i
    WHERE i.campaign_slug = p_from_slug AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now();
  SELECT count(*) INTO v_inquiries FROM public.fundraising_inquiries f
    WHERE f.campaign_slug = p_from_slug AND f.status IN ('new', 'contacted');
  SELECT count(*) INTO v_recent_don FROM public.donations d
    WHERE d.campaign_slug = p_from_slug AND d.created_at > now() - interval '24 hours';
  SELECT count(*) INTO v_att_drafts FROM public.team_attendance_sessions s
    WHERE s.campaign_slug = p_from_slug AND s.status = 'draft' AND s.session_date >= v_today - 14;

  IF v_pending_ath > 0 THEN v_blockers := array_append(v_blockers, 'season_pending_athlete_requests'); END IF;
  IF v_pending_par > 0 THEN v_blockers := array_append(v_blockers, 'season_pending_parent_requests'); END IF;
  IF v_pending_inv > 0 THEN v_blockers := array_append(v_blockers, 'season_pending_staff_invitations'); END IF;

  IF v_flagged    > 0 THEN v_warnings := array_append(v_warnings, 'season_flagged_grades'); END IF;
  IF v_no_acct_m  > 0 THEN v_warnings := array_append(v_warnings, 'season_members_must_rejoin'); END IF;
  IF v_no_acct_c  > 0 THEN v_warnings := array_append(v_warnings, 'season_coaches_must_rejoin'); END IF;
  IF v_inquiries  > 0 THEN v_warnings := array_append(v_warnings, 'season_pending_fundraising_inquiries'); END IF;
  IF v_recent_don > 0 THEN v_warnings := array_append(v_warnings, 'season_recent_donations'); END IF;
  IF v_att_drafts > 0 THEN v_warnings := array_append(v_warnings, 'season_attendance_drafts_frozen'); END IF;

  RETURN jsonb_build_object(
    'from', jsonb_build_object(
      'slug', src.campaign_slug, 'season_label', src.season, 'school_name', src.school_name,
      'sport_name', src.sport_name, 'program_id', src.program_id,
      'has_organization', src.organization_id IS NOT NULL,
      'archived', coalesce(src.archived, false), 'completed', src.season_completed_at IS NOT NULL,
      'successor_slug', src.successor_campaign_slug,
      'fundraising_enabled', src.fundraising_enabled),
    'proposed', jsonb_build_object(
      'slug', v_to, 'slug_source', v_to_source,
      'slug_available', NOT ('season_successor_slug_taken' = ANY (v_blockers)),
      'season_label', v_label, 'label_source', v_label_source,
      'confirmation_phrase', v_phrase),
    'actor', jsonb_build_object('kind', actor.actor_kind),
    'roster', v_roster,
    'members', v_members,
    'coaches', v_coaches,
    'calendar', jsonb_build_object(
      'cutoff_local_date', v_today,
      'future_events_to_copy', (SELECT count(*) FROM public.calendar_events e
                                WHERE e.campaign_slug = p_from_slug AND e.event_date >= v_today),
      'subscription_moves', EXISTS (SELECT 1 FROM public.calendar_subscription_tokens t
                                    WHERE t.campaign_slug = p_from_slug AND t.revoked_at IS NULL)),
    'copied', jsonb_build_object(
      'fund_uses',      (SELECT count(*) FROM public.fund_uses f WHERE f.campaign_slug = p_from_slug),
      'store_products', (SELECT count(*) FROM public.team_products t WHERE t.campaign_slug = p_from_slug),
      'team_contact_goal', EXISTS (SELECT 1 FROM public.fundraising_contact_goals g
                                   WHERE g.campaign_slug = p_from_slug AND g.athlete_id IS NULL AND g.coach_id IS NULL),
      'team_goal_cents', src.goal_cents,
      'default_athlete_goal_cents', src.default_athlete_goal_cents),
    'left_in_history', jsonb_build_object(
      'announcements',  (SELECT count(*) FROM public.announcements x WHERE x.campaign_slug = p_from_slug),
      'message_threads',(SELECT count(*) FROM public.message_threads x WHERE x.campaign_slug = p_from_slug),
      'attendance_sessions', (SELECT count(*) FROM public.team_attendance_sessions x WHERE x.campaign_slug = p_from_slug),
      'donations',      (SELECT count(*) FROM public.donations x WHERE x.campaign_slug = p_from_slug),
      'team_sponsors',  (SELECT count(*) FROM public.sponsors x WHERE x.campaign_slug = p_from_slug),
      'todo_tasks',     (SELECT count(*) FROM public.team_tasks x WHERE x.campaign_slug = p_from_slug),
      'clearance_resources', (SELECT count(*) FROM public.clearance_resources x WHERE x.campaign_slug = p_from_slug)),
    'open_items', jsonb_build_object(
      'pending_athlete_requests', v_pending_ath,
      'pending_parent_requests', v_pending_par,
      'pending_staff_invitations', v_pending_inv,
      'pending_fundraising_inquiries', v_inquiries,
      'donations_last_24h', v_recent_don,
      'recent_attendance_drafts', v_att_drafts),
    'blockers', to_jsonb(v_blockers),
    'warnings', to_jsonb(v_warnings),
    'fingerprint', public.team_season_fingerprint(p_from_slug)
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 9. Complete (the transition)
-- ═══════════════════════════════════════════════════════════════════════

-- Repeat protection: the same idempotency key with the same request
-- returns the stored result (replayed: true); the same key with a
-- different request is refused.
CREATE OR REPLACE FUNCTION public.team_season_replay(p_key uuid, p_hash text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  t public.team_season_transitions%ROWTYPE;
BEGIN
  SELECT * INTO t FROM public.team_season_transitions WHERE idempotency_key = p_key;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF t.request_hash <> p_hash THEN
    RAISE EXCEPTION 'season_idempotency_conflict';
  END IF;
  RETURN t.result || jsonb_build_object('replayed', true);
END;
$$;

-- p_from_slug            the season being completed
-- p_actor                { "coach_id": uuid } | { "platform_admin_id": uuid }
--                        — from the server's verified session only
-- p_to_slug / p_to_season_label   NULL = the derived value (as previewed)
-- p_expected_fingerprint the preview's fingerprint
-- p_idempotency_key      one per confirmation (a retry reuses it)
-- p_confirmation         the typed phrase, e.g. "COMPLETE 2027 SEASON"
--                        (surrounding spaces, repeated spaces and
--                        capitalization are ignored)
--
-- SECURITY DEFINER (runs as the owner) because it is the only writer of
-- team_season_transitions; search_path is empty and every reference is
-- schema-qualified. lock_timeout bounds how long a second, simultaneous
-- call waits for the first.
CREATE OR REPLACE FUNCTION public.team_season_complete(
  p_from_slug             text,
  p_actor                 jsonb,
  p_to_slug               text,
  p_to_season_label       text,
  p_expected_fingerprint  text,
  p_idempotency_key       uuid,
  p_confirmation          text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '10s'
AS $$
DECLARE
  src          public.campaign_settings%ROWTYPE;
  actor        record;
  v_hash       text;
  v_replay     jsonb;
  v_plan       jsonb;
  v_blocker    text;
  v_to         text;
  v_label      text;
  v_now        timestamptz := now();
  v_today      date;
  v_join_code  text;
  v_transition uuid := gen_random_uuid();
  v_flagged    uuid[];
  v_summary    jsonb;
  v_result     jsonb;
  n_coaches    integer;
  n_athletes   integer;
  n_members    integer;
  n_links      integer;
  n_blocks     integer;
  n_events     integer;
  n_fund_uses  integer;
  n_products   integer;
  n_goal       integer;
  n_cal_tokens integer;
  n_push       integer;
  n_order      integer;
BEGIN
  IF p_from_slug IS NULL THEN
    RAISE EXCEPTION 'season_team_not_found';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'season_idempotency_key_required';
  END IF;
  IF p_expected_fingerprint IS NULL OR p_expected_fingerprint !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'season_preview_required';
  END IF;

  v_hash := md5(jsonb_build_array(
    p_from_slug, nullif(btrim(p_to_slug), ''), nullif(btrim(p_to_season_label), ''),
    p_expected_fingerprint, p_actor,
    upper(regexp_replace(btrim(coalesce(p_confirmation, '')), '\s+', ' ', 'g')))::text);

  -- A retry of a call that already committed: return its result.
  v_replay := public.team_season_replay(p_idempotency_key, v_hash);
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

  -- Lock the season. A simultaneous second call waits here, then sees the
  -- first call's result (replay) or the completed state.
  SELECT * INTO src FROM public.campaign_settings WHERE campaign_slug = p_from_slug FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'season_team_not_found';
  END IF;
  v_replay := public.team_season_replay(p_idempotency_key, v_hash);
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

  SELECT * INTO actor FROM public.team_season_actor(p_actor, p_from_slug);
  v_plan := public.team_season_preview(p_from_slug, p_actor, p_to_slug, p_to_season_label);

  IF v_plan -> 'blockers' ? 'season_already_completed' THEN
    RAISE EXCEPTION 'season_already_completed';
  END IF;
  IF v_plan ->> 'fingerprint' <> p_expected_fingerprint THEN
    RAISE EXCEPTION 'season_preview_stale';
  END IF;
  IF upper(regexp_replace(btrim(coalesce(p_confirmation, '')), '\s+', ' ', 'g'))
     <> v_plan -> 'proposed' ->> 'confirmation_phrase' THEN
    RAISE EXCEPTION 'season_confirmation_mismatch';
  END IF;
  v_blocker := v_plan -> 'blockers' ->> 0;
  IF v_blocker IS NOT NULL THEN
    RAISE EXCEPTION '%', v_blocker;
  END IF;

  v_to    := v_plan -> 'proposed' ->> 'slug';
  v_label := v_plan -> 'proposed' ->> 'season_label';
  v_today := public.team_attendance_today(p_from_slug);

  PERFORM set_config('elf.season_transition', 'on', true);

  -- ── 1. Successor team ───────────────────────────────────────────────
  -- Copied: identity, branding, display settings, store, goals,
  -- Community Partner-relevant organization link, demo flags.
  -- Reset: slug, season label, team_id (new), deadline (cleared),
  -- archived, fundraising (off until a platform admin enables it),
  -- crm_contact_id (unique per team), lineage.
  INSERT INTO public.campaign_settings (
    campaign_slug, school_name, sport_name, goal_cents, deadline, mascot,
    primary_color, secondary_color, location, season, logo_url, archived,
    show_program_identity, show_share_section, show_fund_uses, show_recent_donations,
    show_sponsors, show_leaderboard, show_donation_card, layout_variant,
    external_store_url, store_provider, default_athlete_goal_cents,
    contact_requirement, status, is_demo, demo_template,
    theme_primary_color, theme_secondary_color, theme_accent_color, theme_button_color,
    crm_contact_id, show_booster_in_staff_roster, organization_id, branding_customized,
    description, allow_coach_fundraising, fundraising_enabled,
    program_id, season_started_at, season_completed_at,
    predecessor_campaign_slug, successor_campaign_slug)
  VALUES (
    v_to, src.school_name, src.sport_name, src.goal_cents, '', src.mascot,
    src.primary_color, src.secondary_color, src.location, v_label, src.logo_url, false,
    src.show_program_identity, src.show_share_section, src.show_fund_uses, src.show_recent_donations,
    src.show_sponsors, src.show_leaderboard, src.show_donation_card, src.layout_variant,
    src.external_store_url, src.store_provider, src.default_athlete_goal_cents,
    src.contact_requirement, src.status, src.is_demo, src.demo_template,
    src.theme_primary_color, src.theme_secondary_color, src.theme_accent_color, src.theme_button_color,
    NULL, src.show_booster_in_staff_roster, src.organization_id, src.branding_customized,
    src.description, src.allow_coach_fundraising, false,
    src.program_id, v_now, NULL,
    p_from_slug, NULL);

  -- ── 2. Coaches (account-linked; head, assistant and booster) ─────────
  -- An account-linked coach signs in through the account, so the team
  -- login password is the same vestigial placeholder staff invitations use.
  INSERT INTO public.team_coaches (campaign_slug, name, email, role, password_hash, salt, created_at, account_id)
  SELECT v_to, c.name, c.email, c.role, 'unused', replace(gen_random_uuid()::text, '-', ''), v_now, c.account_id
  FROM public.team_coaches c
  WHERE c.campaign_slug = p_from_slug AND c.account_id IS NOT NULL
  ORDER BY c.created_at, c.id;
  GET DIAGNOSTICS n_coaches = ROW_COUNT;

  -- ── 3. Returning athletes, grades advanced ──────────────────────────
  -- Per-athlete goals reset (the team default goal applies); everything
  -- else about the athlete carries. Graduating athletes are not copied and
  -- their records are untouched.
  INSERT INTO public.athletes (campaign_slug, name, event, created_at, jersey_number, grad_year,
                               profile_photo, goal_cents, contact_phone, contact_email, class_year,
                               previous_season_athlete_id)
  SELECT v_to, a.name, a.event, v_now, a.jersey_number, a.grad_year,
         a.profile_photo, NULL, a.contact_phone, a.contact_email, p.next_class, a.id
  FROM public.athletes a
  JOIN public.team_season_athlete_plan(p_from_slug) p ON p.athlete_id = a.id
  WHERE a.campaign_slug = p_from_slug AND p.outcome <> 'graduate'
  ORDER BY a.created_at, a.id;
  GET DIAGNOSTICS n_athletes = ROW_COUNT;

  SELECT coalesce(array_agg(p.athlete_id ORDER BY p.athlete_id), '{}') INTO v_flagged
  FROM public.team_season_athlete_plan(p_from_slug) p WHERE p.outcome = 'flag';

  -- ── 4. Members (account-linked athletes, parents, boosters) ─────────
  -- Old -> new member/coach rows map through the account: an account has
  -- at most one member row and one coach row per team (unique indexes).
  INSERT INTO public.team_members (campaign_slug, role, name, phone, email, athlete_id, salt, created_at, account_id)
  SELECT v_to, m.role, m.name, m.phone, m.email, na.id, replace(gen_random_uuid()::text, '-', ''), v_now, m.account_id
  FROM public.team_season_member_plan(p_from_slug) p
  JOIN public.team_members m ON m.id = p.member_id
  LEFT JOIN public.athletes na ON na.campaign_slug = v_to AND na.previous_season_athlete_id = p.primary_athlete_id
  WHERE p.decision = 'carry'
  ORDER BY m.created_at, m.id;
  GET DIAGNOSTICS n_members = ROW_COUNT;

  -- ── 5. Parent links to returning athletes ───────────────────────────
  INSERT INTO public.team_member_athletes (team_member_id, athlete_id, created_at)
  SELECT nm.id, na.id, v_now
  FROM public.team_member_athletes l
  JOIN public.team_members om ON om.id = l.team_member_id AND om.campaign_slug = p_from_slug
  JOIN public.team_members nm ON nm.campaign_slug = v_to AND nm.account_id = om.account_id
  JOIN public.athletes na ON na.campaign_slug = v_to AND na.previous_season_athlete_id = l.athlete_id;
  GET DIAGNOSTICS n_links = ROW_COUNT;

  -- ── 6. Safety blocks (translated to the new rows) ───────────────────
  INSERT INTO public.user_blocks (campaign_slug, blocker_kind, blocker_id, blocked_kind, blocked_id, created_at)
  SELECT v_to, b.blocker_kind, nb.id, b.blocked_kind, nd.id, b.created_at
  FROM public.user_blocks b
  CROSS JOIN LATERAL (
    SELECT CASE b.blocker_kind
      WHEN 'platform_admin' THEN b.blocker_id
      WHEN 'coach'  THEN (SELECT n.id FROM public.team_coaches o JOIN public.team_coaches n
                            ON n.campaign_slug = v_to AND n.account_id = o.account_id
                          WHERE o.id = b.blocker_id AND o.campaign_slug = p_from_slug)
      WHEN 'member' THEN (SELECT n.id FROM public.team_members o JOIN public.team_members n
                            ON n.campaign_slug = v_to AND n.account_id = o.account_id
                          WHERE o.id = b.blocker_id AND o.campaign_slug = p_from_slug)
    END AS id) nb
  CROSS JOIN LATERAL (
    SELECT CASE b.blocked_kind
      WHEN 'platform_admin' THEN b.blocked_id
      WHEN 'coach'  THEN (SELECT n.id FROM public.team_coaches o JOIN public.team_coaches n
                            ON n.campaign_slug = v_to AND n.account_id = o.account_id
                          WHERE o.id = b.blocked_id AND o.campaign_slug = p_from_slug)
      WHEN 'member' THEN (SELECT n.id FROM public.team_members o JOIN public.team_members n
                            ON n.campaign_slug = v_to AND n.account_id = o.account_id
                          WHERE o.id = b.blocked_id AND o.campaign_slug = p_from_slug)
    END AS id) nd
  WHERE b.campaign_slug = p_from_slug AND nb.id IS NOT NULL AND nd.id IS NOT NULL
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n_blocks = ROW_COUNT;

  -- ── 7. Future calendar events (copied; the originals stay) ──────────
  INSERT INTO public.calendar_events (campaign_slug, title, event_date, event_time, location, type,
                                      coach_id, created_at, description, start_time, end_time)
  SELECT v_to, e.title, e.event_date, e.event_time, e.location, e.type,
         (SELECT n.id FROM public.team_coaches o JOIN public.team_coaches n
            ON n.campaign_slug = v_to AND n.account_id = o.account_id
          WHERE o.id = e.coach_id AND o.campaign_slug = p_from_slug),
         v_now, e.description, e.start_time, e.end_time
  FROM public.calendar_events e
  WHERE e.campaign_slug = p_from_slug AND e.event_date >= v_today
  ORDER BY e.event_date, e.id;
  GET DIAGNOSTICS n_events = ROW_COUNT;

  -- ── 8. Configuration: fund uses, store products, team contact goal ──
  INSERT INTO public.fund_uses (campaign_slug, title, description, icon, sort_order)
  SELECT v_to, f.title, f.description, f.icon, f.sort_order
  FROM public.fund_uses f WHERE f.campaign_slug = p_from_slug ORDER BY f.sort_order, f.id;
  GET DIAGNOSTICS n_fund_uses = ROW_COUNT;

  INSERT INTO public.team_products (campaign_slug, name, description, category, price_cents, image_url,
                                    visible, display_order, cost_cents, external_url)
  SELECT v_to, t.name, t.description, t.category, t.price_cents, t.image_url,
         t.visible, t.display_order, t.cost_cents, t.external_url
  FROM public.team_products t WHERE t.campaign_slug = p_from_slug ORDER BY t.display_order, t.id;
  GET DIAGNOSTICS n_products = ROW_COUNT;

  INSERT INTO public.fundraising_contact_goals (campaign_slug, athlete_id, goal, set_by_coach_id, coach_id)
  SELECT v_to, NULL, g.goal,
         (SELECT n.id FROM public.team_coaches o JOIN public.team_coaches n
            ON n.campaign_slug = v_to AND n.account_id = o.account_id
          WHERE o.id = g.set_by_coach_id AND o.campaign_slug = p_from_slug),
         NULL
  FROM public.fundraising_contact_goals g
  WHERE g.campaign_slug = p_from_slug AND g.athlete_id IS NULL AND g.coach_id IS NULL;
  GET DIAGNOSTICS n_goal = ROW_COUNT;

  -- ── 9. Nothing changed underneath us ────────────────────────────────
  IF public.team_season_fingerprint(p_from_slug) <> p_expected_fingerprint THEN
    RAISE EXCEPTION 'season_roster_changed_during_transition';
  END IF;

  -- ── 10. Complete and archive the old season ─────────────────────────
  UPDATE public.campaign_settings
  SET archived = true, season_completed_at = v_now, successor_campaign_slug = v_to
  WHERE campaign_slug = p_from_slug;

  -- ── 11. Join codes: old revoked, new issued ─────────────────────────
  UPDATE public.team_join_codes SET revoked = true WHERE campaign_slug = p_from_slug AND NOT revoked;
  v_join_code := public.season_new_join_code();
  INSERT INTO public.team_join_codes (campaign_slug, code) VALUES (v_to, v_join_code);

  -- ── 12. Subscriptions follow the current season ─────────────────────
  -- The calendar feed link resolves its team from the row (its URL is an
  -- HMAC of the row id only), so subscribers keep the same URL.
  UPDATE public.calendar_subscription_tokens SET campaign_slug = v_to
  WHERE campaign_slug = p_from_slug AND revoked_at IS NULL;
  GET DIAGNOSTICS n_cal_tokens = ROW_COUNT;

  -- Web push rows of people who carry over move with them (the endpoint is
  -- unique, so they are moved, not copied). Others stay with the old season.
  UPDATE public.push_subscriptions ps
  SET campaign_slug = v_to,
      member_id = (SELECT n.id FROM public.team_members o JOIN public.team_members n
                     ON n.campaign_slug = v_to AND n.account_id = o.account_id
                   WHERE o.id = ps.member_id AND o.campaign_slug = p_from_slug),
      coach_id  = (SELECT n.id FROM public.team_coaches o JOIN public.team_coaches n
                     ON n.campaign_slug = v_to AND n.account_id = o.account_id
                   WHERE o.id = ps.coach_id AND o.campaign_slug = p_from_slug)
  WHERE ps.campaign_slug = p_from_slug
    AND (ps.member_id IS NOT NULL OR ps.coach_id IS NOT NULL)
    AND (ps.member_id IS NULL OR EXISTS (
          SELECT 1 FROM public.team_members o JOIN public.team_members n
            ON n.campaign_slug = v_to AND n.account_id = o.account_id WHERE o.id = ps.member_id AND o.campaign_slug = p_from_slug))
    AND (ps.coach_id IS NULL OR EXISTS (
          SELECT 1 FROM public.team_coaches o JOIN public.team_coaches n
            ON n.campaign_slug = v_to AND n.account_id = o.account_id WHERE o.id = ps.coach_id AND o.campaign_slug = p_from_slug));
  GET DIAGNOSTICS n_push = ROW_COUNT;

  -- ── 13. Team switcher order: the new season goes just before the old ─
  UPDATE public.account_team_order o
  SET team_slugs = o.team_slugs[1:array_position(o.team_slugs, p_from_slug) - 1]
                   || ARRAY[v_to]
                   || o.team_slugs[array_position(o.team_slugs, p_from_slug):],
      updated_at = v_now
  WHERE array_position(o.team_slugs, p_from_slug) IS NOT NULL
    AND NOT (v_to = ANY (o.team_slugs))
    AND o.account_id IN (
      SELECT c.account_id FROM public.team_coaches c WHERE c.campaign_slug = v_to AND c.account_id IS NOT NULL
      UNION
      SELECT m.account_id FROM public.team_members m WHERE m.campaign_slug = v_to AND m.account_id IS NOT NULL);
  GET DIAGNOSTICS n_order = ROW_COUNT;

  -- ── 14. The copies match the preview exactly ────────────────────────
  IF n_athletes <> (v_plan -> 'roster' ->> 'returning')::integer
     OR n_members <> (v_plan -> 'members' ->> 'athletes_carried')::integer
                   + (v_plan -> 'members' ->> 'parents_carried')::integer
                   + (v_plan -> 'members' ->> 'boosters_carried')::integer
     OR n_links <> (v_plan -> 'members' ->> 'parent_links_carried')::integer
     OR n_coaches <> (v_plan -> 'coaches' ->> 'head_carried')::integer
                   + (v_plan -> 'coaches' ->> 'assistant_carried')::integer
                   + (v_plan -> 'coaches' ->> 'booster_carried')::integer
     OR n_events <> (v_plan -> 'calendar' ->> 'future_events_to_copy')::integer THEN
    RAISE EXCEPTION 'season_plan_mismatch';
  END IF;

  v_summary := jsonb_build_object(
    'athletes_total',          (v_plan -> 'roster' ->> 'total')::integer,
    'athletes_graduated',      (v_plan -> 'roster' ->> 'graduating')::integer,
    'athletes_carried',        n_athletes,
    'freshman_to_sophomore',   (v_plan -> 'roster' ->> 'freshman_to_sophomore')::integer,
    'sophomore_to_junior',     (v_plan -> 'roster' ->> 'sophomore_to_junior')::integer,
    'junior_to_senior',        (v_plan -> 'roster' ->> 'junior_to_senior')::integer,
    'unchanged_middle_school', (v_plan -> 'roster' ->> 'unchanged_middle_school')::integer,
    'athletes_flagged',        coalesce(array_length(v_flagged, 1), 0),
    'coaches_carried',         n_coaches,
    'members_carried',         n_members,
    'members_must_rejoin',     jsonb_array_length(v_plan -> 'members' -> 'must_rejoin'),
    'coaches_must_rejoin',     jsonb_array_length(v_plan -> 'coaches' -> 'must_rejoin'),
    'parent_links_carried',    n_links,
    'safety_blocks_carried',   n_blocks,
    'calendar_events_copied',  n_events,
    'fund_uses_copied',        n_fund_uses,
    'store_products_copied',   n_products,
    'team_contact_goal_copied', n_goal = 1,
    'calendar_subscription_moved', n_cal_tokens = 1,
    'push_subscriptions_moved', n_push,
    'team_orders_updated',     n_order);

  v_result := jsonb_build_object(
    'transition_id',   v_transition,
    'from_slug',       p_from_slug,
    'to_slug',         v_to,
    'to_season_label', v_label,
    'program_id',      src.program_id,
    'join_code',       v_join_code,
    'completed_at',    v_now,
    'summary',         v_summary);

  -- ── 15. Audit record ────────────────────────────────────────────────
  INSERT INTO public.team_season_transitions (
    id, idempotency_key, request_hash, program_id, from_campaign_slug, to_campaign_slug,
    from_season_label, to_season_label, preview_fingerprint, actor_kind, actor_coach_id,
    actor_platform_admin_id, actor_account_id, actor_name, summary, flagged_athlete_ids,
    result, completed_at)
  VALUES (
    v_transition, p_idempotency_key, v_hash, src.program_id, p_from_slug, v_to,
    src.season, v_label, p_expected_fingerprint, actor.actor_kind, actor.actor_coach_id,
    actor.actor_platform_admin_id, actor.actor_account_id, coalesce(actor.actor_name, ''), v_summary, v_flagged,
    v_result, v_now);

  PERFORM set_config('elf.season_transition', 'off', true);

  RETURN v_result || jsonb_build_object('replayed', false);
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 10. Privileges
-- ═══════════════════════════════════════════════════════════════════════

-- Pure rules: callable by the app server (harmless, no data access).
REVOKE ALL     ON FUNCTION public.season_next_label(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.season_next_label(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.season_next_label(text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.season_next_label(text) TO service_role;

REVOKE ALL     ON FUNCTION public.season_next_slug(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.season_next_slug(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.season_next_slug(text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.season_next_slug(text) TO service_role;

REVOKE ALL     ON FUNCTION public.season_next_class(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.season_next_class(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.season_next_class(text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.season_next_class(text) TO service_role;

-- Everything else: owner only in this phase (dormant). A later phase grants
-- EXECUTE on team_season_preview / team_season_complete to service_role,
-- after Phase 2's read-only enforcement is live.
REVOKE ALL     ON FUNCTION public.season_label_end_year(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.season_label_end_year(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.season_label_end_year(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.season_label_end_year(text) FROM service_role;

REVOKE ALL     ON FUNCTION public.season_slug_valid(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.season_slug_valid(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.season_slug_valid(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.season_slug_valid(text) FROM service_role;

REVOKE ALL     ON FUNCTION public.season_flag_reason(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.season_flag_reason(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.season_flag_reason(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.season_flag_reason(text) FROM service_role;

REVOKE ALL     ON FUNCTION public.season_new_join_code() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.season_new_join_code() FROM anon;
REVOKE EXECUTE ON FUNCTION public.season_new_join_code() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.season_new_join_code() FROM service_role;

REVOKE ALL     ON FUNCTION public.team_season_transitions_guard() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.team_season_transitions_guard() FROM anon;
REVOKE EXECUTE ON FUNCTION public.team_season_transitions_guard() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.team_season_transitions_guard() FROM service_role;

REVOKE ALL     ON FUNCTION public.team_season_actor(jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.team_season_actor(jsonb, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.team_season_actor(jsonb, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.team_season_actor(jsonb, text) FROM service_role;

REVOKE ALL     ON FUNCTION public.team_season_athlete_plan(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.team_season_athlete_plan(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.team_season_athlete_plan(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.team_season_athlete_plan(text) FROM service_role;

REVOKE ALL     ON FUNCTION public.team_season_member_plan(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.team_season_member_plan(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.team_season_member_plan(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.team_season_member_plan(text) FROM service_role;

REVOKE ALL     ON FUNCTION public.team_season_fingerprint(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.team_season_fingerprint(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.team_season_fingerprint(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.team_season_fingerprint(text) FROM service_role;

REVOKE ALL     ON FUNCTION public.team_season_preview(text, jsonb, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.team_season_preview(text, jsonb, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.team_season_preview(text, jsonb, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.team_season_preview(text, jsonb, text, text) FROM service_role;

REVOKE ALL     ON FUNCTION public.team_season_replay(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.team_season_replay(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.team_season_replay(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.team_season_replay(uuid, text) FROM service_role;

REVOKE ALL     ON FUNCTION public.team_season_complete(text, jsonb, text, text, text, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.team_season_complete(text, jsonb, text, text, text, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.team_season_complete(text, jsonb, text, text, text, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.team_season_complete(text, jsonb, text, text, text, uuid, text) FROM service_role;

COMMIT;
