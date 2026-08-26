import { restList } from "./_client";
import { logAuditEvent, ADMIN_TOOL_ACTOR, ipOf, type AuditEventParams, type AuditActor } from "@/lib/auditLog";

// Thin re-export — the write path (fire-and-forget insert, "admin" identifier,
// etc.) already lives in src/lib/auditLog.ts and is used by ~15 existing routes.
// It is not duplicated here; this just gives Platform Services a consistent
// `platform/*` import surface alongside the new read helpers below.
export const logAudit = logAuditEvent;
export { ipOf, ADMIN_TOOL_ACTOR };
export type { AuditEventParams, AuditActor };

export type AuditEntry = {
  id:                string;
  action:            string;
  campaign_slug?:    string | null;
  summary?:          string | null;
  admin_identifier?: string | null;
  // Both null on every row written before Phase 3 (actor_type/actor_id/
  // actor_email were added by phase_a29_platform_admin.sql but nothing
  // wrote them until now) — existing records still render fine via
  // admin_identifier, which every row has always had.
  actor_type?:       AuditActor["type"] | null;
  actor_email?:      string | null;
  created_at:        string;
};

// Display label distinguishing a real Head Coach from a platform admin
// acting under their own identity from the legacy shared-password tool —
// the exact distinction Phase 3 exists to make visible. Falls back to
// admin_identifier for any pre-Phase-3 row (actor_type is null there).
export function auditActorLabel(entry: AuditEntry): string {
  if (entry.actor_type === "platform_admin") return `Platform Admin (${entry.actor_email ?? "unknown"})`;
  if (entry.actor_type === "coach") return entry.admin_identifier ? `Coach: ${entry.admin_identifier}` : "Coach";
  if (entry.actor_type === "admin_tool") return "ELF Admin Tool";
  if (entry.actor_type === "system") return "System";
  return entry.admin_identifier ?? "Unknown";
}

export async function getRecentAudit(limit = 15): Promise<AuditEntry[]> {
  return restList<AuditEntry>(
    `audit_logs?select=id,action,campaign_slug,summary,admin_identifier,actor_type,actor_email,created_at&order=created_at.desc&limit=${limit}`,
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
