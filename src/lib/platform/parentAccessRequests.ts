// Parent Access Approval — Phase 11a.
//
// Same decouple-until-decided shape as pending_athlete_requests (Phase
// 1B): a parent_access_requests row is created first; the team_members row
// that actually grants access is only ever created (or extended, for a
// multi-child parent) when a Head Coach approves. See the migration file's
// header comment for the full security rationale — there is deliberately
// no "membership_status" flag to check everywhere, because a pending
// parent simply has no team_members row yet.

import { restList, restInsert, restUpdate } from "./_client.ts";
import { validateAthleteForCampaign } from "./athletes.ts";
import { generateMemberSalt } from "../memberAuth.ts";

export type RequestStatus = "pending" | "approved" | "declined";

export type ParentAccessRequest = {
  id:                    string;
  campaign_slug:         string;
  account_id:            string;
  parent_name:           string;
  athlete_id:            string;
  status:                RequestStatus;
  decided_by_account_id: string | null;
  decided_at:            string | null;
  decline_reason:        string | null;
  resulting_member_id:   string | null;
  created_at:            string;
  updated_at:            string;
};

type RawRequestWithAthlete = ParentAccessRequest & {
  athlete: { name: string } | null;
};

export type ParentAccessRequestWithAthleteName = ParentAccessRequest & {
  athlete_name: string;
};

const WITH_ATHLETE_SELECT = "*,athlete:athletes!athlete_id(name)";

// ── Create ────────────────────────────────────────────────────────────────

export type CreatePendingRequestInput = {
  campaignSlug: string;
  accountId:    string;
  parentName:   string;
  athleteId:    string;
};

export type CreatePendingRequestResult =
  | { ok: true;  request: ParentAccessRequest; alreadyPending: false; alreadyMember: false }
  | { ok: true;  request: ParentAccessRequest; alreadyPending: true;  alreadyMember: false }
  // Idempotent fast path: this exact parent+child relationship already
  // exists and is live — no new request needed, caller should just log
  // the parent into their existing membership.
  | { ok: true;  alreadyMember: true; alreadyPending: false; memberId: string }
  | { ok: false; reason: "validation"; message: string }
  | { ok: false; reason: "athlete_not_found" };

// Does this account already have a LIVE (approved) parent relationship to
// this exact athlete on this campaign? Checked via the same union
// (team_members.athlete_id legacy single-FK + team_member_athletes join
// table) that getLinkedAthleteIds() / canAccessAthleteProfile() already
// use as the authoritative "what can this parent see" read path — so
// "already a member" here means exactly what the rest of the app already
// considers access-granting, nothing new.
async function findApprovedMembership(
  accountId: string,
  campaignSlug: string,
  athleteId: string,
): Promise<{ memberId: string } | null> {
  const members = await restList<{ id: string; athlete_id: string | null }>(
    `team_members?account_id=eq.${encodeURIComponent(accountId)}&campaign_slug=eq.${encodeURIComponent(campaignSlug)}&select=id,athlete_id`,
  );
  for (const m of members) {
    if (m.athlete_id === athleteId) return { memberId: m.id };
    const links = await restList<{ athlete_id: string }>(
      `team_member_athletes?team_member_id=eq.${encodeURIComponent(m.id)}&athlete_id=eq.${encodeURIComponent(athleteId)}&select=athlete_id&limit=1`,
    );
    if (links.length > 0) return { memberId: m.id };
  }
  return null;
}

export async function createPendingRequest(
  input: CreatePendingRequestInput,
): Promise<CreatePendingRequestResult> {
  const campaignSlug = input.campaignSlug?.trim();
  const parentName    = input.parentName?.trim();

  if (!campaignSlug) return { ok: false, reason: "validation", message: "campaignSlug is required." };
  if (!parentName)   return { ok: false, reason: "validation", message: "Parent name is required." };
  if (!input.athleteId) return { ok: false, reason: "validation", message: "Please select your child." };

  const athlete = await validateAthleteForCampaign(input.athleteId, campaignSlug);
  if (!athlete) return { ok: false, reason: "athlete_not_found" };

  const existingMembership = await findApprovedMembership(input.accountId, campaignSlug, input.athleteId);
  if (existingMembership) {
    return { ok: true, alreadyMember: true, alreadyPending: false, memberId: existingMembership.memberId };
  }

  const existingPending = await restList<ParentAccessRequest>(
    `parent_access_requests?account_id=eq.${encodeURIComponent(input.accountId)}&athlete_id=eq.${encodeURIComponent(input.athleteId)}&status=eq.pending&limit=1`,
  );
  if (existingPending[0]) {
    return { ok: true, request: existingPending[0], alreadyPending: true, alreadyMember: false };
  }

  try {
    const rows = await restInsert<ParentAccessRequest>("parent_access_requests", {
      campaign_slug: campaignSlug,
      account_id:    input.accountId,
      parent_name:   parentName,
      athlete_id:    input.athleteId,
    });
    return { ok: true, request: rows[0], alreadyPending: false, alreadyMember: false };
  } catch {
    // Race: the DB partial unique index caught a duplicate submission
    // between the check above and the insert. Same clean response.
    const rows = await restList<ParentAccessRequest>(
      `parent_access_requests?account_id=eq.${encodeURIComponent(input.accountId)}&athlete_id=eq.${encodeURIComponent(input.athleteId)}&status=eq.pending&limit=1`,
    );
    if (rows[0]) return { ok: true, request: rows[0], alreadyPending: true, alreadyMember: false };
    return { ok: false, reason: "validation", message: "Failed to submit request. Please try again." };
  }
}

// ── Read ──────────────────────────────────────────────────────────────────

// For /teams — pending or declined requests only (once approved, the
// account already has a normal team_members row and shows up as a regular
// team card via getAccountTeams(), same convention as pending_athlete_requests).
export async function getVisiblePendingRequestsForAccount(accountId: string): Promise<ParentAccessRequestWithAthleteName[]> {
  const rows = await restList<RawRequestWithAthlete>(
    `parent_access_requests?account_id=eq.${encodeURIComponent(accountId)}&status=neq.approved&select=${WITH_ATHLETE_SELECT}&order=created_at.desc`,
  );
  return rows.map(r => ({ ...r, athlete_name: r.athlete?.name ?? "your child" }));
}

// Head Coach queue — pending only, with the athlete's name embedded for
// the "Requesting access as parent of {name}" card copy.
export async function getPendingRequestsForCampaign(campaignSlug: string): Promise<ParentAccessRequestWithAthleteName[]> {
  const rows = await restList<RawRequestWithAthlete>(
    `parent_access_requests?campaign_slug=eq.${encodeURIComponent(campaignSlug)}&status=eq.pending&select=${WITH_ATHLETE_SELECT}&order=created_at.asc`,
  );
  return rows.map(r => ({ ...r, athlete_name: r.athlete?.name ?? "Unknown Athlete" }));
}

export async function getPendingRequestCount(campaignSlug: string): Promise<number> {
  const rows = await restList<{ id: string }>(
    `parent_access_requests?campaign_slug=eq.${encodeURIComponent(campaignSlug)}&status=eq.pending&select=id`,
  );
  return rows.length;
}

// ── Decide ────────────────────────────────────────────────────────────────

export type DecideRequestContext = {
  requestId:          string;
  campaignSlug:       string;
  decidedByAccountId: string;
};

export type ApproveRequestResult =
  | { ok: true;  request: ParentAccessRequest; memberId: string }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "already_decided" }
  | { ok: false; reason: "internal_error" };

// Atomically claims the request (WHERE status='pending') before doing
// anything else — same race-safety pattern as athleteRequests.ts /
// comments.ts's conditional-UPDATE claim. Only one concurrent
// approve/decline can ever win.
async function claimPendingRequest(requestId: string, campaignSlug: string): Promise<ParentAccessRequest | null> {
  const rows = await restUpdate<ParentAccessRequest>(
    `parent_access_requests?id=eq.${encodeURIComponent(requestId)}&campaign_slug=eq.${encodeURIComponent(campaignSlug)}&status=eq.pending`,
    { status: "approved", updated_at: new Date().toISOString() },
  );
  return rows[0] ?? null;
}

async function revertToPending(requestId: string): Promise<void> {
  await restUpdate(
    `parent_access_requests?id=eq.${encodeURIComponent(requestId)}&status=eq.approved`,
    { status: "pending", updated_at: new Date().toISOString() },
  );
}

export async function approveRequest(ctx: DecideRequestContext): Promise<ApproveRequestResult> {
  const existingRows = await restList<ParentAccessRequest>(
    `parent_access_requests?id=eq.${encodeURIComponent(ctx.requestId)}&campaign_slug=eq.${encodeURIComponent(ctx.campaignSlug)}&limit=1`,
  );
  const existing = existingRows[0];
  if (!existing) return { ok: false, reason: "not_found" };
  if (existing.status !== "pending") return { ok: false, reason: "already_decided" };

  const claimed = await claimPendingRequest(ctx.requestId, ctx.campaignSlug);
  if (!claimed) return { ok: false, reason: "already_decided" };

  try {
    // Find (or create) this account's team_members row for this campaign.
    // A parent already approved for one child on this team keeps their
    // existing row — name/athlete_id are never overwritten — and just
    // gains an additional team_member_athletes link for the new child
    // (multi-child support). A brand-new parent gets a fresh row, with
    // this athlete as its legacy single athlete_id for back-compat with
    // any code that still reads that column directly.
    const existingMembers = await restList<{ id: string }>(
      `team_members?account_id=eq.${encodeURIComponent(existing.account_id)}&campaign_slug=eq.${encodeURIComponent(ctx.campaignSlug)}&select=id&limit=1`,
    );

    let memberId: string;
    if (existingMembers[0]) {
      memberId = existingMembers[0].id;
    } else {
      const rows = await restInsert<{ id: string }>("team_members", {
        campaign_slug: ctx.campaignSlug,
        role:          "parent",
        name:          existing.parent_name,
        salt:          generateMemberSalt(),
        account_id:    existing.account_id,
        athlete_id:    existing.athlete_id,
      });
      memberId = rows[0].id;
    }

    // Ensure the team_member_athletes link exists (idempotent — covers
    // both the fresh-row case, so every grant is backed by a join-table
    // row and not just the legacy column, and the existing-row/second-
    // child case).
    const existingLink = await restList<{ id: string }>(
      `team_member_athletes?team_member_id=eq.${encodeURIComponent(memberId)}&athlete_id=eq.${encodeURIComponent(existing.athlete_id)}&select=id&limit=1`,
    );
    if (!existingLink[0]) {
      await restInsert("team_member_athletes", { team_member_id: memberId, athlete_id: existing.athlete_id });
    }

    // Best-effort — a messaging sync hiccup must never fail an approval
    // that already succeeded.
    try {
      const { syncParentIntoAthleteThreads } = await import("@/lib/messages");
      await syncParentIntoAthleteThreads(existing.athlete_id, ctx.campaignSlug);
    } catch (err) {
      console.error("[parentAccessRequests] syncParentIntoAthleteThreads failed:", err);
    }

    const finalRows = await restUpdate<ParentAccessRequest>(
      `parent_access_requests?id=eq.${encodeURIComponent(ctx.requestId)}`,
      {
        decided_by_account_id: ctx.decidedByAccountId,
        decided_at:            new Date().toISOString(),
        resulting_member_id:   memberId,
        updated_at:            new Date().toISOString(),
      },
    );
    if (!finalRows[0]) {
      console.error(`[parentAccessRequests] partial_success: request=${ctx.requestId} member=${memberId} — needs manual follow-up`);
      return { ok: false, reason: "internal_error" };
    }
    return { ok: true, request: finalRows[0], memberId };
  } catch (err) {
    console.error("[parentAccessRequests] approveRequest failed after claim:", err);
    try {
      await revertToPending(ctx.requestId);
    } catch (revertErr) {
      console.error("[parentAccessRequests] revertToPending also failed:", revertErr);
    }
    return { ok: false, reason: "internal_error" };
  }
}

export type DeclineRequestResult =
  | { ok: true;  request: ParentAccessRequest }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "already_decided" }
  | { ok: false; reason: "internal_error" };

export async function declineRequest(
  ctx: DecideRequestContext,
  declineReason?: string,
): Promise<DeclineRequestResult> {
  try {
    const rows = await restUpdate<ParentAccessRequest>(
      `parent_access_requests?id=eq.${encodeURIComponent(ctx.requestId)}&campaign_slug=eq.${encodeURIComponent(ctx.campaignSlug)}&status=eq.pending`,
      {
        status:                "declined",
        decided_by_account_id: ctx.decidedByAccountId,
        decided_at:            new Date().toISOString(),
        decline_reason:        declineReason?.trim() || null,
        updated_at:            new Date().toISOString(),
      },
    );
    if (!rows[0]) {
      const check = await restList<ParentAccessRequest>(
        `parent_access_requests?id=eq.${encodeURIComponent(ctx.requestId)}&campaign_slug=eq.${encodeURIComponent(ctx.campaignSlug)}&limit=1`,
      );
      return check[0] ? { ok: false, reason: "already_decided" } : { ok: false, reason: "not_found" };
    }
    return { ok: true, request: rows[0] };
  } catch (err) {
    console.error("[parentAccessRequests] declineRequest failed:", err);
    return { ok: false, reason: "internal_error" };
  }
}
