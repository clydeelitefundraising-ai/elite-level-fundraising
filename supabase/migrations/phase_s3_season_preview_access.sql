-- Complete Season — Phase 3: let the app server run the READ-ONLY preview.
--
-- Exactly one permission is added: service_role (the app server's key) may
-- EXECUTE public.team_season_preview(). Nothing else changes:
--   * team_season_complete() stays callable by NO API role (no transition
--     can be started from the app in this phase);
--   * team_season_fingerprint() and every helper stay owner-only;
--   * anon and authenticated get nothing.
--
-- team_season_preview() becomes SECURITY DEFINER (owner rights, empty
-- search_path, fully qualified references — unchanged body) so this single
-- grant is enough: it calls owner-only helpers (team_season_actor,
-- team_season_athlete_plan, team_season_member_plan, team_season_fingerprint,
-- season_slug_valid, season_label_end_year, season_flag_reason and
-- attendance's team_attendance_try_uuid). Granting each of those to
-- service_role instead would widen far more than this.
--
-- The function is STABLE and writes nothing. It still checks its p_actor
-- (an account-linked Head Coach of THIS team, or a platform admin) and
-- refuses everyone else; the app server must build p_actor from its
-- verified session only (src/lib/seasonPreview.ts), never from the client.
-- Names in the preview (flagged athletes, people who must rejoin) therefore
-- only ever reach an authorized Head Coach or platform admin.
--
-- Requires phase_s1_complete_season.sql. Re-runnable.

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.team_season_preview(text,jsonb,text,text)') IS NULL THEN
    RAISE EXCEPTION 'phase_s3 requires phase_s1_complete_season.sql to be applied first';
  END IF;
END $$;

ALTER FUNCTION public.team_season_preview(text, jsonb, text, text) SECURITY DEFINER;
ALTER FUNCTION public.team_season_preview(text, jsonb, text, text) SET search_path = '';

REVOKE ALL     ON FUNCTION public.team_season_preview(text, jsonb, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.team_season_preview(text, jsonb, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.team_season_preview(text, jsonb, text, text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.team_season_preview(text, jsonb, text, text) TO service_role;

COMMIT;
