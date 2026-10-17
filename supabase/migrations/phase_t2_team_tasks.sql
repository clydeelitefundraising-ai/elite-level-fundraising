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
--   revision  What families are being asked to do. Phase 3
--             acknowledgments will record the revision they acknowledged;
--             an acknowledgment of an older revision no longer counts.
--             The DATABASE decides when it increases — app code cannot
--             skip it:
--               * title, instructions, body_text or audience changed
--                 -> team_tasks_guard() bumps it on ANY update path
--               * the SET of linked URLs / attached files changed
--                 -> team_task_update() bumps it, comparing the old and
--                    new sets in the same transaction that replaces them;
--                    team_task_resources can only be written through
--                    team_task_create()/team_task_update(), so the set
--                    can't change any other way
--             Never bumped by: reordering tasks, reordering a task's links
--             and files, editing a link's display label, archiving or
--             restoring. At most +1 per update. It can never decrease.
--   version   Bumped by every edit through team_task_update(); used only
--             for optimistic concurrency (two coaches editing at once —
--             the second save is rejected instead of overwriting).
--             Reordering and archiving do not bump it.
--
-- ── Security ───────────────────────────────────────────────────────────
-- RLS enabled with no policies, same as every other app table: only the
-- service role (the app server) can read or write. Functions are
-- SECURITY INVOKER with search_path = '' and fully schema-qualified
-- references; EXECUTE is revoked from PUBLIC, anon and authenticated by
-- name (Supabase auto-grants EXECUTE on new public functions to
-- anon/authenticated — see phase_a31) so only service_role can call them.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. team_tasks
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.team_tasks (
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
  ON public.team_tasks (campaign_slug, status, sort_order, created_at);

-- On every UPDATE of a task, by any path:
--   * a task never moves to another team
--   * revision never decreases
--   * a change to title / instructions / body_text / audience bumps
--     revision by exactly one (unless this same update already bumped it,
--     e.g. team_task_update() for a changed link/file set — still +1 total)
CREATE OR REPLACE FUNCTION public.team_tasks_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.campaign_slug IS DISTINCT FROM OLD.campaign_slug THEN
    RAISE EXCEPTION 'team_task_team_immutable';
  END IF;
  IF NEW.revision < OLD.revision THEN
    RAISE EXCEPTION 'team_task_revision_decrease';
  END IF;
  IF NEW.revision = OLD.revision AND (
       NEW.title        IS DISTINCT FROM OLD.title
    OR NEW.instructions IS DISTINCT FROM OLD.instructions
    OR NEW.body_text    IS DISTINCT FROM OLD.body_text
    OR NEW.audience     IS DISTINCT FROM OLD.audience
  ) THEN
    NEW.revision   := OLD.revision + 1;
    NEW.revised_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS team_tasks_guard ON public.team_tasks;
CREATE TRIGGER team_tasks_guard
  BEFORE UPDATE ON public.team_tasks
  FOR EACH ROW EXECUTE FUNCTION public.team_tasks_guard();

ALTER TABLE public.team_tasks ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.team_tasks TO anon;
GRANT ALL ON TABLE public.team_tasks TO authenticated;
GRANT ALL ON TABLE public.team_tasks TO service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. team_task_resources
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.team_task_resources (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id        uuid        NOT NULL REFERENCES public.team_tasks(id) ON DELETE CASCADE,
  -- Denormalized from the task so the same-team guard below (and any
  -- future report) can check team scope without a join.
  campaign_slug  text        NOT NULL,
  kind           text        NOT NULL,
  url            text,
  -- RESTRICT, same as clearance_resources.attachment_id: a file a task
  -- still uses cannot be deleted from Files; remove it from the task first.
  attachment_id  uuid        REFERENCES public.team_files(id) ON DELETE RESTRICT,
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
  ON public.team_task_resources (task_id, sort_order);
-- Supports the ON DELETE RESTRICT check when a team file is deleted.
CREATE INDEX IF NOT EXISTS team_task_resources_attachment_idx
  ON public.team_task_resources (attachment_id)
  WHERE attachment_id IS NOT NULL;
-- The same file can't be attached to one task twice.
CREATE UNIQUE INDEX IF NOT EXISTS team_task_resources_task_attachment_uniq
  ON public.team_task_resources (task_id, attachment_id)
  WHERE attachment_id IS NOT NULL;

-- Resources may only be written by team_task_create()/team_task_update()
-- (which set the transaction-local flag elf.team_task_write = 'on'), so a
-- task's link/file set can never change without the revision check.
-- Inserted/updated rows must also belong to their task's team, and an
-- attached file must be one of that same team's files (the API checks
-- this too). The one DELETE allowed without the flag is the ON DELETE
-- CASCADE from deleting the task itself (the task row is already gone).
CREATE OR REPLACE FUNCTION public.team_task_resources_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF pg_catalog.current_setting('elf.team_task_write', true) IS DISTINCT FROM 'on'
       AND EXISTS (SELECT 1 FROM public.team_tasks t WHERE t.id = OLD.task_id) THEN
      RAISE EXCEPTION 'team_task_resources_write_via_functions_only';
    END IF;
    RETURN OLD;
  END IF;

  IF pg_catalog.current_setting('elf.team_task_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'team_task_resources_write_via_functions_only';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.team_tasks t
    WHERE t.id = NEW.task_id AND t.campaign_slug = NEW.campaign_slug
  ) THEN
    RAISE EXCEPTION 'team_task_resource_team_mismatch';
  END IF;
  IF NEW.attachment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.team_files f
    WHERE f.id = NEW.attachment_id AND f.campaign_slug = NEW.campaign_slug
  ) THEN
    RAISE EXCEPTION 'team_task_resource_file_not_on_team';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS team_task_resources_guard ON public.team_task_resources;
CREATE TRIGGER team_task_resources_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.team_task_resources
  FOR EACH ROW EXECUTE FUNCTION public.team_task_resources_guard();

ALTER TABLE public.team_task_resources ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.team_task_resources TO anon;
GRANT ALL ON TABLE public.team_task_resources TO authenticated;
GRANT ALL ON TABLE public.team_task_resources TO service_role;

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

-- A task's link/file set as a sorted, de-duplicated array of
-- 'link:<url>' / 'file:<uuid>' — order and labels deliberately excluded.
CREATE OR REPLACE FUNCTION public.team_task_resource_set(p_resources jsonb)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(pg_catalog.array_agg(DISTINCT fp ORDER BY fp), '{}'::text[])
  FROM (
    SELECT CASE WHEN r->>'kind' = 'file'
                THEN 'file:' || ((r->>'attachment_id')::uuid)::text
                ELSE 'link:' || (r->>'url')
           END AS fp
    FROM pg_catalog.jsonb_array_elements(COALESCE(p_resources, '[]'::jsonb)) AS x(r)
  ) s;
$$;

CREATE OR REPLACE FUNCTION public.team_task_create(
  p_campaign_slug text,
  p_task          jsonb,
  p_resources     jsonb,
  p_actor         jsonb
)
RETURNS public.team_tasks
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_task public.team_tasks;
  v_next integer;
BEGIN
  PERFORM pg_catalog.set_config('elf.team_task_write', 'on', true);

  SELECT COALESCE(MAX(sort_order) + 1, 0) INTO v_next
  FROM public.team_tasks
  WHERE campaign_slug = p_campaign_slug AND status = 'active';

  INSERT INTO public.team_tasks (
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

  INSERT INTO public.team_task_resources (task_id, campaign_slug, kind, url, attachment_id, label, sort_order)
  SELECT v_task.id, p_campaign_slug,
         r->>'kind',
         NULLIF(r->>'url', ''),
         NULLIF(r->>'attachment_id', '')::uuid,
         NULLIF(r->>'label', ''),
         (ord - 1)::integer
  FROM pg_catalog.jsonb_array_elements(COALESCE(p_resources, '[]'::jsonb)) WITH ORDINALITY AS x(r, ord);

  PERFORM pg_catalog.set_config('elf.team_task_write', 'off', true);
  RETURN v_task;
END;
$$;

-- An earlier draft of this migration had an extra p_bump_revision
-- argument; drop that signature if it was ever created so only the
-- database-enforced version below exists. (Never applied to production.)
DROP FUNCTION IF EXISTS public.team_task_update(uuid, text, integer, boolean, jsonb, jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.team_task_update(
  p_task_id          uuid,
  p_campaign_slug    text,
  p_expected_version integer,
  p_task             jsonb,
  p_resources        jsonb,
  p_actor            jsonb
)
RETURNS public.team_tasks
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_task             public.team_tasks;
  v_old_set          text[];
  v_resources_changed boolean;
BEGIN
  SELECT * INTO v_task
  FROM public.team_tasks
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

  -- Compare the stored link/file SET with the new one before replacing it.
  SELECT public.team_task_resource_set(COALESCE(pg_catalog.jsonb_agg(
           pg_catalog.jsonb_build_object('kind', kind, 'url', url, 'attachment_id', attachment_id)), '[]'::jsonb))
    INTO v_old_set
  FROM public.team_task_resources
  WHERE task_id = p_task_id;
  v_resources_changed := v_old_set IS DISTINCT FROM public.team_task_resource_set(p_resources);

  PERFORM pg_catalog.set_config('elf.team_task_write', 'on', true);

  -- revision: +1 here for a changed link/file set; team_tasks_guard adds
  -- +1 for a changed title/instructions/body_text/audience only if this
  -- update hasn't already bumped it — so at most +1 per edit.
  UPDATE public.team_tasks SET
    title                        = p_task->>'title',
    instructions                 = NULLIF(p_task->>'instructions', ''),
    body_text                    = NULLIF(p_task->>'body_text', ''),
    audience                     = p_task->>'audience',
    version                      = version + 1,
    revision                     = revision + CASE WHEN v_resources_changed THEN 1 ELSE 0 END,
    revised_at                   = CASE WHEN v_resources_changed THEN now() ELSE revised_at END,
    updated_at                   = now(),
    updated_by_account_id        = NULLIF(p_actor->>'account_id', '')::uuid,
    updated_by_coach_id          = NULLIF(p_actor->>'coach_id', '')::uuid,
    updated_by_platform_admin_id = NULLIF(p_actor->>'platform_admin_id', '')::uuid,
    updated_by_name              = NULLIF(p_actor->>'name', '')
  WHERE id = p_task_id
  RETURNING * INTO v_task;

  DELETE FROM public.team_task_resources WHERE task_id = p_task_id;

  INSERT INTO public.team_task_resources (task_id, campaign_slug, kind, url, attachment_id, label, sort_order)
  SELECT p_task_id, p_campaign_slug,
         r->>'kind',
         NULLIF(r->>'url', ''),
         NULLIF(r->>'attachment_id', '')::uuid,
         NULLIF(r->>'label', ''),
         (ord - 1)::integer
  FROM pg_catalog.jsonb_array_elements(COALESCE(p_resources, '[]'::jsonb)) WITH ORDINALITY AS x(r, ord);

  PERFORM pg_catalog.set_config('elf.team_task_write', 'off', true);
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
SET search_path = ''
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
  PERFORM 1 FROM public.team_tasks
  WHERE campaign_slug = p_campaign_slug AND status = 'active'
  FOR UPDATE;

  SELECT pg_catalog.array_agg(id ORDER BY sort_order, created_at, id) INTO v_ids
  FROM public.team_tasks
  WHERE campaign_slug = p_campaign_slug AND status = 'active';

  v_pos := pg_catalog.array_position(v_ids, p_task_id);
  IF v_pos IS NULL THEN
    RAISE EXCEPTION 'team_task_not_found';
  END IF;

  v_swap := CASE WHEN p_direction = 'up' THEN v_pos - 1 ELSE v_pos + 1 END;
  IF v_swap >= 1 AND v_swap <= pg_catalog.array_length(v_ids, 1) THEN
    v_tmp          := v_ids[v_pos];
    v_ids[v_pos]   := v_ids[v_swap];
    v_ids[v_swap]  := v_tmp;
  END IF;

  UPDATE public.team_tasks t
  SET sort_order = s.ord - 1
  FROM pg_catalog.unnest(v_ids) WITH ORDINALITY AS s(id, ord)
  WHERE t.id = s.id AND t.sort_order IS DISTINCT FROM (s.ord - 1)::integer;
END;
$$;

-- ── Least privilege: only service_role may execute ──────────────────────
REVOKE ALL     ON FUNCTION public.team_task_create(text, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.team_task_create(text, jsonb, jsonb, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.team_task_create(text, jsonb, jsonb, jsonb) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.team_task_create(text, jsonb, jsonb, jsonb) TO service_role;

REVOKE ALL     ON FUNCTION public.team_task_update(uuid, text, integer, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.team_task_update(uuid, text, integer, jsonb, jsonb, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.team_task_update(uuid, text, integer, jsonb, jsonb, jsonb) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.team_task_update(uuid, text, integer, jsonb, jsonb, jsonb) TO service_role;

REVOKE ALL     ON FUNCTION public.team_task_move(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.team_task_move(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.team_task_move(uuid, text, text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.team_task_move(uuid, text, text) TO service_role;

-- Internal helper (used by team_task_update) — not callable via the API.
REVOKE ALL     ON FUNCTION public.team_task_resource_set(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.team_task_resource_set(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.team_task_resource_set(jsonb) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.team_task_resource_set(jsonb) TO service_role;

-- Trigger functions are invoked by the trigger, never called directly.
REVOKE ALL     ON FUNCTION public.team_tasks_guard()          FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.team_tasks_guard()          FROM anon;
REVOKE EXECUTE ON FUNCTION public.team_tasks_guard()          FROM authenticated;
REVOKE ALL     ON FUNCTION public.team_task_resources_guard() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.team_task_resources_guard() FROM anon;
REVOKE EXECUTE ON FUNCTION public.team_task_resources_guard() FROM authenticated;
