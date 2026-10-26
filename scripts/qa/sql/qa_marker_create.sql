-- ELF QA marker: run ONCE on a brand-new, EMPTY database, through
-- scripts/qa/apply-schema.sh (psql variables :expected_ref and :mode).
-- Refuses any database that already has application tables — so it can
-- never mark an existing (e.g. production) database as QA, even if the
-- connection guard were bypassed.
\set ON_ERROR_STOP on
\set QUIET on
SELECT set_config('elf_qa.expected_ref', :'expected_ref', false) AS ignored \gset
SELECT set_config('elf_qa.mode', :'mode', false) AS ignored \gset
DO $$
BEGIN
  IF to_regclass('elf_qa.marker') IS NOT NULL THEN
    RAISE EXCEPTION 'elf_qa_marker_exists: this database is already marked';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_tables WHERE schemaname = 'public') THEN
    RAISE EXCEPTION 'elf_qa_database_not_empty: refusing to mark a database that already has public tables';
  END IF;
  IF current_setting('elf_qa.mode') NOT IN ('qa', 'local-rehearsal') THEN
    RAISE EXCEPTION 'elf_qa_bad_mode';
  END IF;
  IF current_setting('elf_qa.expected_ref') = 'nggabucgcoaffpppchsp' THEN
    RAISE EXCEPTION 'elf_qa_production_ref_refused';
  END IF;
END $$;

BEGIN;
CREATE SCHEMA elf_qa;
-- Exactly one row: which environment and project this database is.
CREATE TABLE elf_qa.marker (
  singleton    boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  environment  text NOT NULL CHECK (environment IN ('qa', 'local-rehearsal')),
  project_ref  text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
-- Every install step applied, with the file's SHA-256 (re-runs skip
-- applied steps; a changed file is refused).
CREATE TABLE elf_qa.applied (
  step        text PRIMARY KEY,
  sha256      text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  applied_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO elf_qa.marker (environment, project_ref)
  VALUES (current_setting('elf_qa.mode'), current_setting('elf_qa.expected_ref'));
-- Not exposed through the API (PostgREST serves "public" only) and not
-- readable by any API role.
REVOKE ALL ON SCHEMA elf_qa FROM PUBLIC;
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA elf_qa FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA elf_qa FROM %I', r);
    END IF;
  END LOOP;
END $$;
COMMIT;
