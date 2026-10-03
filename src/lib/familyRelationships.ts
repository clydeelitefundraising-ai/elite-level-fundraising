// Canonical family/guardian relationship resolution — Family Relationships
// Phase B. Single source of truth for "who is linked to which athlete,"
// unioning the legacy single team_members.athlete_id column with the
// team_member_athletes join table. Every consumer that needs this
// relationship (messaging, push, fundraiser/contacts) should call through
// here rather than re-deriving it, so they can never disagree.
//
// Deliberately account_id + campaign_slug keyed where the caller has an
// account rather than a specific member row in hand — Phase A made a
// coach-who-is-also-a-parent resolve as kind:"coach" for authorization, and
// family relationships must remain fully orthogonal to that: a coach-kind
// actor has no team_members.id of their own to look up by, only an
// account_id. This module never reads parent_access_requests — a pending
// request grants no family access, only an approved (live) team_members +
// team_member_athletes row does.
//
// No writes. No schema change. Deliberately free of any import from
// teamData.ts or messages.ts (both of which need to import THIS module),
// so the import graph stays acyclic.
import { restList } from "./platform/_client.ts";

export type FamilyMemberRole = "athlete" | "parent" | "booster";

type RawMemberRow = { id: string; role: FamilyMemberRole; athlete_id: string | null; account_id: string | null };

export type FamilyRelatedMember = { id: string; role: FamilyMemberRole; account_id: string | null };

// Every athlete id a single team_members row (identified by memberId) has
// an approved relationship to — unions the legacy single athlete_id column
// with every team_member_athletes row for that member. No backfill
// required: a single-child parent linked only the legacy way still
// resolves correctly; only a second/third child needs a join-table row.
export async function getLinkedAthleteIdsForMember(
  memberId: string,
  legacyAthleteId: string | null,
): Promise<string[]> {
  const rows = await restList<{ athlete_id: string }>(
    `team_member_athletes?team_member_id=eq.${encodeURIComponent(memberId)}&select=athlete_id`,
  );
  const ids = new Set(rows.map(r => r.athlete_id));
  if (legacyAthleteId) ids.add(legacyAthleteId);
  return [...ids];
}

// Account -> athletes: every athlete id this account has an approved family
// relationship with, on this one campaign — regardless of whether the
// account currently resolves as a coach or a member actor there. Returns []
// for an account with no team_members row on this campaign at all
// (including a coach-only account with no family relationship, and an
// account whose only relationship here is a still-pending
// parent_access_requests row — that table is never consulted).
export async function getFamilyAthleteIdsForAccount(
  accountId: string,
  campaignSlug: string,
): Promise<string[]> {
  const rows = await restList<RawMemberRow>(
    `team_members?account_id=eq.${encodeURIComponent(accountId)}&campaign_slug=eq.${encodeURIComponent(campaignSlug)}&select=id,role,athlete_id,account_id&limit=1`,
  );
  const member = rows[0];
  if (!member) return [];
  return getLinkedAthleteIdsForMember(member.id, member.athlete_id);
}

// Athlete -> guardians: every team_members row (the athlete's own row, plus
// every approved parent) with an approved relationship to this athlete, on
// this one campaign — unions the legacy column with the join table, from
// the athlete's side. Campaign-scoped on every branch, including the
// join-table branch (team_member_athletes itself carries no campaign_slug,
// so the resulting member ids are re-filtered by campaign here — defense
// in depth against a cross-campaign link that should never exist in
// practice, since approveRequest() always validates the athlete belongs to
// the campaign it's linking into).
export async function getFamilyMembersForAthlete(
  athleteId: string,
  campaignSlug: string,
): Promise<FamilyRelatedMember[]> {
  const slug = encodeURIComponent(campaignSlug);

  const [legacyRows, linkRows] = await Promise.all([
    restList<RawMemberRow>(
      `team_members?athlete_id=eq.${encodeURIComponent(athleteId)}&campaign_slug=eq.${slug}&role=in.(athlete,parent)&select=id,role,athlete_id,account_id`,
    ),
    restList<{ team_member_id: string }>(
      `team_member_athletes?athlete_id=eq.${encodeURIComponent(athleteId)}&select=team_member_id`,
    ),
  ]);

  const linkedMemberIds = [...new Set(linkRows.map(r => r.team_member_id))];
  const linkedRows = linkedMemberIds.length
    ? await restList<RawMemberRow>(
        `team_members?id=in.(${linkedMemberIds.map(encodeURIComponent).join(",")})&campaign_slug=eq.${slug}&role=in.(athlete,parent)&select=id,role,athlete_id,account_id`,
      )
    : [];

  const byId = new Map<string, FamilyRelatedMember>();
  for (const m of [...legacyRows, ...linkedRows]) {
    byId.set(m.id, { id: m.id, role: m.role, account_id: m.account_id });
  }
  return [...byId.values()];
}
