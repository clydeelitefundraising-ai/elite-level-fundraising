-- Team Management Phase 3: athlete and parent task acknowledgments.
--
--   team_task_acknowledgments   append-only record of each acknowledgment
--   team_task_ack_statement()   the approved, versioned statement text
--   team_task_ack_member_linked() "is this member linked to this athlete,
--                               in this role, on this team, right now?"
--   team_task_ack_counts()      "does this stored acknowledgment still count?"
--   team_task_acknowledge()     the ONLY way to record an acknowledgment
--   team_task_ack_status()      per task x athlete x requirement status
--
-- ADDITIVE ONLY. Creates one new table and new functions. Does not alter,
-- drop, or write any existing table (team_tasks, team_task_resources,
-- clearance_resources, team_members, athletes, elf_accounts ...). The new
-- table's foreign keys reference existing tables; PostgreSQL implements
-- those with internal triggers on the referenced tables, which is the only
-- catalog change outside this migration's own objects. Wrapped in one
-- transaction: any error rolls the whole migration back. Safe to rerun.
--
-- ── Requirements ───────────────────────────────────────────────────────
-- A task's audience decides what is required for EACH athlete on the team:
--   athlete -> the athlete's own acknowledgment
--   parent  -> one acknowledgment from any currently linked parent
--   both    -> both of the above
-- A requirement is satisfied only by an acknowledgment of the task's
-- CURRENT revision (team_tasks.revision — bumped by the database on every
-- substantive change, see phase_t2) whose identity still holds the
-- relationship (team_task_ack_counts):
--   * the acknowledging team_members row still exists, and
--   * it still belongs to the SAME account it had when it acknowledged
--     (NULL only for a legacy team-login member), and
--   * it is still linked to that athlete, in that role, on this team.
-- So an acknowledgment stops counting when the parent is unlinked, the
-- member row is deleted or changes role, or the account that made it is
-- deleted (its team_members row survives with account_id NULL). The row is
-- always kept as history.
--
-- ── Trust boundary ─────────────────────────────────────────────────────
-- The app server is the only caller (service_role). It authenticates the
-- person from their signed session cookie and passes the resulting
-- team_members id + account id. The database cannot see the cookie, so it
-- cannot prove WHO is calling — but it does refuse any combination that is
-- not internally consistent, so an app bug or a tampered request body can
-- never record an acknowledgment that the claimed person could not have
-- made themselves:
--   * the member must exist ON THIS TEAM, with the role being acknowledged
--   * the member's account must equal the authenticated account the app
--     passed (both NULL only for a legacy team-login member)
--   * every athlete must be on this team and currently linked to that
--     member in that role (legacy team_members.athlete_id, or
--     team_member_athletes for parents)
--   * the task must be on this team, active, require that role, and still
--     be at the revision the person reviewed
-- Snapshots (names, task title, statement text) are read by the database,
-- never taken from the caller.
--
-- ── Append-only ────────────────────────────────────────────────────────
-- Rows can only be inserted by team_task_acknowledge() (transaction-local
-- flag, same pattern as phase_t2's team_task_resources). They can never be
-- updated or deleted, with one exception: when a referenced athlete or
-- member row is deleted, its foreign key is set to NULL — and the guard
-- verifies the referenced row really is gone before allowing that.
-- account_id is a snapshot of the acknowledging account (no foreign key),
-- so it is never cleared: deleting that account leaves the record intact
-- and makes it stop counting. TRUNCATE is blocked. Tasks with
-- acknowledgments cannot be deleted (ON DELETE RESTRICT; the app only ever
-- archives tasks).
--
-- ── Privileges ─────────────────────────────────────────────────────────
-- RLS enabled, no policies. Supabase's default privileges grant ALL on new
-- tables and EXECUTE on new functions to anon/authenticated/service_role;
-- this migration revokes all of it and grants back only what the app
-- needs: service_role SELECT + INSERT on the table (INSERT is still
-- refused by the guard outside team_task_acknowledge()), and EXECUTE on
-- the five callable functions. anon/authenticated get nothing.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- 1. team_task_acknowledgments
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.team_task_acknowledgments (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_slug          text        NOT NULL,
  task_id                uuid        NOT NULL REFERENCES public.team_tasks(id)   ON DELETE RESTRICT,
  task_revision          integer     NOT NULL,
  requirement            text        NOT NULL,
  -- Live links. Set to NULL (never deleted) if the athlete or member is
  -- later deleted; the snapshots below keep the record readable.
  athlete_id             uuid        REFERENCES public.athletes(id)     ON DELETE SET NULL,
  member_id              uuid        REFERENCES public.team_members(id) ON DELETE SET NULL,
  -- The account that acknowledged (NULL = legacy team-login member).
  -- Deliberately NOT a foreign key: it must survive account deletion
  -- unchanged so team_task_ack_counts() can tell the identity is gone.
  account_id             uuid,
  -- What the person typed, and what the database knew at the time.
  full_name              text        NOT NULL,
  member_name_snapshot   text,
  athlete_name_snapshot  text        NOT NULL,
  task_title_snapshot    text        NOT NULL,
  statement_version      integer     NOT NULL,
  statement_text         text        NOT NULL,
  acknowledged_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tta_requirement_check CHECK (requirement IN ('athlete', 'parent')),
  CONSTRAINT tta_revision_positive CHECK (task_revision >= 1),
  CONSTRAINT tta_full_name_length  CHECK (char_length(full_name) BETWEEN 2 AND 120 AND full_name = btrim(full_name)),
  CONSTRAINT tta_statement_present CHECK (statement_version >= 1 AND char_length(statement_text) > 0)
);

-- One acknowledgment per person, per athlete, per requirement, per task
-- revision. A new revision needs (and allows) a new acknowledgment; the
-- old rows stay as history.
CREATE UNIQUE INDEX IF NOT EXISTS tta_one_per_person_revision
  ON public.team_task_acknowledgments (task_id, task_revision, athlete_id, requirement, member_id)
  WHERE athlete_id IS NOT NULL AND member_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tta_campaign_athlete
  ON public.team_task_acknowledgments (campaign_slug, athlete_id);

CREATE INDEX IF NOT EXISTS tta_task_revision
  ON public.team_task_acknowledgments (task_id, task_revision, athlete_id, requirement);

ALTER TABLE public.team_task_acknowledgments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.team_task_acknowledgments FROM PUBLIC;
REVOKE ALL ON TABLE public.team_task_acknowledgments FROM anon;
REVOKE ALL ON TABLE public.team_task_acknowledgments FROM authenticated;
REVOKE ALL ON TABLE public.team_task_acknowledgments FROM service_role;
GRANT SELECT, INSERT ON TABLE public.team_task_acknowledgments TO service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Append-only guard
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.team_task_acknowledgments_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'team_task_acknowledgments_append_only';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'team_task_acknowledgments_append_only';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF current_setting('elf.team_task_ack_write', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'team_task_acknowledgments_write_via_function_only';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.team_tasks t
      WHERE t.id = NEW.task_id AND t.campaign_slug = NEW.campaign_slug
    ) THEN
      RAISE EXCEPTION 'team_task_acknowledgments_team_mismatch';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: only athlete_id/member_id being cleared because the row it
  -- pointed at was deleted (ON DELETE SET NULL). Everything else,
  -- including the account_id snapshot, is immutable.
  IF (NEW.id, NEW.campaign_slug, NEW.task_id, NEW.task_revision, NEW.requirement,
      NEW.account_id, NEW.full_name, NEW.member_name_snapshot, NEW.athlete_name_snapshot,
      NEW.task_title_snapshot, NEW.statement_version, NEW.statement_text, NEW.acknowledged_at)
     IS DISTINCT FROM
     (OLD.id, OLD.campaign_slug, OLD.task_id, OLD.task_revision, OLD.requirement,
      OLD.account_id, OLD.full_name, OLD.member_name_snapshot, OLD.athlete_name_snapshot,
      OLD.task_title_snapshot, OLD.statement_version, OLD.statement_text, OLD.acknowledged_at)
  THEN
    RAISE EXCEPTION 'team_task_acknowledgments_append_only';
  END IF;

  IF NEW.athlete_id IS DISTINCT FROM OLD.athlete_id AND (
       NEW.athlete_id IS NOT NULL
       OR EXISTS (SELECT 1 FROM public.athletes a WHERE a.id = OLD.athlete_id)
  ) THEN
    RAISE EXCEPTION 'team_task_acknowledgments_append_only';
  END IF;

  IF NEW.member_id IS DISTINCT FROM OLD.member_id AND (
       NEW.member_id IS NOT NULL
       OR EXISTS (SELECT 1 FROM public.team_members m WHERE m.id = OLD.member_id)
  ) THEN
    RAISE EXCEPTION 'team_task_acknowledgments_append_only';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS team_task_acknowledgments_guard ON public.team_task_acknowledgments;
CREATE TRIGGER team_task_acknowledgments_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.team_task_acknowledgments
  FOR EACH ROW EXECUTE FUNCTION public.team_task_acknowledgments_guard();

DROP TRIGGER IF EXISTS team_task_acknowledgments_no_truncate ON public.team_task_acknowledgments;
CREATE TRIGGER team_task_acknowledgments_no_truncate
  BEFORE TRUNCATE ON public.team_task_acknowledgments
  FOR EACH STATEMENT EXECUTE FUNCTION public.team_task_acknowledgments_guard();

-- ═══════════════════════════════════════════════════════════════════════
-- 3. Helpers
-- ═══════════════════════════════════════════════════════════════════════

-- The approved acknowledgment statement, by version. A wording change is a
-- new version here; existing rows keep the exact text they agreed to.
CREATE OR REPLACE FUNCTION public.team_task_ack_statement(p_version integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_version
    WHEN 1 THEN 'I acknowledge that I have reviewed and understand the information, instructions, links, and documents associated with this task.'
  END;
$$;

-- Is this member linked to this athlete, in this role, on this team, now?
-- athlete: the athlete's own team_members row (role athlete, athlete_id).
-- parent:  a parent row linked by the legacy athlete_id column or by
--          team_member_athletes (second/third child). Same relationship
--          model as src/lib/familyRelationships.ts.
CREATE OR REPLACE FUNCTION public.team_task_ack_member_linked(
  p_member_id     uuid,
  p_athlete_id    uuid,
  p_requirement   text,
  p_campaign_slug text
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_members m
    JOIN public.athletes a
      ON a.id = p_athlete_id AND a.campaign_slug = p_campaign_slug
    WHERE m.id = p_member_id
      AND m.campaign_slug = p_campaign_slug
      AND p_requirement IN ('athlete', 'parent')
      AND m.role = p_requirement
      AND (
        m.athlete_id = p_athlete_id
        OR (
          p_requirement = 'parent'
          AND EXISTS (
            SELECT 1 FROM public.team_member_athletes l
            WHERE l.team_member_id = m.id AND l.athlete_id = p_athlete_id
          )
        )
      )
  );
$$;

-- Does a stored acknowledgment (made by p_member_id while it belonged to
-- p_account_id) still count for this athlete and role? Only while that
-- member row still exists, still belongs to the same account, and is still
-- linked. Used for every "satisfied" decision, so submission and status
-- can never disagree.
CREATE OR REPLACE FUNCTION public.team_task_ack_counts(
  p_member_id     uuid,
  p_account_id    uuid,
  p_athlete_id    uuid,
  p_requirement   text,
  p_campaign_slug text
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT p_member_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.team_members m
      WHERE m.id = p_member_id
        AND m.account_id IS NOT DISTINCT FROM p_account_id
    )
    AND public.team_task_ack_member_linked(p_member_id, p_athlete_id, p_requirement, p_campaign_slug);
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. team_task_acknowledge()
-- ═══════════════════════════════════════════════════════════════════════
-- Records one person's acknowledgment of one task revision, for one or
-- more athletes (a parent's linked children; an athlete's own record).
-- All-or-nothing: any failed check raises and nothing is written.
--
-- Returns one row per athlete:
--   recorded          a new acknowledgment was written
--   already_satisfied the requirement was already met for this revision by
--                     a currently linked member (this person included);
--                     nothing written — retries and double-taps are no-ops
--
-- Concurrency:
--   * The task row is locked FOR SHARE, which conflicts with any UPDATE of
--     it. A concurrent edit that bumps the revision either commits first
--     (this call then sees the new revision and fails with
--     team_task_ack_revision_changed) or waits until this call commits
--     (the rows written here correctly record the old revision).
--   * The athletes (FOR KEY SHARE), the member row (FOR SHARE) and the
--     member's team_member_athletes links to them (FOR KEY SHARE) are
--     locked before the link check. A concurrent unlink, member deletion,
--     role/athlete/account change or athlete deletion either commits
--     first (this call then sees it and is refused) or waits until this
--     call commits (and the acknowledgment then stops counting, per
--     team_task_ack_counts). Lock order athletes -> member -> links
--     matches the order a delete cascades in.
--   * A transaction-scoped advisory lock per (task, athlete, requirement),
--     taken in athlete-id order, serializes two people acknowledging the
--     same requirement at once: exactly one is recorded, the other gets
--     already_satisfied. Two parents of the same child can therefore never
--     both be recorded for the same revision.
CREATE OR REPLACE FUNCTION public.team_task_acknowledge(
  p_task_id            uuid,
  p_campaign_slug      text,
  p_expected_revision  integer,
  p_requirement        text,
  p_athlete_ids        uuid[],
  p_member_id          uuid,
  p_account_id         uuid,
  p_full_name          text,
  p_statement_version  integer
)
RETURNS TABLE (athlete_id uuid, outcome text, acknowledgment_id uuid)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_name       text;
  v_statement  text;
  v_task       public.team_tasks%ROWTYPE;
  v_member     public.team_members%ROWTYPE;
  v_athletes   uuid[];
  v_athlete_id uuid;
  v_existing   uuid;
  v_new_id     uuid;
BEGIN
  IF p_requirement IS NULL OR p_requirement NOT IN ('athlete', 'parent') THEN
    RAISE EXCEPTION 'team_task_ack_invalid_requirement';
  END IF;

  -- Typed full name: trimmed, inner whitespace collapsed, 2-120 chars, no
  -- control characters.
  v_name := regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g');
  IF char_length(v_name) NOT BETWEEN 2 AND 120 OR v_name ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'team_task_ack_invalid_name';
  END IF;

  v_statement := public.team_task_ack_statement(p_statement_version);
  IF v_statement IS NULL THEN
    RAISE EXCEPTION 'team_task_ack_unknown_statement';
  END IF;

  -- Task: on this team, active, requires this role, at the reviewed revision.
  SELECT * INTO v_task
  FROM public.team_tasks t
  WHERE t.id = p_task_id AND t.campaign_slug = p_campaign_slug
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'team_task_ack_task_not_found';
  END IF;
  IF v_task.status <> 'active' THEN
    RAISE EXCEPTION 'team_task_ack_task_inactive';
  END IF;
  IF NOT (v_task.audience = 'both' OR v_task.audience = p_requirement) THEN
    RAISE EXCEPTION 'team_task_ack_not_required';
  END IF;
  IF p_expected_revision IS DISTINCT FROM v_task.revision THEN
    RAISE EXCEPTION 'team_task_ack_revision_changed';
  END IF;

  SELECT array_agg(DISTINCT x ORDER BY x) INTO v_athletes
  FROM unnest(p_athlete_ids) AS x
  WHERE x IS NOT NULL;
  IF v_athletes IS NULL OR cardinality(v_athletes) = 0 THEN
    RAISE EXCEPTION 'team_task_ack_no_athletes';
  END IF;
  IF cardinality(v_athletes) > 50 THEN
    RAISE EXCEPTION 'team_task_ack_too_many_athletes';
  END IF;

  -- Hold the relationship steady until this transaction ends (see above).
  PERFORM 1 FROM public.athletes a
  WHERE a.id = ANY (v_athletes)
  ORDER BY a.id
  FOR KEY SHARE;

  -- Person: a member of this team, with this role, owned by the account
  -- the app authenticated (both NULL only for a legacy team-login member).
  SELECT * INTO v_member
  FROM public.team_members m
  WHERE m.id = p_member_id AND m.campaign_slug = p_campaign_slug
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'team_task_ack_member_not_found';
  END IF;
  IF v_member.account_id IS DISTINCT FROM p_account_id THEN
    RAISE EXCEPTION 'team_task_ack_identity_mismatch';
  END IF;
  IF v_member.role IS DISTINCT FROM p_requirement THEN
    RAISE EXCEPTION 'team_task_ack_role_mismatch';
  END IF;

  PERFORM 1 FROM public.team_member_athletes l
  WHERE l.team_member_id = p_member_id AND l.athlete_id = ANY (v_athletes)
  ORDER BY l.id
  FOR KEY SHARE;

  -- Athletes: every one on this team and linked right now.
  FOREACH v_athlete_id IN ARRAY v_athletes LOOP
    IF NOT public.team_task_ack_member_linked(p_member_id, v_athlete_id, p_requirement, p_campaign_slug) THEN
      RAISE EXCEPTION 'team_task_ack_athlete_not_linked';
    END IF;
  END LOOP;

  PERFORM set_config('elf.team_task_ack_write', 'on', true);

  FOREACH v_athlete_id IN ARRAY v_athletes LOOP
    PERFORM pg_advisory_xact_lock(
      hashtextextended('team_task_ack:' || p_task_id::text || ':' || v_athlete_id::text || ':' || p_requirement, 0)
    );

    SELECT k.id INTO v_existing
    FROM public.team_task_acknowledgments k
    WHERE k.task_id = p_task_id
      AND k.task_revision = v_task.revision
      AND k.athlete_id = v_athlete_id
      AND k.requirement = p_requirement
      AND public.team_task_ack_counts(k.member_id, k.account_id, v_athlete_id, p_requirement, p_campaign_slug)
    ORDER BY k.acknowledged_at, k.id
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      athlete_id := v_athlete_id;
      outcome := 'already_satisfied';
      acknowledgment_id := v_existing;
      RETURN NEXT;
      CONTINUE;
    END IF;

    INSERT INTO public.team_task_acknowledgments (
      campaign_slug, task_id, task_revision, requirement,
      athlete_id, member_id, account_id,
      full_name, member_name_snapshot, athlete_name_snapshot, task_title_snapshot,
      statement_version, statement_text
    )
    SELECT
      p_campaign_slug, p_task_id, v_task.revision, p_requirement,
      v_athlete_id, v_member.id, v_member.account_id,
      v_name, v_member.name, coalesce(a.name, ''), v_task.title,
      p_statement_version, v_statement
    FROM public.athletes a
    WHERE a.id = v_athlete_id
    RETURNING id INTO v_new_id;

    athlete_id := v_athlete_id;
    outcome := 'recorded';
    acknowledgment_id := v_new_id;
    RETURN NEXT;
  END LOOP;

  PERFORM set_config('elf.team_task_ack_write', 'off', true);
  RETURN;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 5. team_task_ack_status()
-- ═══════════════════════════════════════════════════════════════════════
-- One row per (active task, athlete, required role) on a team, optionally
-- filtered to some athletes and/or tasks. The single definition of
-- "satisfied" that every view uses. Returns names — the app decides who
-- may see them (coaches: names; families: their own family only).
CREATE OR REPLACE FUNCTION public.team_task_ack_status(
  p_campaign_slug text,
  p_athlete_ids   uuid[] DEFAULT NULL,
  p_task_ids      uuid[] DEFAULT NULL
)
RETURNS TABLE (
  task_id                       uuid,
  task_revision                 integer,
  athlete_id                    uuid,
  requirement                   text,
  satisfied                     boolean,
  acknowledgment_id             uuid,
  acknowledged_by_member_id     uuid,
  acknowledged_full_name        text,
  acknowledged_member_name      text,
  acknowledged_at               timestamptz,
  has_eligible_member           boolean,
  earlier_revision_acknowledged boolean
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH t AS (
    SELECT tt.id, tt.revision, tt.audience
    FROM public.team_tasks tt
    WHERE tt.campaign_slug = p_campaign_slug
      AND tt.status = 'active'
      AND (p_task_ids IS NULL OR tt.id = ANY (p_task_ids))
  ),
  a AS (
    SELECT at.id
    FROM public.athletes at
    WHERE at.campaign_slug = p_campaign_slug
      AND (p_athlete_ids IS NULL OR at.id = ANY (p_athlete_ids))
  ),
  r AS (
    SELECT t.id AS task_id, t.revision, a.id AS athlete_id, req.requirement
    FROM t
    CROSS JOIN a
    CROSS JOIN (VALUES ('athlete'), ('parent')) AS req(requirement)
    WHERE t.audience = 'both' OR t.audience = req.requirement
  )
  SELECT
    r.task_id,
    r.revision,
    r.athlete_id,
    r.requirement,
    (s.id IS NOT NULL),
    s.id,
    s.member_id,
    s.full_name,
    s.member_name_snapshot,
    s.acknowledged_at,
    EXISTS (
      SELECT 1
      FROM public.team_members m
      WHERE m.campaign_slug = p_campaign_slug
        AND m.role = r.requirement
        AND public.team_task_ack_member_linked(m.id, r.athlete_id, r.requirement, p_campaign_slug)
    ),
    EXISTS (
      SELECT 1
      FROM public.team_task_acknowledgments k
      WHERE k.task_id = r.task_id
        AND k.task_revision < r.revision
        AND k.athlete_id = r.athlete_id
        AND k.requirement = r.requirement
        AND public.team_task_ack_counts(k.member_id, k.account_id, r.athlete_id, r.requirement, p_campaign_slug)
    )
  FROM r
  LEFT JOIN LATERAL (
    SELECT k.id, k.member_id, k.full_name, k.member_name_snapshot, k.acknowledged_at
    FROM public.team_task_acknowledgments k
    WHERE k.task_id = r.task_id
      AND k.task_revision = r.revision
      AND k.athlete_id = r.athlete_id
      AND k.requirement = r.requirement
      AND public.team_task_ack_counts(k.member_id, k.account_id, r.athlete_id, r.requirement, p_campaign_slug)
    ORDER BY k.acknowledged_at, k.id
    LIMIT 1
  ) s ON true;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 6. Function privileges
-- ═══════════════════════════════════════════════════════════════════════

REVOKE ALL     ON FUNCTION public.team_task_acknowledgments_guard() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.team_task_acknowledgments_guard() FROM anon;
REVOKE EXECUTE ON FUNCTION public.team_task_acknowledgments_guard() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.team_task_acknowledgments_guard() FROM service_role;

REVOKE ALL     ON FUNCTION public.team_task_ack_statement(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.team_task_ack_statement(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.team_task_ack_statement(integer) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.team_task_ack_statement(integer) TO service_role;

REVOKE ALL     ON FUNCTION public.team_task_ack_member_linked(uuid, uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.team_task_ack_member_linked(uuid, uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.team_task_ack_member_linked(uuid, uuid, text, text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.team_task_ack_member_linked(uuid, uuid, text, text) TO service_role;

REVOKE ALL     ON FUNCTION public.team_task_ack_counts(uuid, uuid, uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.team_task_ack_counts(uuid, uuid, uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.team_task_ack_counts(uuid, uuid, uuid, text, text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.team_task_ack_counts(uuid, uuid, uuid, text, text) TO service_role;

REVOKE ALL     ON FUNCTION public.team_task_acknowledge(uuid, text, integer, text, uuid[], uuid, uuid, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.team_task_acknowledge(uuid, text, integer, text, uuid[], uuid, uuid, text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.team_task_acknowledge(uuid, text, integer, text, uuid[], uuid, uuid, text, integer) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.team_task_acknowledge(uuid, text, integer, text, uuid[], uuid, uuid, text, integer) TO service_role;

REVOKE ALL     ON FUNCTION public.team_task_ack_status(text, uuid[], uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.team_task_ack_status(text, uuid[], uuid[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.team_task_ack_status(text, uuid[], uuid[]) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.team_task_ack_status(text, uuid[], uuid[]) TO service_role;

COMMIT;
