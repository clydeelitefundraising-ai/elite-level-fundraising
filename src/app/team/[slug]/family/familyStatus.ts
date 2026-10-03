// Family Relationships Phase D — pure composition of "roster + linked ids +
// pending ids" into the three parent-facing statuses this page shows.
// Deliberately NOT a new relationship system: linkedIds comes from the
// existing getFamilyAthleteIdsForAccount(), pendingIds from the existing
// getVisiblePendingRequestsForAccount() (pre-filtered to this campaign by
// the caller — see page.tsx) — this function only decides, for a given
// roster, which of three buckets each athlete falls into. No "Declined"
// bucket exists on purpose: a previously-declined athlete has no linked or
// pending row, so it naturally lands in `searchable` (requestable again),
// matching createPendingRequest()'s own existing declined-to-new-pending
// behavior without any special-casing here.
export type FamilyAthlete = { id: string; name: string; event: string | null };

export type FamilyStatus = {
  linked:     FamilyAthlete[];
  pending:    FamilyAthlete[];
  searchable: FamilyAthlete[];
};

export function computeFamilyStatus(
  roster: FamilyAthlete[],
  linkedIds: readonly string[],
  pendingIds: readonly string[],
): FamilyStatus {
  const linkedSet  = new Set(linkedIds);
  // An athlete already linked is never also shown as pending, even if a
  // stale pending row somehow still exists — LINKED reflects the actual,
  // live access level and takes precedence.
  const pendingSet = new Set(pendingIds);

  const linked:     FamilyAthlete[] = [];
  const pending:    FamilyAthlete[] = [];
  const searchable: FamilyAthlete[] = [];

  for (const athlete of roster) {
    if (linkedSet.has(athlete.id)) linked.push(athlete);
    else if (pendingSet.has(athlete.id)) pending.push(athlete);
    else searchable.push(athlete);
  }

  return { linked, pending, searchable };
}
