// Pending athlete request service — Phase 1B.
//
// Backs the "I don't see my name" self-registration path: a request sits
// here (no athletes row, no team_members row) until a Head Coach approves
// or declines it. Approval always goes through athletes.ts's canonical
// createAthlete()/validateAthleteForCampaign()/createLinkedAthleteMember()
// — this file never inserts into athletes or team_members directly.

import { restList, restInsert, restUpdate } from "./_client";
import {
  createAthlete, validateAthleteForCampaign, createLinkedAthleteMember,
  findPossibleDuplicates as findPossibleAthleteDuplicates,
  type PossibleDuplicate,
} from "./athletes";

export type RequestStatus = "pending" | "approved" | "declined";

export type PendingAthleteRequest = {
  id:                    string;
  campaign_slug:         string;
  account_id:            string;
  full_name:             string;
  class_year:            string;
  event:                 string | null;
  matched_athlete_id:    string | null;
  status:                RequestStatus;
  decided_by_account_id: string | null;
  decided_at:            string | null;
  decline_reason:        string | null;
  resulting_athlete_id:  string | null;
  resulting_member_id:   string | null;
  created_at:            string;
  updated_at:            string;
};

export type CreatePendingRequestInput = {
  campaignSlug: string;
  accountId:    string;
  fullName:     string;
  classYear:    string;
  event?:       string | null;
};

export type CreatePendingRequestResult =
  | { ok: true;  request: PendingAthleteRequest }
  | { ok: false; reason: "validation"; message: string }
  | { ok: false; reason: "duplicate_pending" };

// One request creates one elf_accounts row + one pending_athlete_requests
// row — never an athletes row, never a team_members row. The DB partial
// unique index (account_id, campaign_slug) WHERE status='pending' is the
// authoritative guard against duplicates; this also checks first so the
// common case returns a clean message instead of relying on a raw 23505.
export async function createPendingRequest(
  input: CreatePendingRequestInput,
): Promise<CreatePendingRequestResult> {
  const campaignSlug = input.campaignSlug?.trim();
  const fullName      = input.fullName?.trim();
  const classYear     = input.classYear?.trim();

  if (!campaignSlug) return { ok: false, reason: "validation", message: "campaignSlug is required." };
  if (!fullName)     return { ok: false, reason: "validation", message: "Full name is required." };
  if (!classYear)    return { ok: false, reason: "validation", message: "Class/year is required." };

  const existing = await restList<PendingAthleteRequest>(
    `pending_athlete_requests?account_id=eq.${encodeURIComponent(input.accountId)}&campaign_slug=eq.${encodeURIComponent(campaignSlug)}&status=eq.pending&limit=1`,
  );
  if (existing.length > 0) return { ok: false, reason: "duplicate_pending" };

  try {
    const rows = await restInsert<PendingAthleteRequest>("pending_athlete_requests", {
      campaign_slug: campaignSlug,
      account_id:    input.accountId,
      full_name:     fullName,
      class_year:    classYear,
      event:         input.event?.trim() || null,
    });
    return { ok: true, request: rows[0] };
  } catch {
    // Race: two submissions landed between the check above and the insert —
    // the DB partial unique index caught it. Same clean response either way.
    return { ok: false, reason: "duplicate_pending" };
  }
}

// For /teams — "does this account have a request (pending or decided) for
// this campaign?"
export async function getPendingRequestForAccount(
  accountId: string,
  campaignSlug: string,
): Promise<PendingAthleteRequest | null> {
  const rows = await restList<PendingAthleteRequest>(
    `pending_athlete_requests?account_id=eq.${encodeURIComponent(accountId)}&campaign_slug=eq.${encodeURIComponent(campaignSlug)}&order=created_at.desc&limit=1`,
  );
  return rows[0] ?? null;
}

// For /teams — every request (any campaign) this account has ever
// submitted, most recent per campaign is what the UI needs; callers filter/
// group as needed. Kept simple (no campaign filter) since an account only
// has a handful of these at most.
export async function getAllRequestsForAccount(accountId: string): Promise<PendingAthleteRequest[]> {
  return restList<PendingAthleteRequest>(
    `pending_athlete_requests?account_id=eq.${encodeURIComponent(accountId)}&order=created_at.desc`,
  );
}

// For /teams — pending or declined requests only. Once a request is
// approved, the account already has a normal team_members row and shows up
// as a regular team card via getAccountTeams(); surfacing it again here
// would just be a confusing duplicate card for the same team.
export async function getVisiblePendingRequestsForAccount(accountId: string): Promise<PendingAthleteRequest[]> {
  const all = await getAllRequestsForAccount(accountId);
  return all.filter(r => r.status !== "approved");
}

// Head Coach queue — pending only.
export async function getPendingRequestsForCampaign(campaignSlug: string): Promise<PendingAthleteRequest[]> {
  return restList<PendingAthleteRequest>(
    `pending_athlete_requests?campaign_slug=eq.${encodeURIComponent(campaignSlug)}&status=eq.pending&order=created_at.asc`,
  );
}

export async function getPendingRequestCount(campaignSlug: string): Promise<number> {
  const rows = await getPendingRequestsForCampaign(campaignSlug);
  return rows.length;
}

export type AthleteInfo = { id: string; name: string; event: string | null; class_year: string | null };

export type PendingRequestWithMatches = PendingAthleteRequest & {
  possibleMatches: (PossibleDuplicate & { athlete: AthleteInfo })[];
};

// Advisory-only — attaches findPossibleDuplicates() results per request for
// the Head Coach panel. Never used to auto-decide anything.
export async function getPendingRequestsWithMatches(campaignSlug: string): Promise<PendingRequestWithMatches[]> {
  const requests = await getPendingRequestsForCampaign(campaignSlug);
  return Promise.all(
    requests.map(async request => ({
      ...request,
      possibleMatches: await findPossibleAthleteDuplicates(campaignSlug, request.full_name),
    })),
  );
}

export type DecideRequestContext = {
  requestId:         string;
  campaignSlug:      string;
  decidedByAccountId: string;
};

export type ApproveDecision =
  | { action: "create"; overrideCollision?: boolean }
  | { action: "link"; athleteId: string };

export type ApproveRequestResult =
  | { ok: true;  request: PendingAthleteRequest }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "already_decided" }
  | { ok: false; reason: "validation"; message: string }
  | { ok: false; reason: "collision"; collision: unknown }
  | { ok: false; reason: "athlete_not_found" }
  // A downstream step threw (raw DB/REST error, e.g. a schema constraint
  // the app layer doesn't model) rather than returning a modeled failure.
  // Caught centrally in approveRequest() so this never reaches the route
  // handler as an unhandled exception. The request has been reverted to
  // pending — safe to retry.
  | { ok: false; reason: "internal_error" }
  // The athlete and team membership were successfully created/linked, but
  // the final bookkeeping update on pending_athlete_requests itself failed.
  // Deliberately NOT reverted to pending — an athlete and membership now
  // genuinely exist, so re-approving would risk a duplicate. Needs manual
  // follow-up rather than an automatic retry.
  | { ok: false; reason: "partial_success"; athleteId: string; memberId: string };

// Atomically claims the request (WHERE status='pending') before doing
// anything else — the race-safety mechanism for "two approvals at once" /
// "approve after decline". Only one caller can ever win this update; a
// second concurrent approve/decline attempt affects 0 rows.
async function claimPendingRequest(
  requestId: string,
  campaignSlug: string,
): Promise<PendingAthleteRequest | null> {
  const rows = await restUpdate<PendingAthleteRequest>(
    `pending_athlete_requests?id=eq.${encodeURIComponent(requestId)}&campaign_slug=eq.${encodeURIComponent(campaignSlug)}&status=eq.pending`,
    { status: "approved", updated_at: new Date().toISOString() },
  );
  return rows[0] ?? null;
}

// Best-effort revert if something fails after the claim (e.g. a collision
// surfaced by createAthlete, or a genuine race on the athlete row) — the
// request must never be left stuck in "approved" with no resulting athlete/
// member. Reverting lets the Head Coach retry (e.g. choose "link" instead
// of "create" after seeing a collision) instead of the request being dead.
async function revertToPending(requestId: string): Promise<void> {
  await restUpdate(
    `pending_athlete_requests?id=eq.${encodeURIComponent(requestId)}&status=eq.approved`,
    { status: "pending", updated_at: new Date().toISOString() },
  );
}

export async function approveRequest(
  ctx: DecideRequestContext,
  decision: ApproveDecision,
): Promise<ApproveRequestResult> {
  const existingRows = await restList<PendingAthleteRequest>(
    `pending_athlete_requests?id=eq.${encodeURIComponent(ctx.requestId)}&campaign_slug=eq.${encodeURIComponent(ctx.campaignSlug)}&limit=1`,
  );
  const existing = existingRows[0];
  if (!existing) return { ok: false, reason: "not_found" };
  if (existing.status !== "pending") return { ok: false, reason: "already_decided" };

  // Claim first — guarantees exclusivity for everything below. A second
  // concurrent approve/decline call loses this race and reports
  // already_decided rather than racing to create a duplicate athlete.
  const claimed = await claimPendingRequest(ctx.requestId, ctx.campaignSlug);
  if (!claimed) return { ok: false, reason: "already_decided" };

  // Everything from here on runs against a request we exclusively own
  // (status='approved', claimed above). Wrapped in try/catch: a *thrown*
  // exception from any downstream step (createAthlete, createLinkedAthlete-
  // Member, validateAthleteForCampaign, or the final bookkeeping update —
  // e.g. a raw Postgres constraint violation the app layer doesn't model)
  // must never leave the request stuck in "approved" with null resulting
  // IDs. Modeled failures (createAthlete's collision/validation results)
  // are still handled inline below, same as before — this catch only
  // covers genuine throws.
  try {
    let athleteId: string;
    if (decision.action === "link") {
      const athlete = await validateAthleteForCampaign(decision.athleteId, ctx.campaignSlug);
      if (!athlete) {
        await revertToPending(ctx.requestId);
        return { ok: false, reason: "athlete_not_found" };
      }
      athleteId = athlete.id;
    } else {
      const result = await createAthlete(
        { campaignSlug: ctx.campaignSlug, name: existing.full_name, classYear: existing.class_year, event: existing.event },
        { overrideCollision: decision.overrideCollision === true },
      );
      if (!result.ok) {
        await revertToPending(ctx.requestId);
        if (result.reason === "validation") return { ok: false, reason: "validation", message: result.message };
        if (result.reason === "collision")  return { ok: false, reason: "collision", collision: result.collision };
        return { ok: false, reason: "validation", message: "Failed to create athlete." };
      }
      athleteId = result.athlete.id;
    }

    const linkResult = await createLinkedAthleteMember({
      campaignSlug: ctx.campaignSlug,
      athleteId,
      accountId:    existing.account_id,
      name:         existing.full_name,
    });
    // athleteId was just validated/created above — this branch is only
    // reachable on a genuine race (athlete deleted between resolve and link).
    if (!linkResult.ok) {
      await revertToPending(ctx.requestId);
      return { ok: false, reason: "athlete_not_found" };
    }

    // The athlete and membership are now genuinely created/linked. From
    // here, a failure — thrown OR an empty response — must NOT fall into
    // the outer catch's revert-to-pending: that would make a real,
    // already-live athlete+membership look like nothing happened, and
    // invite the Head Coach to "retry" a request that's actually done.
    // Isolated in its own try/catch so both failure shapes land on
    // partial_success instead.
    try {
      const finalRows = await restUpdate<PendingAthleteRequest>(
        `pending_athlete_requests?id=eq.${encodeURIComponent(ctx.requestId)}`,
        {
          decided_by_account_id: ctx.decidedByAccountId,
          decided_at:            new Date().toISOString(),
          matched_athlete_id:    decision.action === "link" ? athleteId : null,
          resulting_athlete_id:  athleteId,
          resulting_member_id:   linkResult.member.id,
          updated_at:            new Date().toISOString(),
        },
      );
      if (!finalRows[0]) {
        return { ok: false, reason: "partial_success", athleteId, memberId: linkResult.member.id };
      }
      return { ok: true, request: finalRows[0] };
    } catch (finalErr) {
      console.error("[athleteRequests] approveRequest: athlete+member created but final update threw:", finalErr);
      return { ok: false, reason: "partial_success", athleteId, memberId: linkResult.member.id };
    }
  } catch (err) {
    console.error("[athleteRequests] approveRequest failed after claim:", err);
    try {
      await revertToPending(ctx.requestId);
    } catch (revertErr) {
      // Revert itself failed — log loudly, but still return a clean
      // modeled error rather than letting either exception reach the
      // route handler unhandled. The request may be left in "approved"
      // with no results in this rare case; getPendingRequestsForCampaign
      // (status=eq.pending) simply won't surface it, so it's silently
      // stuck rather than duplicated — the safer of the two failure modes.
      console.error("[athleteRequests] revertToPending also failed:", revertErr);
    }
    return { ok: false, reason: "internal_error" };
  }
}

export type DeclineRequestResult =
  | { ok: true;  request: PendingAthleteRequest }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "already_decided" }
  | { ok: false; reason: "internal_error" };

// Single atomic conditional UPDATE (WHERE status='pending') — unlike
// approveRequest() there's no claim-then-multi-step sequence and therefore
// no orphaned-state risk if this throws (nothing has been half-done), but
// it's still wrapped so the route handler never sees an unhandled
// exception either, keeping "always return valid JSON" true for both verbs.
export async function declineRequest(
  ctx: DecideRequestContext,
  declineReason?: string,
): Promise<DeclineRequestResult> {
  try {
    const rows = await restUpdate<PendingAthleteRequest>(
      `pending_athlete_requests?id=eq.${encodeURIComponent(ctx.requestId)}&campaign_slug=eq.${encodeURIComponent(ctx.campaignSlug)}&status=eq.pending`,
      {
        status:                 "declined",
        decided_by_account_id:  ctx.decidedByAccountId,
        decided_at:             new Date().toISOString(),
        decline_reason:         declineReason?.trim() || null,
        updated_at:             new Date().toISOString(),
      },
    );
    if (!rows[0]) {
      const check = await restList<PendingAthleteRequest>(
        `pending_athlete_requests?id=eq.${encodeURIComponent(ctx.requestId)}&campaign_slug=eq.${encodeURIComponent(ctx.campaignSlug)}&limit=1`,
      );
      return check[0] ? { ok: false, reason: "already_decided" } : { ok: false, reason: "not_found" };
    }
    return { ok: true, request: rows[0] };
  } catch (err) {
    console.error("[athleteRequests] declineRequest failed:", err);
    return { ok: false, reason: "internal_error" };
  }
}
