-- School-Account Linking — Phase B (completed seasons + atomic apply).
--
--   season_write_guard()   one narrow, metadata-only exception (below)
--   school_link_apply()    the ONLY way a Platform Admin school link is
--                          written: validates, updates and audits in ONE
--                          transaction (all selected seasons or none)
--
-- ── Why ─────────────────────────────────────────────────────────────────
-- campaign_settings.organization_id records which school a team-season
-- belongs to. A completed season (season_completed_at or a successor) is
-- read-only: phase_s2's season_write_guard() refuses EVERY update to its
-- campaign_settings row. That also froze its school link, so a completed
-- season could never be linked, changed or unlinked.
--
-- ── The exception (season_write_guard) ─────────────────────────────────
-- The function body is phase_s2's, unchanged except for ONE added block in
-- the UPDATE branch: when the transaction-local flag elf.school_link = 'on'
-- AND the table is campaign_settings AND the ONLY column that changed is
-- organization_id, the update is allowed. Everything else on a completed
-- season stays refused — any other column (status, successor, goals,
-- dates, …), any other table (roster, attendance, messaging, fundraising
-- …), inserts and deletes. The flag is set only by school_link_apply()
-- below (set_config(…, true): transaction-local, reset before it returns;
-- an error rolls it back with everything else). Same trust model as the
-- existing elf.season_transition / elf.team_attendance_write flags: only
-- SECURITY DEFINER functions set them; PostgREST callers can't run SQL.
--
-- ── school_link_apply(p_actor, p_team_slug, p_organization_id, p_seasons, p_request)
-- Called by the app server (service_role) after it has verified the
-- caller's elf_session belongs to a Platform Admin. The database re-checks
-- the identity it is given (a platform_admins row matching both ids) —
-- it can't see cookies, so the server must build p_actor only from its
-- verified session. In ONE transaction it:
--   1. validates the actor, the input and the target school (never
--      creates one; NULL = unlink)
--   2. locks the selected seasons (FOR UPDATE, in slug order — concurrent
--      requests on the same seasons wait, never interleave)
--   3. recomputes the team's season chain (successor_campaign_slug, both
--      directions, from p_team_slug) and refuses seasons outside it
--   4. compares each season's CURRENT organization_id with the value the
--      preview showed (expected_organization_id): any difference refuses
--      the whole request (school_link_stale)
--   5. writes one audit_logs row per changed season, then updates
--      organization_id on exactly those seasons
-- Any error rolls back all of it: no season changes and no audit row is
-- kept unless every selected season changes. Errors are fixed codes only.
--
-- ── Privileges ─────────────────────────────────────────────────────────
-- school_link_apply: EXECUTE for service_role only (anon/authenticated/
-- PUBLIC revoked). season_write_guard keeps phase_s2's privileges
-- (CREATE OR REPLACE preserves them).
--
-- ADDITIVE except for the guard body (one block added). Idempotent.
-- Reverse with phase_o3_school_link_apply_down.sql.

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.season_write_guard()') IS NULL THEN
    RAISE EXCEPTION 'phase_o3 requires phase_s2_completed_season_read_only.sql to be applied first';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- 1. season_write_guard — phase_s2 body + the school-link exception
-- ═══════════════════════════════════════════════════════════════════════
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
    -- phase_o3: a Platform Admin school link (school_link_apply sets the
    -- flag) may change organization_id — and ONLY organization_id — on a
    -- completed season's own campaign_settings row.
    IF TG_TABLE_NAME = 'campaign_settings'
       AND current_setting('elf.school_link', true) = 'on'
       AND v_changed = ARRAY['organization_id'] THEN
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

-- ═══════════════════════════════════════════════════════════════════════
-- 2. school_link_apply
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.school_link_apply(
  p_actor           jsonb,
  p_team_slug       text,
  p_organization_id uuid,
  p_seasons         jsonb,
  p_request         jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id    uuid;
  v_account_id  uuid;
  v_email       text;
  v_name        text;
  v_selected    text[];
  v_expected    jsonb := '{}'::jsonb;
  v_item        jsonb;
  v_slug        text;
  v_chain       text[];
  v_locked      int;
  v_t_name      text;
  v_t_app       boolean := false;
  v_t_public    boolean := false;
  v_changing    text[] := '{}';
  v_n           int;
BEGIN
  -- 1. Actor: a real Platform Admin (both ids must match one row).
  BEGIN
    v_admin_id   := (p_actor ->> 'platform_admin_id')::uuid;
    v_account_id := (p_actor ->> 'account_id')::uuid;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'school_link_actor_invalid';
  END;
  IF v_admin_id IS NULL OR v_account_id IS NULL THEN
    RAISE EXCEPTION 'school_link_actor_invalid';
  END IF;
  SELECT a.email, a.name INTO v_email, v_name
  FROM public.platform_admins pa
  JOIN public.elf_accounts a ON a.id = pa.account_id
  WHERE pa.id = v_admin_id AND pa.account_id = v_account_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'school_link_actor_not_authorized';
  END IF;

  -- Input.
  IF p_team_slug IS NULL OR p_team_slug !~ '^[a-z0-9][a-z0-9-]{0,99}$' THEN
    RAISE EXCEPTION 'school_link_invalid';
  END IF;
  IF jsonb_typeof(p_seasons) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_seasons) < 1 OR jsonb_array_length(p_seasons) > 40 THEN
    RAISE EXCEPTION 'school_link_invalid';
  END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_seasons) LOOP
    v_slug := v_item ->> 'campaign_slug';
    IF v_slug IS NULL OR v_slug !~ '^[a-z0-9][a-z0-9-]{0,99}$' OR v_expected ? v_slug
       OR NOT (v_item ? 'expected_organization_id')
       OR jsonb_typeof(v_item -> 'expected_organization_id') NOT IN ('string', 'null')
       OR (jsonb_typeof(v_item -> 'expected_organization_id') = 'string'
           AND (v_item ->> 'expected_organization_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
      RAISE EXCEPTION 'school_link_invalid';
    END IF;
    v_expected := v_expected || jsonb_build_object(v_slug, v_item -> 'expected_organization_id');
  END LOOP;
  SELECT array_agg(k ORDER BY k) INTO v_selected FROM jsonb_object_keys(v_expected) k;

  -- Target school: must exist; never created. Locked so it can't vanish.
  IF p_organization_id IS NOT NULL THEN
    SELECT o.school_name, coalesce(o.show_community_partners, false), coalesce(o.show_community_partners_public, false)
      INTO v_t_name, v_t_app, v_t_public
    FROM public.organizations o WHERE o.id = p_organization_id FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'school_link_organization_not_found';
    END IF;
  END IF;

  -- 2. Lock the selected seasons (slug order: no deadlock between requests).
  SELECT count(*) INTO v_locked FROM (
    SELECT 1 FROM public.campaign_settings c
    WHERE c.campaign_slug = ANY (v_selected)
    ORDER BY c.campaign_slug
    FOR UPDATE
  ) l;
  IF v_locked <> cardinality(v_selected) THEN
    RAISE EXCEPTION 'school_link_season_not_in_team';
  END IF;

  -- 3. The team's season chain, recomputed now (after the locks).
  IF NOT EXISTS (SELECT 1 FROM public.campaign_settings c WHERE c.campaign_slug = p_team_slug) THEN
    RAISE EXCEPTION 'school_link_team_not_found';
  END IF;
  WITH RECURSIVE fwd(slug, depth) AS (
    SELECT p_team_slug, 0
    UNION
    SELECT c.successor_campaign_slug, f.depth + 1
    FROM public.campaign_settings c JOIN fwd f ON c.campaign_slug = f.slug
    WHERE c.successor_campaign_slug IS NOT NULL AND f.depth < 40
  ), bwd(slug, depth) AS (
    SELECT p_team_slug, 0
    UNION
    SELECT c.campaign_slug, b.depth + 1
    FROM public.campaign_settings c JOIN bwd b ON c.successor_campaign_slug = b.slug
    WHERE b.depth < 40
  )
  SELECT array_agg(DISTINCT s.slug) INTO v_chain
  FROM (SELECT slug FROM fwd UNION SELECT slug FROM bwd) s
  WHERE EXISTS (SELECT 1 FROM public.campaign_settings c WHERE c.campaign_slug = s.slug);
  IF NOT (v_selected <@ v_chain) THEN
    RAISE EXCEPTION 'school_link_season_not_in_team';
  END IF;

  -- 4. Stale check: every season must still have the previewed school.
  IF EXISTS (
    SELECT 1 FROM public.campaign_settings c
    WHERE c.campaign_slug = ANY (v_selected)
      AND c.organization_id IS DISTINCT FROM (v_expected ->> c.campaign_slug)::uuid
  ) THEN
    RAISE EXCEPTION 'school_link_stale';
  END IF;

  SELECT coalesce(array_agg(c.campaign_slug ORDER BY c.campaign_slug), '{}') INTO v_changing
  FROM public.campaign_settings c
  WHERE c.campaign_slug = ANY (v_selected) AND c.organization_id IS DISTINCT FROM p_organization_id;
  IF cardinality(v_changing) = 0 THEN
    RAISE EXCEPTION 'school_link_nothing_to_change';
  END IF;

  -- 5. Audit (one row per changed season), then the update — same transaction.
  INSERT INTO public.audit_logs
    (admin_identifier, action, entity_type, entity_id, campaign_slug, summary,
     previous_value, new_value, ip_address, user_agent, actor_type, actor_id, actor_email)
  SELECT
    v_email,
    CASE WHEN p_organization_id IS NULL THEN 'school_link.unlink' ELSE 'school_link.set' END,
    'campaign_settings', c.campaign_slug, c.campaign_slug,
    CASE
      WHEN p_organization_id IS NULL THEN 'School unlinked from ' || c.campaign_slug
      WHEN c.organization_id IS NULL THEN 'School linked for ' || c.campaign_slug || ': ' || v_t_name
      ELSE 'School changed for ' || c.campaign_slug || ': ' || v_t_name
    END
      || CASE WHEN c.season_completed_at IS NOT NULL OR c.successor_campaign_slug IS NOT NULL THEN ' (completed season)' ELSE '' END,
    jsonb_build_object(
      'organization_id', c.organization_id, 'school', prev.school_name,
      'community_partners', jsonb_build_object('teamApp', coalesce(prev.show_community_partners, false), 'publicPage', coalesce(prev.show_community_partners_public, false))),
    jsonb_build_object(
      'organization_id', p_organization_id, 'school', v_t_name,
      'community_partners', jsonb_build_object('teamApp', v_t_app, 'publicPage', v_t_public)),
    left(p_request ->> 'ip_address', 100), left(p_request ->> 'user_agent', 500),
    'platform_admin', v_admin_id, v_email
  FROM public.campaign_settings c
  LEFT JOIN public.organizations prev ON prev.id = c.organization_id
  WHERE c.campaign_slug = ANY (v_changing);

  PERFORM set_config('elf.school_link', 'on', true);
  UPDATE public.campaign_settings c
  SET organization_id = p_organization_id
  WHERE c.campaign_slug = ANY (v_changing);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM set_config('elf.school_link', 'off', true);
  IF v_n <> cardinality(v_changing) THEN
    RAISE EXCEPTION 'school_link_stale';
  END IF;

  RETURN jsonb_build_object(
    'updated', to_jsonb(v_changing),
    'unchanged', to_jsonb(ARRAY(SELECT unnest(v_selected) EXCEPT SELECT unnest(v_changing) ORDER BY 1))
  );
END;
$$;

REVOKE ALL     ON FUNCTION public.school_link_apply(jsonb, text, uuid, jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.school_link_apply(jsonb, text, uuid, jsonb, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.school_link_apply(jsonb, text, uuid, jsonb, jsonb) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.school_link_apply(jsonb, text, uuid, jsonb, jsonb) TO service_role;

COMMIT;
