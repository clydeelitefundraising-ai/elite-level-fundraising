import type { AutomationEvent as PlatformAutomationEvent, AutomationSummary } from "@/lib/platform/automation";
import type { AutomationRun, JobRunSummary } from "@/lib/platform/jobs";

export type { AutomationSeverity, AutomationStatus, AutomationSummary } from "@/lib/platform/automation";
export type { AutomationRun, RunStatus, TriggerType, JobRunSummary } from "@/lib/platform/jobs";

// Adds display-only fields resolved server-side (campaign/coach names).
export type AutomationEvent = PlatformAutomationEvent & {
  campaignName?: string | null;
  coachName?:    string | null;
};

export type AutomationData = {
  events:     AutomationEvent[];
  summary:    AutomationSummary;
  runs:       AutomationRun[];
  jobSummary: JobRunSummary;
};
