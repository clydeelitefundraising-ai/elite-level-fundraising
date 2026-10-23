-- Complete Season — Phase 4 (app "Phase 5A"): let the app server run the
-- season transition.
--
-- Exactly one permission is added: service_role (the app server's key) may
-- EXECUTE public.team_season_complete(). Nothing else changes:
--   * the function body, its checks and its single-transaction behavior are
--     untouched (phase_s1): it locks the season row, replays a repeated
--     idempotency key, re-checks the actor (an account-linked Head Coach of
--     THIS team, or a platform admin), recomputes the preview and refuses a
--     stale fingerprint, a wrong confirmation phrase, an already-completed
--     season and every blocker — all before it writes anything;
--   * team_season_fingerprint(), team_season_replay() and every helper stay
--     owner-only (the function is SECURITY DEFINER, so it reaches them with
--     owner rights; granting them to service_role would widen far more);
--   * anon and authenticated get nothing.
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
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.team_season_complete(text,jsonb,text,text,text,uuid,text)'::regprocedure) THEN
    RAISE EXCEPTION 'phase_s4 expects team_season_complete to be SECURITY DEFINER (phase_s1)';
  END IF;
END $$;

REVOKE ALL     ON FUNCTION public.team_season_complete(text, jsonb, text, text, text, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.team_season_complete(text, jsonb, text, text, text, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.team_season_complete(text, jsonb, text, text, text, uuid, text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.team_season_complete(text, jsonb, text, text, text, uuid, text) TO service_role;

COMMIT;
