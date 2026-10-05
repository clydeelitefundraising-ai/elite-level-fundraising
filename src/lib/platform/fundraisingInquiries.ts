import { restList, restInsert, RestError } from "./_client";

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
