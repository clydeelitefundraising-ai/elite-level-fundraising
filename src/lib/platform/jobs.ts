import { restList, restInsert, restUpdate } from "./_client";
import { runRules } from "./automation";

export type TriggerType = "manual" | "scheduled" | "system";
export type RunStatus   = "running" | "succeeded" | "failed";

export type AutomationRun = {
  id:              string;
  job_key:         string;
  trigger_type:    TriggerType;
  status:          RunStatus;
  started_at:      string;
  finished_at:     string | null;
  duration_ms:     number | null;
  rules_evaluated: number;
  events_created:  number;
  events_resolved: number;
  error_message:   string | null;
  metadata:        Record<string, unknown>;
};

export type JobRunSummary = {
  lastRunStatus:     RunStatus | null;
  lastRunAt:         string | null;
  failedRuns:        number;
  averageDurationMs: number;
};

export type AutomationJobResult = {
  runId:          string | null;
  status:         "succeeded" | "failed";
  rulesEvaluated: number;
  eventsCreated:  number;
  eventsResolved: number;
  durationMs:     number;
  error:          string | null;
};

const AUTOMATION_JOB_KEY = "automation_rules";

// All writes here are best-effort: if the automation_runs table doesn't exist
// yet (migration not applied), these quietly no-op instead of throwing, so
// the underlying rule execution (runAutomationJob -> runRules) still works.

export async function startJobRun(
  jobKey: string,
  triggerType: TriggerType,
  metadata: Record<string, unknown> = {},
): Promise<AutomationRun | null> {
  try {
    const rows = await restInsert<AutomationRun>("automation_runs", {
      job_key: jobKey, trigger_type: triggerType, status: "running", metadata,
    });
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function finishJobRun(
  runId: string,
  result: { rulesEvaluated: number; eventsCreated: number; eventsResolved: number; durationMs: number },
): Promise<void> {
  try {
    await restUpdate(`automation_runs?id=eq.${encodeURIComponent(runId)}`, {
      status:          "succeeded",
      finished_at:     new Date().toISOString(),
      duration_ms:     result.durationMs,
      rules_evaluated: result.rulesEvaluated,
      events_created:  result.eventsCreated,
      events_resolved: result.eventsResolved,
    });
  } catch {
    // best-effort — the rule run itself already succeeded
  }
}

export async function failJobRun(runId: string, error: string, durationMs: number): Promise<void> {
  try {
    await restUpdate(`automation_runs?id=eq.${encodeURIComponent(runId)}`, {
      status:        "failed",
      finished_at:   new Date().toISOString(),
      duration_ms:   durationMs,
      error_message: error,
    });
  } catch {
    // best-effort
  }
}

export async function getRecentJobRuns(limit = 20): Promise<AutomationRun[]> {
  return restList<AutomationRun>(`automation_runs?select=*&order=started_at.desc&limit=${limit}`);
}

export async function getJobRunSummary(): Promise<JobRunSummary> {
  const runs = await getRecentJobRuns(50);
  const last = runs[0]; // already sorted by started_at desc
  const finished = runs.filter(r => r.duration_ms != null);
  const averageDurationMs = finished.length > 0
    ? Math.round(finished.reduce((s, r) => s + (r.duration_ms ?? 0), 0) / finished.length)
    : 0;

  return {
    lastRunStatus: last?.status ?? null,
    lastRunAt:     last?.started_at ?? null,
    failedRuns:    runs.filter(r => r.status === "failed").length,
    averageDurationMs,
  };
}

// Wraps the existing automation rule execution (platform/automation.ts's
// runRules) with run tracking. Does not duplicate rule-evaluation logic —
// this is purely the "record what happened" layer around it.
export async function runAutomationJob(
  triggerType: TriggerType,
  metadata: Record<string, unknown> = {},
): Promise<AutomationJobResult> {
  const start = Date.now();
  const run = await startJobRun(AUTOMATION_JOB_KEY, triggerType, metadata);

  try {
    const result = await runRules();
    const durationMs = Date.now() - start;
    if (run) await finishJobRun(run.id, { ...result, durationMs });

    return {
      runId:          run?.id ?? null,
      status:         "succeeded",
      rulesEvaluated: result.rulesEvaluated,
      eventsCreated:  result.eventsCreated,
      eventsResolved: result.eventsResolved,
      durationMs,
      error:          null,
    };
  } catch (err) {
    const durationMs = Date.now() - start;
    const message = err instanceof Error ? err.message : "Unknown error";
    if (run) await failJobRun(run.id, message, durationMs);

    return {
      runId: run?.id ?? null,
      status: "failed",
      rulesEvaluated: 0,
      eventsCreated: 0,
      eventsResolved: 0,
      durationMs,
      error: message,
    };
  }
}
