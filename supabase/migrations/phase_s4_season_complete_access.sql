-- Complete Season — Phase 4 (app "Phase 5A/5B"): let the app server run the
-- season transition, through ONE checked entry point.
--
-- The app server (service_role) gets EXECUTE on a new wrapper,
-- public.team_season_complete_checked(), and NOT on team_season_complete()
-- itself (that stays owner-only, as phase_s1 left it). The wrapper adds two
-- things the raw function doesn't do, without touching its body:
--
--   1. Authorization BEFORE replay. team_season_complete() returns a stored
--      result for a repeated idempotency key before it checks the actor. The
--      wrapper checks the actor first (team_season_actor: an account-linked
--      Head Coach of THIS season, or a platform admin), so an unrelated
--      account can't learn anything from a confirmation id. For a season
--      that is ALREADY completed (a retry after a lost response), a Head
--      Coach must also still be an account-linked Head Coach of the
--      successor season — the archived season's rows are immutable history,
--      so revocation only shows up there — and a platform admin must still
--      exist. A revoked account gets season_actor_not_authorized, never the
--      receipt.
--   2. No successor credentials in results. The new season's join code is
--      removed from every result, including replays (the Head Coach sees it
--      in the new season's settings like any other join code).
--
-- Everything else is the unchanged phase_s1 transition: one transaction,
-- row lock, replay of a repeated key, stale fingerprint, confirmation phrase,
-- already-completed and every blocker checked before anything is written.
-- Helpers, the fingerprint and replay stay owner-only; anon and
-- authenticated get nothing.
--
-- The app server must build p_actor from its verified session only
-- (src/lib/seasonComplete.ts), never from the client, and only calls this
-- when COMPLETE_SEASON_EXECUTE is on (off by default).
--
-- Requires phase_s3_season_preview_access.sql. Re-runnable.

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.team_season_complete(text,jsonb,text,text,text,uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'phase_s4 requires phase_s1_complete_season.sql to be applied first';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.team_season_preview(text,jsonb,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'phase_s4 requires phase_s3_season_preview_access.sql to be applied first';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.team_season_complete_checked(
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
AS $$
DECLARE
  actor        record;
  v_successor  text;
  v_result     jsonb;
BEGIN
  -- 1. Who is asking, checked against the season being completed (raises
  --    season_actor_invalid / _not_authorized / _account_required).
  SELECT * INTO actor FROM public.team_season_actor(p_actor, p_from_slug);

  -- 2. Already completed: only someone who still runs the team may read the
  --    receipt of that completion.
  SELECT successor_campaign_slug INTO v_successor
  FROM public.campaign_settings WHERE campaign_slug = p_from_slug;
  IF v_successor IS NOT NULL AND actor.actor_kind = 'head_coach'
     AND NOT EXISTS (SELECT 1 FROM public.team_coaches c
                     WHERE c.campaign_slug = v_successor AND c.role = 'head_coach'
                       AND c.account_id = actor.actor_account_id) THEN
    RAISE EXCEPTION 'season_actor_not_authorized';
  END IF;

  -- 3. The unchanged transition (or its replay).
  v_result := public.team_season_complete(p_from_slug, p_actor, p_to_slug, p_to_season_label,
                                          p_expected_fingerprint, p_idempotency_key, p_confirmation);

  -- 4. Never hand out the successor's join code.
  RETURN v_result - 'join_code';
END;
$$;

-- The raw transition stays owner-only (also undoes an earlier draft of this
-- migration that granted it to service_role).
REVOKE ALL     ON FUNCTION public.team_season_complete(text, jsonb, text, text, text, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.team_season_complete(text, jsonb, text, text, text, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.team_season_complete(text, jsonb, text, text, text, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.team_season_complete(text, jsonb, text, text, text, uuid, text) FROM service_role;

REVOKE ALL     ON FUNCTION public.team_season_complete_checked(text, jsonb, text, text, text, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.team_season_complete_checked(text, jsonb, text, text, text, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.team_season_complete_checked(text, jsonb, text, text, text, uuid, text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.team_season_complete_checked(text, jsonb, text, text, text, uuid, text) TO service_role;

COMMIT;
