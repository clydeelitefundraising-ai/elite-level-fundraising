// Legacy team coach login (/api/team/auth/login): which team_coaches row a
// correct email + password signs into.
//
// The same email can be on several team_coaches rows — a coach on two
// teams, or (Complete Season) the same coach on consecutive seasons. The
// old lookup took `limit=1` with no order, so it could pick the wrong
// team, or a row whose password doesn't match. Now every row for the email
// is checked:
//   * no row's password matches              -> invalid credentials
//   * exactly one matches                    -> sign in to that team
//   * more than one matches (same password
//     on several teams)                      -> the coach must choose;
//                                               nothing is signed in
// Account-linked rows store the placeholder "unused" (they sign in with
// their ELF account), so they never match a typed password here.
export type LegacyCoachRow = {
  id: string;
  name: string;
  role: string;
  campaign_slug: string;
  password_hash: string;
  salt: string;
};

export type CoachLoginDecision =
  | { kind: "invalid" }
  | { kind: "signed_in"; coach: LegacyCoachRow }
  | { kind: "choose_team"; campaignSlugs: string[] };

export const UNUSED_PASSWORD_HASH = "unused";

export function decideCoachLogin(
  rows: readonly LegacyCoachRow[],
  password: string,
  hash: (password: string, salt: string) => string,
): CoachLoginDecision {
  const matches = rows.filter(r =>
    r && typeof r.salt === "string" && typeof r.password_hash === "string"
    && r.password_hash !== UNUSED_PASSWORD_HASH
    && hash(password, r.salt) === r.password_hash);
  if (matches.length === 0) return { kind: "invalid" };
  if (matches.length === 1) return { kind: "signed_in", coach: matches[0] };
  return { kind: "choose_team", campaignSlugs: [...new Set(matches.map(m => m.campaign_slug))].sort() };
}
