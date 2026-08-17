// Phase 6: Fundraiser Follow-Ups — pure, roster-first data shaping.
//
// THE ROSTER IS THE SOURCE OF TRUTH FOR WHO APPEARS. buildFollowUpRows
// always starts from `athletes` (the complete getTeamAthletes(slug)
// result) and enriches each row by looking values up FROM the other
// datasets BY athlete id — it never iterates contacts/donations/outreach
// and joins outward to athletes. A roster athlete with no account, no
// contacts, no donations, and no outreach history still produces a row:
// {contacts: 0, raisedCents: 0, outreachStatus: null}.
import type { TeamAthleteRow, OutreachCurrentRow } from "./teamData.ts";
import type { DonationRow } from "./supabase.ts";
import { attributeDonationsToAthletes } from "./donationAttribution.ts";

export type FollowUpRow = {
  id:             string;
  name:           string;
  contacts:       number;
  raisedCents:    number;
  outreachStatus: OutreachCurrentRow["status"] | null;
  outreachNote:   string | null;
  outreachAt:     string | null;
};

export function buildFollowUpRows(
  athletes: TeamAthleteRow[],
  donations: DonationRow[],
  contactCounts: Record<string, number>,
  outreachMap: Record<string, OutreachCurrentRow>,
): FollowUpRow[] {
  const { totalsCents } = attributeDonationsToAthletes(athletes, donations);

  return athletes.map(a => {
    const outreach = outreachMap[a.id] ?? null;
    return {
      id:             a.id,
      name:           a.name,
      contacts:       contactCounts[a.id] ?? 0,
      raisedCents:    totalsCents[a.id] ?? 0,
      outreachStatus: outreach?.status ?? null,
      outreachNote:   outreach?.note ?? null,
      outreachAt:     outreach?.created_at ?? null,
    };
  });
}

// ── Sorting / filtering ──────────────────────────────────────────────────

export type FollowUpSort = "contacts_asc" | "contacts_desc" | "raised_asc" | "raised_desc";
export type FollowUpFilter = "all" | "needs_follow_up";

export const DEFAULT_FOLLOW_UP_SORT: FollowUpSort = "contacts_asc";

export function sortFollowUpRows(rows: FollowUpRow[], sort: FollowUpSort): FollowUpRow[] {
  const sorted = [...rows];
  switch (sort) {
    case "contacts_asc":  sorted.sort((a, b) => a.contacts - b.contacts); break;
    case "contacts_desc": sorted.sort((a, b) => b.contacts - a.contacts); break;
    case "raised_asc":    sorted.sort((a, b) => a.raisedCents - b.raisedCents); break;
    case "raised_desc":   sorted.sort((a, b) => b.raisedCents - a.raisedCents); break;
  }
  return sorted;
}

export function filterFollowUpRows(rows: FollowUpRow[], filter: FollowUpFilter): FollowUpRow[] {
  if (filter === "needs_follow_up") return rows.filter(r => r.outreachStatus === "needs_follow_up");
  return rows;
}

// ── Print report title — reflects the currently active filter ──────────

export function buildFollowUpsReportTitle(filter: FollowUpFilter, filteredCount: number, totalCount: number): string {
  return filter === "needs_follow_up"
    ? `Needs Follow Up — ${filteredCount} of ${totalCount} Athletes`
    : "Fundraising Athlete Report";
}
