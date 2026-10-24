-- Complete Season — EMERGENCY uninstall of phase_s1..s4 (database only).
--
-- Only for recovery right after the release, if the new schema itself causes
-- a problem. It removes exactly what phase_s1_complete_season.sql,
-- phase_s2_completed_season_read_only.sql, phase_s3_season_preview_access.sql
-- and phase_s4_season_complete_access.sql added, and nothing else.
--
-- It REFUSES to run once any season has been completed (a completed season,
-- its successor link or an audit row would be lost) — then follow
-- docs/COMPLETE_SEASON_REVERSAL.md instead.
--
-- Before running it: the app must not depend on the schema any more, i.e.
-- COMPLETE_SEASON_PREVIEW and COMPLETE_SEASON_EXECUTE are unset and
-- redeployed, or production is rolled back to the pre-merge deployment.
--
-- One transaction: any error leaves the database exactly as it was. Safe to
-- run twice. The last statement prints what is left (expected: all zeros).
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.team_season_transitions') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.team_season_transitions) THEN
      RAISE EXCEPTION 'uninstall refused: a season has been completed (team_season_transitions has rows) — see docs/COMPLETE_SEASON_REVERSAL.md';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'campaign_settings' AND column_name = 'season_completed_at') THEN
    IF EXISTS (SELECT 1 FROM public.campaign_settings
               WHERE season_completed_at IS NOT NULL OR successor_campaign_slug IS NOT NULL
                  OR predecessor_campaign_slug IS NOT NULL OR season_started_at IS NOT NULL) THEN
      RAISE EXCEPTION 'uninstall refused: a team has season lineage (completed, successor or predecessor) — see docs/COMPLETE_SEASON_REVERSAL.md';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'athletes' AND column_name = 'previous_season_athlete_id') THEN
    IF EXISTS (SELECT 1 FROM public.athletes WHERE previous_season_athlete_id IS NOT NULL) THEN
      RAISE EXCEPTION 'uninstall refused: athletes are linked to a previous season — see docs/COMPLETE_SEASON_REVERSAL.md';
    END IF;
  END IF;
END $$;

-- phase_s2: read-only triggers on the team tables + the attendance start guard.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND t.tgname = 'season_write_guard' AND NOT t.tgisinternal
  LOOP
    EXECUTE format('DROP TRIGGER season_write_guard ON public.%I', r.relname);
  END LOOP;
END $$;
DROP TRIGGER IF EXISTS team_attendance_season_start_guard ON public.team_attendance_sessions;

-- phase_s1: the audit table (its own triggers go with it).
DROP TABLE IF EXISTS public.team_season_transitions;

-- phase_s1..s4: every function they created (none existed before them).
DO $$
DECLARE
  f regprocedure;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY (ARRAY[
      'season_fk_cascaded', 'season_fk_cleared', 'season_fk_target_exists', 'season_flag_reason',
      'season_is_completed', 'season_label_end_year', 'season_new_join_code', 'season_next_class',
      'season_next_label', 'season_next_slug', 'season_row_slug', 'season_slug_valid',
      'season_write_guard', 'season_write_purpose', 'team_attendance_season_start_guard',
      'team_season_actor', 'team_season_athlete_plan', 'team_season_complete', 'team_season_complete_checked',
      'team_season_fingerprint', 'team_season_member_plan', 'team_season_preview', 'team_season_replay',
      'team_season_transitions_guard'])
  LOOP
    EXECUTE format('DROP FUNCTION %s', f);
  END LOOP;
END $$;

-- phase_s1: lineage columns (their indexes, checks and foreign keys go with them).
DROP INDEX IF EXISTS public.campaign_settings_successor_uniq;
DROP INDEX IF EXISTS public.campaign_settings_predecessor_uniq;
DROP INDEX IF EXISTS public.campaign_settings_program_idx;
DROP INDEX IF EXISTS public.athletes_previous_season_uniq;
ALTER TABLE public.campaign_settings DROP CONSTRAINT IF EXISTS campaign_settings_not_own_successor;
ALTER TABLE public.campaign_settings DROP CONSTRAINT IF EXISTS campaign_settings_not_own_predecessor;
ALTER TABLE public.campaign_settings
  DROP COLUMN IF EXISTS successor_campaign_slug,
  DROP COLUMN IF EXISTS predecessor_campaign_slug,
  DROP COLUMN IF EXISTS season_completed_at,
  DROP COLUMN IF EXISTS season_started_at,
  DROP COLUMN IF EXISTS program_id;
ALTER TABLE public.athletes DROP COLUMN IF EXISTS previous_season_athlete_id;

COMMIT;

SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public'
     AND ((table_name = 'campaign_settings' AND column_name IN ('program_id','season_started_at','season_completed_at','predecessor_campaign_slug','successor_campaign_slug'))
       OR (table_name = 'athletes' AND column_name = 'previous_season_athlete_id'))) AS columns_left,
  (SELECT count(*) FROM pg_trigger WHERE tgname IN ('season_write_guard', 'team_attendance_season_start_guard')) AS triggers_left,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND (p.proname LIKE 'season\_%' OR p.proname LIKE 'team\_season\_%' OR p.proname = 'team_attendance_season_start_guard')) AS functions_left,
  (to_regclass('public.team_season_transitions') IS NOT NULL)::int AS audit_table_left;
