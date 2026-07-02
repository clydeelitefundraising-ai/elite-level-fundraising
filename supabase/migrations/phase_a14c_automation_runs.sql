-- Phase A14C: Job Scheduler & Run History
--
-- Tracks every execution of the automation rule engine (manual, scheduled,
-- or system-triggered) so admins can see history and failures before
-- email/push/SMS delivery is added in a future phase.

CREATE TABLE IF NOT EXISTS automation_runs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_key          text NOT NULL,
  trigger_type     text NOT NULL CHECK (trigger_type IN ('manual', 'scheduled', 'system')),
  status           text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'failed')),
  started_at       timestamptz NOT NULL DEFAULT now(),
  finished_at      timestamptz,
  duration_ms      integer,
  rules_evaluated  integer NOT NULL DEFAULT 0,
  events_created   integer NOT NULL DEFAULT 0,
  events_resolved  integer NOT NULL DEFAULT 0,
  error_message    text,
  metadata         jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS automation_runs_job_key_idx      ON automation_runs (job_key);
CREATE INDEX IF NOT EXISTS automation_runs_trigger_type_idx ON automation_runs (trigger_type);
CREATE INDEX IF NOT EXISTS automation_runs_status_idx       ON automation_runs (status);
CREATE INDEX IF NOT EXISTS automation_runs_started_at_idx   ON automation_runs (started_at DESC);
