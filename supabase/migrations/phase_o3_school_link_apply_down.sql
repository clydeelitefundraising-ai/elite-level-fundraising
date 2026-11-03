-- Reverses phase_o3_school_link_apply.sql.
--   * season_write_guard() goes back to its exact phase_s2 body (the
--     school-link exception is removed; completed seasons are fully
--     read-only again, including organization_id)
--   * school_link_apply() is dropped
-- Existing school links (organization_id values) are left as they are.
-- Audit rows written by school_link_apply are kept (audit_logs is
-- append-only). Idempotent.

BEGIN;

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

DROP FUNCTION IF EXISTS public.school_link_apply(jsonb, text, uuid, jsonb, jsonb);

COMMIT;
