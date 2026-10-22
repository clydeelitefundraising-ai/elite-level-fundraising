-- Catalog fingerprint of the objects Phase 2 adds (compared after the first
-- run and after a rerun).
\set QUIET on
SELECT v FROM (
  SELECT 'trg ' || tgrelid::regclass || '.' || tgname || ':' || tgenabled::text || ':' || encode(tgargs, 'escape') || ':' || tgtype::text v
    FROM pg_trigger WHERE tgname IN ('season_write_guard', 'team_attendance_season_start_guard')
  UNION ALL SELECT 'fn ' || p.oid::regprocedure::text || ':' || md5(prosrc) || ':' || coalesce(proacl::text, '') || ':'
    || coalesce(array_to_string(proconfig, ','), '') || ':' || prosecdef || ':' || provolatile::text
    FROM pg_proc p WHERE pronamespace = 'public'::regnamespace AND proname IN ('season_write_guard', 'team_attendance_season_start_guard',
      'season_is_completed', 'season_write_purpose', 'season_fk_target_exists', 'season_fk_cleared', 'season_fk_cascaded', 'season_row_slug')
) s ORDER BY 1;
