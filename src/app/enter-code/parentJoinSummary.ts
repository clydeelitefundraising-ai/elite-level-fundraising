// Family Relationships Phase C2 — builds the parent-facing summary sentence
// for a multi-athlete join submission, from the per-athlete results
// POST /api/auth/join already returns. Pure and presentation-only: never
// mentions implementation terminology (team_member_athletes,
// parent_access_requests, campaign_slug) and always prefers the athlete's
// real name (already loaded client-side in teamInfo.athletes) over its id.
export type ParentJoinResultStatus = "created" | "already_pending" | "already_member" | "failed";

export type ParentJoinResult = {
  athleteId: string;
  status:    ParentJoinResultStatus;
  reason?:   string;
};

function joinNames(names: string[]): string {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

export function buildParentJoinSummary(
  results: ParentJoinResult[],
  athleteNames: Record<string, string>,
): string {
  const nameFor = (id: string) => athleteNames[id] ?? "your child";

  const created       = results.filter(r => r.status === "created").map(r => nameFor(r.athleteId));
  const alreadyMember  = results.filter(r => r.status === "already_member").map(r => nameFor(r.athleteId));
  const alreadyPending = results.filter(r => r.status === "already_pending").map(r => nameFor(r.athleteId));
  const failed         = results.filter(r => r.status === "failed");

  const parts: string[] = [];

  if (created.length > 0) {
    parts.push(`Request${created.length > 1 ? "s" : ""} sent for ${joinNames(created)}. Your coach will review ${created.length > 1 ? "them" : "it"}.`);
  }
  if (alreadyMember.length > 0) {
    parts.push(`You're already linked to ${joinNames(alreadyMember)}.`);
  }
  if (alreadyPending.length > 0) {
    parts.push(`${joinNames(alreadyPending)} already ${alreadyPending.length > 1 ? "have" : "has"} a pending request.`);
  }
  if (failed.length > 0) {
    const failedNames = failed.map(r => nameFor(r.athleteId));
    parts.push(`We couldn't submit a request for ${joinNames(failedNames)}. Please try again.`);
  }

  return parts.join(" ") || "Your request has been sent to the Head Coach for approval. You'll get team access once it's approved.";
}

// True only when every selected athlete already has live, approved access
// — the generalized multi-athlete form of the original single-athlete
// "alreadyMember" fast path, which skipped the pending-confirmation screen
// entirely and went straight to the team.
export function isFullyAlreadyMember(results: ParentJoinResult[]): boolean {
  return results.length > 0 && results.every(r => r.status === "already_member");
}

// True only when EVERY selected athlete failed — i.e. zero requests
// actually exist after this submission. Drives the confirmation screen's
// heading/icon/CTA so a parent is never told "Request Sent" when nothing
// was sent.
export function isTotalFailure(results: ParentJoinResult[]): boolean {
  return results.length > 0 && results.every(r => r.status === "failed");
}
