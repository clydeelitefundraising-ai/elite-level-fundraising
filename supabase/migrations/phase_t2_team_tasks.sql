-- Team Management Phase 2: Clearance -> To-Do List — task tables.
--
-- Adds Head-Coach-managed To-Do tasks alongside the existing Clearance
-- resources (which become the "Resources" section of the To-Do List tab).
--
--   team_tasks           one task per row, team-scoped by campaign_slug
--   team_task_resources  a task's links and documents (team_files)
--   team_task_create()   atomic create: task + its resources
--   team_task_update()   atomic edit with optimistic concurrency
--   team_task_move()     atomic up/down reorder among active tasks
--
-- ADDITIVE ONLY. clearance_resources and every other existing table,
-- column and row are untouched; no data is written. Safe to run before or
-- after the app deploy: the app treats the To-Do task tables as "not set
-- up yet" while they are missing and keeps the Resources section working.
--
-- ── Revision vs version ────────────────────────────────────────────────
-- team_tasks carries two counters with different jobs:
--
--   revision  Bumped only by a SUBSTANTIVE change to what families are
--             asked to do: title, instructions, body text, audience, or
--             the set of linked URLs / attached files. Phase 3
--             acknowledgments will record the revision they acknowledged;
--             an acknowledgment of an older revision no longer counts, so
--             families are asked again. Reordering, archiving/restoring
--             and link-label edits never change it.
--   version   Bumped by every edit through team_task_update(); used only
--             for optimistic concurrency (two coaches editing at once —
--             the second save is rejected instead of overwriting).
--             Reordering and archiving do not bump it either, so they
--             never cause a spurious edit conflict.
--
-- Which edits are substantive is decided in app code
-- (src/lib/teamTasks.ts: isSubstantiveTaskChange) and passed in as
-- p_bump_revision; team_tasks_guard() makes revision monotonic.
--
-- ── Security ───────────────────────────────────────────────────────────
-- RLS enabled with no policies, same as every other app table: only the
-- service role (the app server) can read or write. Functions are
-- SECURITY INVOKER with a fixed search_path, and EXECUTE is revoked from
-- PUBLIC, anon and authenticated by name (Supabase auto-grants EXECUTE on
-- new public functions to anon/authenticated — see phase_a31) so only
-- service_role can call them.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. team_tasks
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS team_tasks (
  id                            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_slug                 text        NOT NULL,
  title                         text        NOT NULL,
  instructions                  text,
  body_text                     text,
  audience                      text        NOT NULL,
  status                        text        NOT NULL DEFAULT 'active',
  sort_order                    integer     NOT NULL DEFAULT 0,
  revision                      integer     NOT NULL DEFAULT 1,
  revised_at                    timestamptz NOT NULL DEFAULT now(),
  version                       integer     NOT NULL DEFAULT 1,
  -- Who created / last edited. Exactly the identities the app has:
  -- an ELF account (may be null for a legacy team-login coach), the
  -- team_coaches row, or a platform admin; plus a display-name snapshot
  -- so history survives the identity rows being removed.
  created_by_account_id         uuid        REFERENCES elf_accounts(id)    ON DELETE SET NULL,
  created_by_coach_id           uuid        REFERENCES team_coaches(id)    ON DELETE SET NULL,
  created_by_platform_admin_id  uuid        REFERENCES platform_admins(id) ON DELETE SET NULL,
  created_by_name               text,
  updated_by_account_id         uuid        REFERENCES elf_accounts(id)    ON DELETE SET NULL,
  updated_by_coach_id           uuid        REFERENCES team_coaches(id)    ON DELETE SET NULL,
  updated_by_platform_admin_id  uuid        REFERENCES platform_admins(id) ON DELETE SET NULL,
  updated_by_name               text,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  archived_at                   timestamptz,

  CONSTRAINT team_tasks_audience_check CHECK (audience IN ('athlete', 'parent', 'both')),
  CONSTRAINT team_tasks_status_check   CHECK (status IN ('active', 'archived')),
  CONSTRAINT team_tasks_archived_at_matches_status
    CHECK ((status = 'archived') = (archived_at IS NOT NULL)),
  CONSTRAINT team_tasks_title_length
    CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT team_tasks_instructions_length
    CHECK (instructions IS NULL OR char_length(instructions) <= 5000),
  CONSTRAINT team_tasks_body_text_length
    CHECK (body_text IS NULL OR char_length(body_text) <= 20000),
  CONSTRAINT team_tasks_revision_positive CHECK (revision >= 1),
  CONSTRAINT team_tasks_version_positive  CHECK (version >= 1)
);

-- To-Do tab listing: "this team's tasks of a status, in display order".
CREATE INDEX IF NOT EXISTS team_tasks_campaign_status_order_idx
  ON team_tasks (campaign_slug, status, sort_order, created_at);

-- revision never decreases and a task never moves to another team.
CREATE OR REPLACE FUNCTION public.team_tasks_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.campaign_slug IS DISTINCT FROM OLD.campaign_slug THEN
    RAISE EXCEPTION 'team_task_team_immutable';
  END IF;
  IF NEW.revision < OLD.revision THEN
    RAISE EXCEPTION 'team_task_revision_decrease';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS team_tasks_guard ON team_tasks;
CREATE TRIGGER team_tasks_guard
  BEFORE UPDATE ON team_tasks
  FOR EACH ROW EXECUTE FUNCTION public.team_tasks_guard();

ALTER TABLE team_tasks ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE team_tasks TO anon;
GRANT ALL ON TABLE team_tasks TO authenticated;
GRANT ALL ON TABLE team_tasks TO service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. team_task_resources
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS team_task_resources (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id        uuid        NOT NULL REFERENCES team_tasks(id) ON DELETE CASCADE,
  -- Denormalized from the task so the same-team guard below (and any
  -- future report) can check team scope without a join.
  campaign_slug  text        NOT NULL,
  kind           text        NOT NULL,
  url            text,
  -- RESTRICT, same as clearance_resources.attachment_id: a file a task
  -- still uses cannot be deleted from Files; remove it from the task first.
  attachment_id  uuid        REFERENCES team_files(id) ON DELETE RESTRICT,
  label          text,
  sort_order     integer     NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT team_task_resources_kind_check CHECK (kind IN ('link', 'file')),
  CONSTRAINT team_task_resources_kind_shape CHECK (
    (kind = 'link' AND url IS NOT NULL AND attachment_id IS NULL
       AND url ~* '^https?://[^[:space:]]+$' AND char_length(url) <= 2048)
    OR
    (kind = 'file' AND attachment_id IS NOT NULL AND url IS NULL)
  ),
  CONSTRAINT team_task_resources_label_length
    CHECK (label IS NULL OR char_length(label) <= 200)
);

CREATE INDEX IF NOT EXISTS team_task_resources_task_idx
  ON team_task_resources (task_id, sort_order);
-- Supports the ON DELETE RESTRICT check when a team file is deleted.
CREATE INDEX IF NOT EXISTS team_task_resources_attachment_idx
  ON team_task_resources (attachment_id)
  WHERE attachment_id IS NOT NULL;
-- The same file can't be attached to one task twice.
CREATE UNIQUE INDEX IF NOT EXISTS team_task_resources_task_attachment_uniq
  ON team_task_resources (task_id, attachment_id)
  WHERE attachment_id IS NOT NULL;

-- Defense in depth for cross-team access (the API checks this too): a
-- resource must belong to its task's team, and an attached file must be
-- one of that same team's files.
CREATE OR REPLACE FUNCTION public.team_task_resources_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM team_tasks t
    WHERE t.id = NEW.task_id AND t.campaign_slug = NEW.campaign_slug
  ) THEN
    RAISE EXCEPTION 'team_task_resource_team_mismatch';
  END IF;
  IF NEW.attachment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM team_files f
    WHERE f.id = NEW.attachment_id AND f.campaign_slug = NEW.campaign_slug
  ) THEN
    RAISE EXCEPTION 'team_task_resource_file_not_on_team';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS team_task_resources_guard ON team_task_resources;
CREATE TRIGGER team_task_resources_guard
  BEFORE INSERT OR UPDATE ON team_task_resources
  FOR EACH ROW EXECUTE FUNCTION public.team_task_resources_guard();

ALTER TABLE team_task_resources ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE team_task_resources TO anon;
GRANT ALL ON TABLE team_task_resources TO authenticated;
GRANT ALL ON TABLE team_task_resources TO service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. Atomic write functions (called only by the app server via rpc/)
-- ═══════════════════════════════════════════════════════════════════════
--
-- p_task      {"title", "instructions", "body_text", "audience"}
-- p_resources [{"kind":"link","url","label"} | {"kind":"file","attachment_id","label"}, ...]
--             in display order
-- p_actor     {"account_id", "coach_id", "platform_admin_id", "name"}
--
-- Input is validated in app code first (src/lib/teamTasks.ts); the table
-- constraints and guards above are the backstop. Errors are raised with
-- stable messages the app maps to HTTP responses:
--   team_task_not_found, team_task_not_active, team_task_version_conflict,
--   team_task_bad_direction

CREATE OR REPLACE FUNCTION public.team_task_create(
  p_campaign_slug text,
  p_task          jsonb,
  p_resources     jsonb,
  p_actor         jsonb
)
RETURNS team_tasks
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_task team_tasks;
  v_next integer;
BEGIN
  SELECT COALESCE(MAX(sort_order) + 1, 0) INTO v_next
  FROM team_tasks
  WHERE campaign_slug = p_campaign_slug AND status = 'active';

  INSERT INTO team_tasks (
    campaign_slug, title, instructions, body_text, audience, sort_order,
    created_by_account_id, created_by_coach_id, created_by_platform_admin_id, created_by_name,
    updated_by_account_id, updated_by_coach_id, updated_by_platform_admin_id, updated_by_name
  ) VALUES (
    p_campaign_slug,
    p_task->>'title',
    NULLIF(p_task->>'instructions', ''),
    NULLIF(p_task->>'body_text', ''),
    p_task->>'audience',
    v_next,
    NULLIF(p_actor->>'account_id', '')::uuid,
    NULLIF(p_actor->>'coach_id', '')::uuid,
    NULLIF(p_actor->>'platform_admin_id', '')::uuid,
    NULLIF(p_actor->>'name', ''),
    NULLIF(p_actor->>'account_id', '')::uuid,
    NULLIF(p_actor->>'coach_id', '')::uuid,
    NULLIF(p_actor->>'platform_admin_id', '')::uuid,
    NULLIF(p_actor->>'name', '')
  )
  RETURNING * INTO v_task;

  INSERT INTO team_task_resources (task_id, campaign_slug, kind, url, attachment_id, label, sort_order)
  SELECT v_task.id, p_campaign_slug,
         r->>'kind',
         NULLIF(r->>'url', ''),
         NULLIF(r->>'attachment_id', '')::uuid,
         NULLIF(r->>'label', ''),
         (ord - 1)::integer
  FROM jsonb_array_elements(COALESCE(p_resources, '[]'::jsonb)) WITH ORDINALITY AS x(r, ord);

  RETURN v_task;
END;
$$;

CREATE OR REPLACE FUNCTION public.team_task_update(
  p_task_id          uuid,
  p_campaign_slug    text,
  p_expected_version integer,
  p_bump_revision    boolean,
  p_task             jsonb,
  p_resources        jsonb,
  p_actor            jsonb
)
RETURNS team_tasks
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_task team_tasks;
BEGIN
  SELECT * INTO v_task
  FROM team_tasks
  WHERE id = p_task_id AND campaign_slug = p_campaign_slug
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'team_task_not_found';
  END IF;
  IF v_task.status <> 'active' THEN
    RAISE EXCEPTION 'team_task_not_active';
  END IF;
  IF v_task.version <> p_expected_version THEN
    RAISE EXCEPTION 'team_task_version_conflict';
  END IF;

  UPDATE team_tasks SET
    title                        = p_task->>'title',
    instructions                 = NULLIF(p_task->>'instructions', ''),
    body_text                    = NULLIF(p_task->>'body_text', ''),
    audience                     = p_task->>'audience',
    version                      = version + 1,
    revision                     = revision + CASE WHEN p_bump_revision THEN 1 ELSE 0 END,
    revised_at                   = CASE WHEN p_bump_revision THEN now() ELSE revised_at END,
    updated_at                   = now(),
    updated_by_account_id        = NULLIF(p_actor->>'account_id', '')::uuid,
    updated_by_coach_id          = NULLIF(p_actor->>'coach_id', '')::uuid,
    updated_by_platform_admin_id = NULLIF(p_actor->>'platform_admin_id', '')::uuid,
    updated_by_name              = NULLIF(p_actor->>'name', '')
  WHERE id = p_task_id
  RETURNING * INTO v_task;

  DELETE FROM team_task_resources WHERE task_id = p_task_id;

  INSERT INTO team_task_resources (task_id, campaign_slug, kind, url, attachment_id, label, sort_order)
  SELECT p_task_id, p_campaign_slug,
         r->>'kind',
         NULLIF(r->>'url', ''),
         NULLIF(r->>'attachment_id', '')::uuid,
         NULLIF(r->>'label', ''),
         (ord - 1)::integer
  FROM jsonb_array_elements(COALESCE(p_resources, '[]'::jsonb)) WITH ORDINALITY AS x(r, ord);

  RETURN v_task;
END;
$$;

-- Swaps a task with its neighbour among the team's ACTIVE tasks and
-- renumbers them 0..n-1 (heals ties from concurrent creates). Changes
-- sort_order only — never revision, version or updated_at.
CREATE OR REPLACE FUNCTION public.team_task_move(
  p_task_id       uuid,
  p_campaign_slug text,
  p_direction     text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ids  uuid[];
  v_pos  integer;
  v_swap integer;
  v_tmp  uuid;
BEGIN
  IF p_direction NOT IN ('up', 'down') THEN
    RAISE EXCEPTION 'team_task_bad_direction';
  END IF;

  -- Serialize concurrent reorders on this team.
  PERFORM 1 FROM team_tasks
  WHERE campaign_slug = p_campaign_slug AND status = 'active'
  FOR UPDATE;

  SELECT array_agg(id ORDER BY sort_order, created_at, id) INTO v_ids
  FROM team_tasks
  WHERE campaign_slug = p_campaign_slug AND status = 'active';

  v_pos := array_position(v_ids, p_task_id);
  IF v_pos IS NULL THEN
    RAISE EXCEPTION 'team_task_not_found';
  END IF;

  v_swap := CASE WHEN p_direction = 'up' THEN v_pos - 1 ELSE v_pos + 1 END;
  IF v_swap >= 1 AND v_swap <= array_length(v_ids, 1) THEN
    v_tmp          := v_ids[v_pos];
    v_ids[v_pos]   := v_ids[v_swap];
    v_ids[v_swap]  := v_tmp;
  END IF;

  UPDATE team_tasks t
  SET sort_order = s.ord - 1
  FROM unnest(v_ids) WITH ORDINALITY AS s(id, ord)
  WHERE t.id = s.id AND t.sort_order IS DISTINCT FROM (s.ord - 1)::integer;
END;
$$;

-- ── Least privilege: only service_role may execute ──────────────────────
REVOKE ALL     ON FUNCTION public.team_task_create(text, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.team_task_create(text, jsonb, jsonb, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.team_task_create(text, jsonb, jsonb, jsonb) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.team_task_create(text, jsonb, jsonb, jsonb) TO service_role;

REVOKE ALL     ON FUNCTION public.team_task_update(uuid, text, integer, boolean, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.team_task_update(uuid, text, integer, boolean, jsonb, jsonb, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.team_task_update(uuid, text, integer, boolean, jsonb, jsonb, jsonb) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.team_task_update(uuid, text, integer, boolean, jsonb, jsonb, jsonb) TO service_role;

REVOKE ALL     ON FUNCTION public.team_task_move(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.team_task_move(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.team_task_move(uuid, text, text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.team_task_move(uuid, text, text) TO service_role;

-- Trigger functions are invoked by the trigger, never called directly.
REVOKE ALL     ON FUNCTION public.team_tasks_guard()          FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.team_tasks_guard()          FROM anon;
REVOKE EXECUTE ON FUNCTION public.team_tasks_guard()          FROM authenticated;
REVOKE ALL     ON FUNCTION public.team_task_resources_guard() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.team_task_resources_guard() FROM anon;
REVOKE EXECUTE ON FUNCTION public.team_task_resources_guard() FROM authenticated;
