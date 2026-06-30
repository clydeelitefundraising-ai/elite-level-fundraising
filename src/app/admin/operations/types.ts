export type Severity = "critical" | "warning" | "info" | "ok";

export type AttentionItem = {
  id:           string;
  severity:     Severity;
  title:        string;
  count?:       number;
  detail?:      string;
  href?:        string;
  actionLabel?: string;
  icon:         string;
};

export type TodayStat = {
  label:     string;
  value:     number;
  icon:      string;
  sublabel?: string;
  href?:     string;
};

export type AuditEntry = {
  id:                string;
  action:            string;
  campaign_slug?:    string | null;
  summary?:          string | null;
  admin_identifier?: string | null;
  created_at:        string;
};

export type PlatformService = {
  name:   string;
  icon:   string;
  status: "operational" | "unknown" | "unconfigured";
  note?:  string;
};

export type PendingCategory = {
  label: string;
  count: number;
  href?: string;
};

export type OperationsData = {
  attention:      AttentionItem[];
  todayStats:     TodayStat[];
  recentEvents:   AuditEntry[];
  platformStatus: PlatformService[];
  pendingItems:   PendingCategory[];
  alertCount:     number;
  generatedAt:    string;
};
