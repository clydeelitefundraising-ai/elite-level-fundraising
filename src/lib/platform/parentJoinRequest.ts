// Family Relationships Phase C2 — parent multi-athlete join orchestration.
//
// Deliberately thin: normalizes/validates the client-submitted athlete id
// list, then calls the EXISTING, unmodified createPendingRequest() once per
// athlete, sequentially. Does not reimplement any campaign/athlete
// validation, duplicate handling, or membership logic — all of that already
// lives in parentAccessRequests.ts (Phase 11a) and is reused as-is. This
// file only answers "which ids to process" and "how to summarize what
// happened," never "is this id valid" or "what should a duplicate do."
import { createPendingRequest } from "./parentAccessRequests.ts";

// Expected workload is 1–3 children per household; 10 is generous headroom
// without letting one HTTP request fan out into an unbounded number of DB
// operations (same reasoning as the roster importer's row cap).
export const MAX_PARENT_JOIN_ATHLETES = 10;

export type NormalizeAthleteIdsResult =
  | { ok: true; athleteIds: string[] }
  | { ok: false; error: string };

// Precedence (deliberate): if "athleteIds" is present in the body AT ALL,
// it is the authoritative field and MUST be a well-formed array of
// strings — a malformed athleteIds value is rejected outright, never
// silently ignored in favor of the legacy "athlete_id" field. This closes
// the exact bypass a client could otherwise attempt by sending a bogus
// athleteIds alongside a valid legacy athlete_id. Only when "athleteIds" is
// entirely absent does the legacy singular "athlete_id" apply, normalized
// to a one-element array so every downstream caller has one shape to deal
// with regardless of which field the client used.
export function normalizeParentAthleteIds(body: {
  athleteIds?: unknown;
  athlete_id?: unknown;
}): NormalizeAthleteIdsResult {
  if (body.athleteIds !== undefined) {
    if (!Array.isArray(body.athleteIds)) {
      return { ok: false, error: "athleteIds must be a list of athlete IDs." };
    }
    if (!body.athleteIds.every((id): id is string => typeof id === "string")) {
      return { ok: false, error: "Each athlete ID must be a string." };
    }
    const deduped = [...new Set(body.athleteIds.map(id => id.trim()).filter(id => id.length > 0))];
    if (deduped.length === 0) {
      return { ok: false, error: "Please select at least one athlete." };
    }
    if (deduped.length > MAX_PARENT_JOIN_ATHLETES) {
      return { ok: false, error: `You can request up to ${MAX_PARENT_JOIN_ATHLETES} athletes at a time.` };
    }
    return { ok: true, athleteIds: deduped };
  }

  if (typeof body.athlete_id === "string" && body.athlete_id.trim()) {
    return { ok: true, athleteIds: [body.athlete_id.trim()] };
  }

  return { ok: false, error: "Please select your child from the roster." };
}

export type ParentJoinAthleteResult =
  | { athleteId: string; status: "created"; requestId: string }
  | { athleteId: string; status: "already_pending" }
  | { athleteId: string; status: "already_member"; memberId: string }
  | { athleteId: string; status: "failed"; reason: string };

export type SubmitParentAthleteRequestsInput = {
  campaignSlug: string;
  accountId:    string;
  parentName:   string;
};

// Sequential by design — NOT Promise.all. Each athlete is fully independent:
// one failing (not found, cross-campaign, a transient error) must never
// roll back or block the siblings already processed. createPendingRequest()
// itself is idempotent per athlete (already-pending/already-approved are
// both safe no-ops), so re-submitting the exact same set twice — e.g. a
// retry after a partial failure — can never spam duplicate pending rows.
// Never surfaces a raw PostgREST/Supabase error to the caller; any
// unexpected throw is caught and mapped to a generic, safe reason.
export async function submitParentAthleteRequests(
  athleteIds: string[],
  input: SubmitParentAthleteRequestsInput,
): Promise<ParentJoinAthleteResult[]> {
  const results: ParentJoinAthleteResult[] = [];

  for (const athleteId of athleteIds) {
    try {
      const result = await createPendingRequest({
        campaignSlug: input.campaignSlug,
        accountId:    input.accountId,
        parentName:   input.parentName,
        athleteId,
      });

      if (!result.ok) {
        results.push({
          athleteId,
          status: "failed",
          reason: result.reason === "athlete_not_found"
            ? "Athlete not found for this team."
            : result.message,
        });
        continue;
      }

      if (result.alreadyMember) {
        results.push({ athleteId, status: "already_member", memberId: result.memberId });
      } else if (result.alreadyPending) {
        results.push({ athleteId, status: "already_pending" });
      } else {
        results.push({ athleteId, status: "created", requestId: result.request.id });
      }
    } catch {
      results.push({ athleteId, status: "failed", reason: "Something went wrong. Please try again." });
    }
  }

  return results;
}
