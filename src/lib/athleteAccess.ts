// Pure decision logic for "may this actor open athlete X's profile" —
// shared by the roster's UI click-gating (TeamView.tsx, a nicety only)
// and the real server-side authorization check
// (permissions.server.ts::canAccessAthleteProfile, the actual boundary).
// Kept side-effect-free and DB-free so both call sites can share exactly
// one rule and so the rule itself is unit-testable without mocking fetch.
export function canViewAthleteProfile(input: {
  isStaffActor: boolean;
  memberRole: "athlete" | "parent" | "booster" | null;
  selfAthleteId: string | null;
  linkedAthleteIds: string[];
  athleteId: string;
}): boolean {
  const { isStaffActor, memberRole, selfAthleteId, linkedAthleteIds, athleteId } = input;
  if (isStaffActor) return true;
  if (memberRole === "athlete") return selfAthleteId === athleteId;
  if (memberRole === "parent") {
    return selfAthleteId === athleteId || linkedAthleteIds.includes(athleteId);
  }
  // booster members are staff (see isStaff()) and already returned above;
  // any other/unrecognized role is denied.
  return false;
}
