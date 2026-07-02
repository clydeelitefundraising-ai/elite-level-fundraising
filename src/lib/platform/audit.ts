import { restList } from "./_client";
import { logAuditEvent, ipOf, type AuditEventParams } from "@/lib/auditLog";

// Thin re-export — the write path (fire-and-forget insert, "admin" identifier,
// etc.) already lives in src/lib/auditLog.ts and is used by ~15 existing routes.
// It is not duplicated here; this just gives Platform Services a consistent
// `platform/*` import surface alongside the new read helpers below.
export const logAudit = logAuditEvent;
export { ipOf };
export type { AuditEventParams };

export type AuditEntry = {
  id:                string;
  action:            string;
  campaign_slug?:    string | null;
  summary?:          string | null;
  admin_identifier?: string | null;
  created_at:        string;
};

export async function getRecentAudit(limit = 15): Promise<AuditEntry[]> {
  return restList<AuditEntry>(
    `audit_logs?select=id,action,campaign_slug,summary,admin_identifier,created_at&order=created_at.desc&limit=${limit}`,
  );
}

export async function getAuditSince(sinceISO: string, limit = 500): Promise<AuditEntry[]> {
  return restList<AuditEntry>(
    `audit_logs?created_at=gte.${sinceISO}&select=id,action,campaign_slug,created_at&limit=${limit}`,
  );
}

export type AuditSummary = {
  campaignsCreated:    number;
  campaignsDuplicated: number;
  exportsGenerated:    number;
  demoEvents:          number;
};

export async function getAuditSummary(sinceISO: string): Promise<AuditSummary> {
  const entries = await getAuditSince(sinceISO);
  return {
    campaignsCreated:    entries.filter(e => e.action === "campaign.created").length,
    campaignsDuplicated: entries.filter(e => e.action === "campaign.duplicated").length,
    exportsGenerated:    entries.filter(e => e.action.startsWith("export.")).length,
    demoEvents:          entries.filter(e => e.action.startsWith("demo.")).length,
  };
}
