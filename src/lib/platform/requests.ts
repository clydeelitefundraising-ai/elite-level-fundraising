// Phase 3B-2: single place that combines every Head Coach "Requests"
// category into one total — the Home Requests badge and the Requests
// Center both need this same number, and Phase 3B-2 adds a second
// category (Comment Approvals) alongside the existing one (Athlete
// Requests) without either category's own counting logic moving or being
// rewritten. Deliberately not a registry/plugin system — a request-type
// registry is not needed for two categories; this is intentionally the
// smallest thing that works and stays trivially extensible (add one more
// field + one more await here if a third category is ever added).
import { getPendingRequestCount } from "./athleteRequests";
import { getPendingCommentApprovalCount } from "./comments";

export type PendingRequestSummary = {
  athleteRequests: number;
  commentApprovals: number;
  total: number;
};

export async function getPendingRequestSummary(campaignSlug: string): Promise<PendingRequestSummary> {
  const [athleteRequests, commentApprovals] = await Promise.all([
    getPendingRequestCount(campaignSlug),
    getPendingCommentApprovalCount(campaignSlug),
  ]);
  return { athleteRequests, commentApprovals, total: athleteRequests + commentApprovals };
}
