export type {
  Severity, AttentionItem, TodayStat, AuditEntry, PendingCategory,
} from "@/lib/platform/operations";
export type { PlatformServiceStatus as PlatformService } from "@/lib/platform/operations";

import type {
  AttentionItem, TodayStat, AuditEntry, PendingCategory, PlatformServiceStatus,
} from "@/lib/platform/operations";

export type OperationsData = {
  attention:      AttentionItem[];
  todayStats:     TodayStat[];
  recentEvents:   AuditEntry[];
  platformStatus: PlatformServiceStatus[];
  pendingItems:   PendingCategory[];
  alertCount:     number;
  generatedAt:    string;
};
