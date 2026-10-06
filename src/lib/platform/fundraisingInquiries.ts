import { restList, restInsert, restUpdate, restCount, RestError } from "./_client";

export type FundraisingInquiryStatus = "new" | "contacted" | "resolved";

export type FundraisingInquiry = {
  id:                       string;
  campaign_slug:            string;
  requested_by_account_id:  string;
  requested_by_role:        "head_coach" | "assistant_coach";
  status:                   FundraisingInquiryStatus;
  created_at:               string;
  decided_by_account_id:    string | null;
  decided_at:               string | null;
};

const SELECT = "id,campaign_slug,requested_by_account_id,requested_by_role,status,created_at,decided_by_account_id,decided_at";

/** The campaign's current active inquiry, if any — "active" is the full
 *  unresolved lifecycle (new -> contacted), not just the initial state; at
 *  most one can ever exist per campaign (see fundraising_inquiries_active_uniq
 *  in phase_f1b_fundraising_inquiries.sql, which matches this same
 *  new/contacted set). Used both to render the already-requested state and
 *  to decide whether a new submission would violate that constraint before
 *  attempting the insert. A resolved inquiry is never "active" — once
 *  resolved, a later submission is allowed to create a new one. */
export async function getActiveFundraisingInquiry(campaignSlug: string): Promise<FundraisingInquiry | null> {
  const rows = await restList<FundraisingInquiry>(
    `fundraising_inquiries?campaign_slug=eq.${encodeURIComponent(campaignSlug)}&status=in.(new,contacted)&select=${SELECT}&limit=1`,
  );
  return rows[0] ?? null;
}

/** Creates a new inquiry, or returns the existing active one if the unique
 *  index rejects this insert as a duplicate (a second coach, or the same
 *  coach double-clicking, racing the check in getActiveFundraisingInquiry
 *  above) — the route never surfaces that race as an error to the caller. */
export async function createFundraisingInquiry(params: {
  campaignSlug:         string;
  requestedByAccountId: string;
  requestedByRole:      "head_coach" | "assistant_coach";
}): Promise<{ inquiry: FundraisingInquiry; created: boolean }> {
  try {
    const rows = await restInsert<FundraisingInquiry>("fundraising_inquiries", {
      campaign_slug:            params.campaignSlug,
      requested_by_account_id:  params.requestedByAccountId,
      requested_by_role:        params.requestedByRole,
    });
    return { inquiry: rows[0], created: true };
  } catch (err) {
    if (err instanceof RestError && err.code === "23505") {
      const existing = await getActiveFundraisingInquiry(params.campaignSlug);
      if (existing) return { inquiry: existing, created: false };
    }
    throw err;
  }
}

// ── Phase F1d: Platform Admin inquiry management ────────────────────────────

/** Every inquiry, newest first — the full operational queue for the Platform
 *  Admin page. Deliberately unfiltered (no status param) since the page
 *  itself filters/groups client-side — this repo's established "small
 *  queue, no pagination" pattern (see getAllReports in
 *  src/lib/moderation/reports.ts), appropriate at this feature's expected
 *  volume (one inquiry per inactive team at most, per the active-uniqueness
 *  index). */
export async function listFundraisingInquiries(): Promise<FundraisingInquiry[]> {
  return restList<FundraisingInquiry>(`fundraising_inquiries?select=${SELECT}&order=created_at.desc`);
}

/** Cheap count for the nav badge — never throws (restCount's own contract),
 *  so a transient failure shows no badge rather than breaking the page. */
export async function countNewFundraisingInquiries(): Promise<number> {
  return restCount(`fundraising_inquiries?status=eq.new&select=id&limit=1`);
}

export type FundraisingInquiryCampaignContext = {
  campaign_slug: string;
  school_name:   string;
  sport_name:    string;
  season:        string;
};

/** Batched campaign_settings lookup for a set of inquiries' campaign_slugs —
 *  one query regardless of how many inquiries are in the queue, never N+1. */
export async function getCampaignContextsForSlugs(campaignSlugs: string[]): Promise<Record<string, FundraisingInquiryCampaignContext>> {
  const unique = Array.from(new Set(campaignSlugs));
  if (unique.length === 0) return {};
  const rows = await restList<FundraisingInquiryCampaignContext>(
    `campaign_settings?campaign_slug=in.(${unique.map(encodeURIComponent).join(",")})&select=campaign_slug,school_name,sport_name,season`,
  );
  return Object.fromEntries(rows.map(r => [r.campaign_slug, r]));
}

/** Resolves a display name for each requested_by_account_id, batched (one
 *  query per table, never N+1).
 *
 *  F1d audit finding: requested_by_account_id is, in EVERY current
 *  submission path, a team_coaches.id — never an elf_accounts.id. The
 *  inquiry API route (src/app/api/team/[slug]/fundraising-inquiries/
 *  route.ts) always stores `actor.session.id` for a "coach" TeamActor, and
 *  that id is team_coaches.id regardless of whether the session came from
 *  the legacy team_coach cookie (src/lib/teamSession.ts) or an elf_session-
 *  backed account (accountSession.ts's toCoachActor) — both construct the
 *  CoachSession from the same team_coaches row's own id column, never the
 *  linked account's id. The column still has no FK (see the F1b migration's
 *  rationale comment) and the schema doesn't forbid some other future write
 *  path from storing an elf_accounts.id directly, so this still never
 *  assumes team_coaches is the only possible answer — any id the first
 *  lookup can't resolve is tried against elf_accounts before this function
 *  gives up and leaves it null for the caller's "Coach" fallback. */
export async function resolveFundraisingInquiryRequesterNames(accountIds: string[]): Promise<Record<string, string | null>> {
  const unique = Array.from(new Set(accountIds));
  const result: Record<string, string | null> = {};
  for (const id of unique) result[id] = null;
  if (unique.length === 0) return result;

  const idList = unique.map(encodeURIComponent).join(",");
  const coachRows = await restList<{ id: string; name: string }>(`team_coaches?id=in.(${idList})&select=id,name`);
  for (const row of coachRows) result[row.id] = row.name;

  const unresolved = unique.filter(id => result[id] === null);
  if (unresolved.length > 0) {
    const accountRows = await restList<{ id: string; name: string }>(
      `elf_accounts?id=in.(${unresolved.map(encodeURIComponent).join(",")})&select=id,name`,
    );
    for (const row of accountRows) result[row.id] = row.name;
  }

  return result;
}

/** Pure status-transition rule — extracted so it's directly unit-testable
 *  without a database. Terminal-resolved: once an inquiry reaches
 *  "resolved" it can never move again from this simple admin workflow (no
 *  established repository convention argues for reopening one, and the
 *  product spec explicitly asks for resolved to be terminal). A same-status
 *  "transition" (e.g. contacted -> contacted) is also rejected — callers
 *  only ever request an actual change. */
export function isValidInquiryStatusTransition(
  current: FundraisingInquiryStatus,
  target: "contacted" | "resolved",
): boolean {
  if (current === "new") return target === "contacted" || target === "resolved";
  if (current === "contacted") return target === "resolved";
  return false; // current === "resolved": terminal
}

export type UpdateInquiryStatusResult =
  | { ok: true; inquiry: FundraisingInquiry }
  | { ok: false; error: "not_found" | "invalid_transition" };

/** The only write path for an inquiry's status after creation. Contacted
 *  leaves decided_at/decided_by_account_id untouched (still null) — those
 *  two fields exist specifically to record WHO resolved it and WHEN,
 *  meaningless for an in-progress "contacted" state. Resolved sets both,
 *  decided_by_account_id always from the caller's own authenticated
 *  Platform Admin identity (an elf_accounts.id), never a client-supplied
 *  value — the route itself is responsible for passing that, never trusting
 *  a request body field for it. */
export async function updateFundraisingInquiryStatus(
  id: string,
  targetStatus: "contacted" | "resolved",
  decidedByAccountId: string,
): Promise<UpdateInquiryStatusResult> {
  const existingRows = await restList<FundraisingInquiry>(
    `fundraising_inquiries?id=eq.${encodeURIComponent(id)}&select=${SELECT}&limit=1`,
  );
  const existing = existingRows[0];
  if (!existing) return { ok: false, error: "not_found" };
  if (!isValidInquiryStatusTransition(existing.status, targetStatus)) {
    return { ok: false, error: "invalid_transition" };
  }

  const patch: Record<string, unknown> = { status: targetStatus };
  if (targetStatus === "resolved") {
    patch.decided_at = new Date().toISOString();
    patch.decided_by_account_id = decidedByAccountId;
  }

  const updated = await restUpdate<FundraisingInquiry>(`fundraising_inquiries?id=eq.${encodeURIComponent(id)}`, patch);
  return { ok: true, inquiry: updated[0] };
}
