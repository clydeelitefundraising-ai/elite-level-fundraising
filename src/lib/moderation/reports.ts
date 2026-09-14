// Phase A36: Content/User Reporting.
//
// Mirrors the shape and conventions of src/lib/platform/comments.ts (the
// existing, already-proven moderation pattern in this codebase): a
// service-layer module with no session/role knowledge of its own — the
// caller (API route) resolves the actor server-side and passes it in,
// never trusting client-claimed identity for who filed or resolved a
// report.
// Relative imports (not the "@/lib/..." alias) so this module — and any
// test importing it — resolves correctly under plain `node --test`, which
// has no path-alias resolution (see announcementVisibility.ts for the
// same documented constraint).
import { restList, restInsert, restUpdate } from "../platform/_client.ts";
import type { ActorKey } from "../messages.ts";

export type ReportTargetType = "announcement" | "comment" | "message" | "attachment" | "user";
export type ReportReason = "harassment" | "inappropriate_content" | "spam" | "safety_concern" | "impersonation" | "other";
export type ReportStatus = "open" | "reviewing" | "actioned" | "dismissed";

const REASONS: ReportReason[] = ["harassment", "inappropriate_content", "spam", "safety_concern", "impersonation", "other"];
const TARGET_TYPES: ReportTargetType[] = ["announcement", "comment", "message", "attachment", "user"];

export function isValidReportReason(v: unknown): v is ReportReason {
  return typeof v === "string" && (REASONS as string[]).includes(v);
}
export function isValidTargetType(v: unknown): v is ReportTargetType {
  return typeof v === "string" && (TARGET_TYPES as string[]).includes(v);
}

export type ContentReportRow = {
  id:                string;
  campaign_slug:     string;
  target_type:       ReportTargetType;
  target_id:         string;
  target_kind:       "coach" | "member" | "platform_admin" | null;
  reporter_kind:     "coach" | "member" | "platform_admin";
  reporter_id:       string;
  reporter_name:     string;
  reason:            ReportReason;
  details:           string | null;
  status:            ReportStatus;
  resolved_by_kind:  "coach" | "platform_admin" | null;
  resolved_by_id:    string | null;
  resolution_note:   string | null;
  created_at:        string;
  resolved_at:       string | null;
};

const MAX_DETAILS_LENGTH = 1000;

// The table each content target_type lives in, and whether it's
// campaign-scoped — used only to confirm the reported row actually exists
// in THIS campaign before accepting the report (same
// validate-before-trust convention as validateAnnouncementForCampaign).
// announcement/comment carry campaign_slug directly. message/attachment
// deliberately do NOT (confirmed against the actual schema) — only their
// message_threads row does — so those two are resolved via a dedicated
// path below, not this generic one.
const TARGET_TABLE: Record<"announcement" | "comment", string> = {
  announcement: "announcements",
  comment:      "announcement_comments",
};

// The table a reported *person* lives in, keyed by target_kind — used
// only for the target_type = "user" case.
const USER_TABLE: Record<"coach" | "member" | "platform_admin", string> = {
  coach:          "team_coaches",
  member:         "team_members",
  platform_admin: "platform_admins",
};

export type TargetCheckResult = "ok" | "not_found" | "already_removed";

// message/attachment existence+scope, resolved via their thread's
// campaign_slug (neither table has that column itself) — and rejects a
// target that's already been moderator-removed (deleted_at/removed_at
// set), per the explicit requirement that a removed message/attachment
// can't be reported again.
async function messageOrAttachmentCheck(
  campaignSlug: string,
  targetType:   "message" | "attachment",
  targetId:     string,
): Promise<TargetCheckResult> {
  const table = targetType === "message" ? "messages" : "message_attachments";
  const removedColumn = targetType === "message" ? "deleted_at" : "removed_at";
  const rows = await restList<{ id: string; thread_id: string; deleted_at?: string | null; removed_at?: string | null }>(
    `${table}?id=eq.${encodeURIComponent(targetId)}&select=id,thread_id,${removedColumn}&limit=1`,
  );
  const row = rows[0];
  if (!row) return "not_found";

  const threadRows = await restList<{ id: string }>(
    `message_threads?id=eq.${encodeURIComponent(row.thread_id)}&campaign_slug=eq.${encodeURIComponent(campaignSlug)}&select=id&limit=1`,
  );
  if (!threadRows.length) return "not_found"; // wrong campaign — never disclose cross-team existence

  const removedAt = targetType === "message" ? row.deleted_at : row.removed_at;
  if (removedAt) return "already_removed";
  return "ok";
}

async function targetExists(
  campaignSlug: string,
  targetType:   ReportTargetType,
  targetId:     string,
  targetKind:   "coach" | "member" | "platform_admin" | null,
): Promise<TargetCheckResult> {
  if (targetType === "user") {
    if (!targetKind) return "not_found";
    const table = USER_TABLE[targetKind];
    // platform_admins has no campaign_slug column (a platform admin isn't
    // scoped to one team) — id existence alone is the correct check there.
    const scope = table === "platform_admins" ? "" : `&campaign_slug=eq.${encodeURIComponent(campaignSlug)}`;
    const rows = await restList<{ id: string }>(`${table}?id=eq.${encodeURIComponent(targetId)}${scope}&select=id&limit=1`);
    return rows.length > 0 ? "ok" : "not_found";
  }
  if (targetType === "message" || targetType === "attachment") {
    return messageOrAttachmentCheck(campaignSlug, targetType, targetId);
  }
  const table = TARGET_TABLE[targetType];
  const rows = await restList<{ id: string }>(
    `${table}?id=eq.${encodeURIComponent(targetId)}&campaign_slug=eq.${encodeURIComponent(campaignSlug)}&select=id&limit=1`,
  );
  return rows.length > 0 ? "ok" : "not_found";
}

export type CreateReportResult =
  | { ok: true;  report: ContentReportRow }
  | { ok: false; reason: "validation"; message: string }
  | { ok: false; reason: "target_not_found" }
  | { ok: false; reason: "already_removed" }
  | { ok: false; reason: "server_error" };

export async function createReport(input: {
  campaignSlug:  string;
  reporter:      ActorKey;
  reporterName:  string;
  targetType:    ReportTargetType;
  targetId:      string;
  targetKind?:   "coach" | "member" | "platform_admin" | null;
  reason:        ReportReason;
  details?:      string | null;
}): Promise<CreateReportResult> {
  if (!isValidTargetType(input.targetType)) {
    return { ok: false, reason: "validation", message: "Invalid report target type." };
  }
  if (!isValidReportReason(input.reason)) {
    return { ok: false, reason: "validation", message: "Invalid report reason." };
  }
  if (input.targetType === "user" && !input.targetKind) {
    return { ok: false, reason: "validation", message: "target_kind is required when reporting a user." };
  }
  const details = input.details?.trim() || null;
  if (details && details.length > MAX_DETAILS_LENGTH) {
    return { ok: false, reason: "validation", message: `Details must be ${MAX_DETAILS_LENGTH} characters or fewer.` };
  }

  const check = await targetExists(input.campaignSlug, input.targetType, input.targetId, input.targetKind ?? null);
  if (check === "not_found") return { ok: false, reason: "target_not_found" };
  if (check === "already_removed") return { ok: false, reason: "already_removed" };

  const payload = {
    campaign_slug: input.campaignSlug,
    target_type:   input.targetType,
    target_id:     input.targetId,
    target_kind:   input.targetType === "user" ? input.targetKind : null,
    reporter_kind: input.reporter.kind,
    reporter_id:   input.reporter.id,
    reporter_name: input.reporterName,
    reason:        input.reason,
    details,
    status:        "open" as const,
  };

  try {
    const rows = await restInsert<ContentReportRow>("content_reports?select=*", payload);
    return { ok: true, report: rows[0] };
  } catch (err) {
    console.error("[moderation/reports] createReport insert failed:", err);
    return { ok: false, reason: "server_error" };
  }
}

// Head Coach queue: open/reviewing reports for their own campaign only.
export async function getReportsForCampaign(campaignSlug: string): Promise<ContentReportRow[]> {
  return restList<ContentReportRow>(
    `content_reports?campaign_slug=eq.${encodeURIComponent(campaignSlug)}&select=*&order=created_at.desc`,
  );
}

// Platform Admin queue: every report across every campaign.
export async function getAllReports(): Promise<ContentReportRow[]> {
  return restList<ContentReportRow>("content_reports?select=*&order=created_at.desc");
}

export async function getOpenReportCount(campaignSlug: string): Promise<number> {
  const rows = await restList<{ id: string }>(
    `content_reports?campaign_slug=eq.${encodeURIComponent(campaignSlug)}&status=eq.open&select=id`,
  );
  return rows.length;
}

export type ResolveReportResult =
  | { ok: true;  report: ContentReportRow }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "server_error" };

// resolvedBy is either a coach or platform admin — the route enforces
// isHeadCoach()/isPlatformAdmin() before ever calling this. A member can
// never reach here. Platform admin may resolve a report from ANY
// campaign; a coach may only resolve one already scoped to their own
// campaign_slug by the caller's query.
export async function resolveReport(
  reportId:       string,
  campaignSlug:   string,
  resolvedBy:     Extract<ActorKey, { kind: "coach" | "platform_admin" }>,
  status:         Extract<ReportStatus, "reviewing" | "actioned" | "dismissed">,
  resolutionNote?: string | null,
): Promise<ResolveReportResult> {
  try {
    const rows = await restUpdate<ContentReportRow>(
      `content_reports?id=eq.${encodeURIComponent(reportId)}&campaign_slug=eq.${encodeURIComponent(campaignSlug)}`,
      {
        status,
        resolved_by_kind: resolvedBy.kind,
        resolved_by_id:   resolvedBy.id,
        resolution_note:  resolutionNote?.trim() || null,
        resolved_at:      new Date().toISOString(),
      },
    );
    if (!rows[0]) return { ok: false, reason: "not_found" };
    return { ok: true, report: rows[0] };
  } catch (err) {
    console.error("[moderation/reports] resolveReport failed:", err);
    return { ok: false, reason: "server_error" };
  }
}
