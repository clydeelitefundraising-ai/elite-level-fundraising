-- Runs first in EVERY QA script session: the database must carry the ELF QA
-- marker for exactly the expected project (psql variable :expected_ref).
\set ON_ERROR_STOP on
\set QUIET on
SELECT set_config('elf_qa.expected_ref', :'expected_ref', false) AS ignored \gset
DO $$
DECLARE m record;
BEGIN
  IF to_regclass('elf_qa.marker') IS NULL THEN
    RAISE EXCEPTION 'elf_qa_marker_missing: not a verified ELF QA database';
  END IF;
  SELECT * INTO m FROM elf_qa.marker;
  IF m.project_ref IS DISTINCT FROM current_setting('elf_qa.expected_ref') THEN
    RAISE EXCEPTION 'elf_qa_marker_mismatch: this database is marked for a different project';
  END IF;
  IF m.project_ref = 'nggabucgcoaffpppchsp' THEN
    RAISE EXCEPTION 'elf_qa_production_ref_refused';
  END IF;
END $$;
