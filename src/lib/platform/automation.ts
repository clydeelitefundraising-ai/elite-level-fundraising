import { restList, restInsert, restUpdate } from "./_client";
import { evaluateAutomationRules, dedupKey, type AutomationCandidate } from "@/lib/automation/rules";

export type AutomationSeverity = "info" | "warning" | "critical";
export type AutomationStatus   = "open" | "acknowledged" | "resolved";

export type AutomationEvent = {
  id:             string;
  rule_key:       string;
  severity:       AutomationSeverity;
  campaign_slug:  string | null;
  coach_id:       string | null;
  crm_contact_id: string | null;
  title:          string;
  description:    string | null;
  status:         AutomationStatus;
  created_at:     string;
  resolved_at:    string | null;
};

export type AutomationSummary = {
  open:          number;
  critical:      number;
  warning:       number;
  info:          number;
  resolvedToday: number;
};

export type RunResult = {
  rulesEvaluated: number;
  eventsCreated:  number;
  eventsResolved: number;
  executionTimeMs: number;
};

export async function listEvents(limit = 1000): Promise<AutomationEvent[]> {
  return restList<AutomationEvent>(`automation_events?select=*&order=created_at.desc&limit=${limit}`);
}

export async function getOpenEvents(): Promise<AutomationEvent[]> {
  return restList<AutomationEvent>(
    "automation_events?status=eq.open&select=*&order=created_at.desc&limit=2000",
  );
}

export async function getSummary(): Promise<AutomationSummary> {
  const events = await listEvents(2000);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const open = events.filter(e => e.status === "open");
  return {
    open:          open.length,
    critical:      open.filter(e => e.severity === "critical").length,
    warning:       open.filter(e => e.severity === "warning").length,
    info:          open.filter(e => e.severity === "info").length,
    resolvedToday: events.filter(e => e.resolved_at && new Date(e.resolved_at) >= todayStart).length,
  };
}

// Creates an automation_event row if no open event already exists for the
// same rule + target (campaign/coach/contact). Returns null when skipped.
export async function createEvent(candidate: AutomationCandidate): Promise<AutomationEvent | null> {
  const existing = await restList<AutomationEvent>(
    `automation_events?status=eq.open&rule_key=eq.${encodeURIComponent(candidate.rule_key)}&select=id,rule_key,campaign_slug,coach_id,crm_contact_id&limit=2000`,
  );
  const key = dedupKey(candidate);
  if (existing.some(e => dedupKey(e) === key)) return null;

  const rows = await restInsert<AutomationEvent>("automation_events", {
    rule_key:       candidate.rule_key,
    severity:       candidate.severity,
    campaign_slug:  candidate.campaign_slug ?? null,
    coach_id:       candidate.coach_id ?? null,
    crm_contact_id: candidate.crm_contact_id ?? null,
    title:          candidate.title,
    description:    candidate.description ?? null,
  });
  return rows[0] ?? null;
}

export async function resolveEvent(id: string): Promise<AutomationEvent> {
  const rows = await restUpdate<AutomationEvent>(`automation_events?id=eq.${encodeURIComponent(id)}`, {
    status: "resolved", resolved_at: new Date().toISOString(),
  });
  return rows[0];
}

export async function acknowledgeEvent(id: string): Promise<AutomationEvent> {
  const rows = await restUpdate<AutomationEvent>(`automation_events?id=eq.${encodeURIComponent(id)}`, {
    status: "acknowledged",
  });
  return rows[0];
}

// Evaluates every rule, creates events for new candidates, and resolves open
// events whose condition is no longer true. This is the only place that
// diffs candidates against existing open events — createEvent() alone isn't
// enough because it doesn't know about resolution.
export async function runRules(): Promise<RunResult> {
  const start = Date.now();

  const [{ candidates, rulesEvaluated }, openEvents] = await Promise.all([
    evaluateAutomationRules(),
    getOpenEvents(),
  ]);

  const openByKey = new Map(openEvents.map(e => [dedupKey(e), e]));
  const candidateKeys = new Set(candidates.map(dedupKey));

  const toCreate  = candidates.filter(c => !openByKey.has(dedupKey(c)));
  const toResolve = openEvents.filter(e => !candidateKeys.has(dedupKey(e)));

  let eventsCreated = 0;
  if (toCreate.length > 0) {
    // resolution=ignore-duplicates: safety net if two runs race on the same dedup key
    const rows = await restInsert<AutomationEvent>("automation_events", toCreate.map(c => ({
      rule_key:       c.rule_key,
      severity:       c.severity,
      campaign_slug:  c.campaign_slug ?? null,
      coach_id:       c.coach_id ?? null,
      crm_contact_id: c.crm_contact_id ?? null,
      title:          c.title,
      description:    c.description ?? null,
    })), { Prefer: "return=representation, resolution=ignore-duplicates" }).catch(() => [] as AutomationEvent[]);
    eventsCreated = rows.length;
  }

  let eventsResolved = 0;
  if (toResolve.length > 0) {
    const ids = toResolve.map(e => e.id);
    await restUpdate(`automation_events?id=in.(${ids.join(",")})`, {
      status: "resolved", resolved_at: new Date().toISOString(),
    }).catch(() => {});
    eventsResolved = toResolve.length;
  }

  return { rulesEvaluated, eventsCreated, eventsResolved, executionTimeMs: Date.now() - start };
}
