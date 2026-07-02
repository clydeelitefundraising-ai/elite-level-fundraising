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
  // Enriched server-side for display only
  campaignName?:  string | null;
  coachName?:     string | null;
};

export type AutomationSummary = {
  open:          number;
  critical:      number;
  warning:       number;
  info:          number;
  resolvedToday: number;
};

export type AutomationData = {
  events:  AutomationEvent[];
  summary: AutomationSummary;
};
