// Coach Fundraising Participation — Phase A35.
//
// Centralizes all coach-fundraising business logic (mirrors how
// postLikes.ts/parentAccessRequests.ts centralize their own domains).
// Every API route touching coach fundraising should call into this file,
// not reimplement the eligibility/validation logic inline.
//
// Architecture: additive polymorphic sibling-column pattern (donations/
// fundraising_contacts/athlete_outreach each get a nullable coach_id
// alongside the existing athlete_id), NOT a generalized participant
// table — see supabase/migrations/phase_a35_coach_fundraising.sql for the
// full rationale.

import { restList, restInsert, restUpdate } from "./_client.ts";
import { isCoachOnly, isStaff, isHeadCoach } from "../permissions.ts";
import type { TeamActor } from "../permissions.ts";

export type CoachFundraiserRow = {
  id:            string;
  campaign_slug: string;
  coach_id:      string;
  active:        boolean;
  goal_cents:    number | null;
  created_at:    string;
  updated_at:    string;
};

export type CoachInfo = { id: string; name: string; role: "head_coach" | "assistant_coach" | "booster" };

export type CoachFundraiserWithInfo = CoachFundraiserRow & CoachInfo;

// Minimal campaign-settings read — avoids importing the much larger
// src/lib/supabase.ts (server-only, would create a circular-ish coupling
// for what's just two fields) from this platform module.
async function getAllowCoachFundraising(campaignSlug: string): Promise<boolean> {
  const rows = await restList<{ allow_coach_fundraising: boolean }>(
    `campaign_settings?campaign_slug=eq.${encodeURIComponent(campaignSlug)}&select=allow_coach_fundraising&limit=1`,
  );
  return rows[0]?.allow_coach_fundraising === true;
}

async function getTeamCoachesByIds(coachIds: string[]): Promise<Record<string, CoachInfo>> {
  if (coachIds.length === 0) return {};
  const idsFilter = coachIds.map(id => encodeURIComponent(id)).join(",");
  const rows = await restList<CoachInfo>(`team_coaches?id=in.(${idsFilter})&select=id,name,role`);
  return Object.fromEntries(rows.map(r => [r.id, r]));
}

// All participation rows for a campaign, joined with team_coaches (name,
// role) for display — regardless of active/allow_coach_fundraising state
// (callers that need "currently live" behavior should use
// getActiveCoachFundraisers below; this is the raw admin-facing list).
export async function getCoachFundraisers(campaignSlug: string): Promise<CoachFundraiserWithInfo[]> {
  const rows = await restList<CoachFundraiserRow>(
    `campaign_coach_fundraisers?campaign_slug=eq.${encodeURIComponent(campaignSlug)}&select=*`,
  );
  const coachInfo = await getTeamCoachesByIds(rows.map(r => r.coach_id));
  return rows
    .map(r => {
      const info = coachInfo[r.coach_id];
      if (!info) return null;
      return { ...r, ...info };
    })
    .filter((r): r is CoachFundraiserWithInfo => r !== null);
}

// Same, but filtered to rows that are actually LIVE right now: the
// campaign has allow_coach_fundraising=true AND the row is active=true.
// Never infer participation solely from row existence.
export async function getActiveCoachFundraisers(campaignSlug: string): Promise<CoachFundraiserWithInfo[]> {
  const allowed = await getAllowCoachFundraising(campaignSlug);
  if (!allowed) return [];
  const all = await getCoachFundraisers(campaignSlug);
  return all.filter(r => r.active);
}

export async function getCoachFundraiserById(coachId: string, campaignSlug: string): Promise<CoachFundraiserRow | null> {
  const rows = await restList<CoachFundraiserRow>(
    `campaign_coach_fundraisers?campaign_slug=eq.${encodeURIComponent(campaignSlug)}&coach_id=eq.${encodeURIComponent(coachId)}&select=*&limit=1`,
  );
  return rows[0] ?? null;
}

// Public-safe coach lookup for share links (?coach=<id>) — unlike an
// internal-only coach lookup, this one is reachable by an unauthenticated
// visitor, so it must verify the coach is an ACTIVE participant in a
// campaign with allow_coach_fundraising=true before returning anything.
// A non-participating/deselected/booster coach's id returns null, exactly
// like a stale/cross-campaign athlete id already does for getAthleteById.
export async function getCoachById(coachId: string, campaignSlug: string): Promise<CoachInfo | null> {
  const ok = await validateCoachForCampaign(coachId, campaignSlug);
  if (!ok) return null;
  const rows = await restList<CoachInfo>(
    `team_coaches?id=eq.${encodeURIComponent(coachId)}&campaign_slug=eq.${encodeURIComponent(campaignSlug)}&select=id,name,role&limit=1`,
  );
  return rows[0] ?? null;
}

// The single authoritative "can this coach currently receive newly
// attributed donations / be shown as a participant" check. Mirrors
// validateAthleteForCampaign's role (src/lib/platform/athletes.ts).
// Checks, in order: campaign has allow_coach_fundraising=true, a
// campaign_coach_fundraisers row exists for this coach+campaign and is
// active, and the coach's team_coaches.role is head_coach or
// assistant_coach (never booster).
export async function validateCoachForCampaign(coachId: string, campaignSlug: string): Promise<boolean> {
  if (!coachId) return false;
  const allowed = await getAllowCoachFundraising(campaignSlug);
  if (!allowed) return false;

  const participant = await getCoachFundraiserById(coachId, campaignSlug);
  if (!participant || !participant.active) return false;

  const coachRows = await restList<{ role: string }>(
    `team_coaches?id=eq.${encodeURIComponent(coachId)}&campaign_slug=eq.${encodeURIComponent(campaignSlug)}&select=role&limit=1`,
  );
  const role = coachRows[0]?.role;
  return role === "head_coach" || role === "assistant_coach";
}

export type UpsertCoachParticipantResult =
  | { ok: true; row: CoachFundraiserRow }
  | { ok: false; reason: "not_eligible" };

// Select/deselect a coach + set their goal in one call. Enforces
// isCoachOnly() eligibility (rejects a booster coach_id) at this layer
// too, as defense in depth alongside the API route's own check — a
// booster must never become active=true here regardless of caller.
export async function upsertCoachParticipant(
  campaignSlug: string,
  coachId: string,
  input: { active: boolean; goal_cents?: number | null },
): Promise<UpsertCoachParticipantResult> {
  const coachRows = await restList<{ id: string; role: string; campaign_slug: string }>(
    `team_coaches?id=eq.${encodeURIComponent(coachId)}&campaign_slug=eq.${encodeURIComponent(campaignSlug)}&select=id,role,campaign_slug&limit=1`,
  );
  const coach = coachRows[0];
  const eligible = coach && (coach.role === "head_coach" || coach.role === "assistant_coach");
  if (!eligible) return { ok: false, reason: "not_eligible" };

  const existing = await getCoachFundraiserById(coachId, campaignSlug);
  const now = new Date().toISOString();

  if (existing) {
    const rows = await restUpdate<CoachFundraiserRow>(
      `campaign_coach_fundraisers?id=eq.${encodeURIComponent(existing.id)}`,
      {
        active:     input.active,
        goal_cents: input.goal_cents ?? null,
        updated_at: now,
      },
    );
    return { ok: true, row: rows[0] };
  }

  const rows = await restInsert<CoachFundraiserRow>("campaign_coach_fundraisers", {
    campaign_slug: campaignSlug,
    coach_id:      coachId,
    active:        input.active,
    goal_cents:    input.goal_cents ?? null,
  });
  return { ok: true, row: rows[0] };
}

// Id-first coach totals (mirrors the CSV export's better id-first pattern
// in analytics/export/athletes/route.ts, not campaign-stats' weaker
// name-keyed pattern) — sums donations.amount_cents grouped by coach_id.
export async function getCoachTotals(campaignSlug: string): Promise<Record<string, number>> {
  const rows = await restList<{ coach_id: string | null; amount_cents: number }>(
    `donations?campaign_slug=eq.${encodeURIComponent(campaignSlug)}&coach_id=not.is.null&select=coach_id,amount_cents`,
  );
  const totals: Record<string, number> = {};
  for (const r of rows) {
    if (!r.coach_id) continue;
    totals[r.coach_id] = (totals[r.coach_id] ?? 0) + r.amount_cents;
  }
  return totals;
}

export async function getCoachDonorCounts(campaignSlug: string): Promise<Record<string, number>> {
  const rows = await restList<{ coach_id: string | null }>(
    `donations?campaign_slug=eq.${encodeURIComponent(campaignSlug)}&coach_id=not.is.null&select=coach_id`,
  );
  const counts: Record<string, number> = {};
  for (const r of rows) {
    if (!r.coach_id) continue;
    counts[r.coach_id] = (counts[r.coach_id] ?? 0) + 1;
  }
  return counts;
}

// Coach-keyed equivalent of getContactCountsByAthlete (src/lib/teamData.ts).
export async function getContactCountsByCoach(campaignSlug: string): Promise<Record<string, number>> {
  const rows = await restList<{ coach_id: string | null }>(
    `fundraising_contacts?campaign_slug=eq.${encodeURIComponent(campaignSlug)}&coach_id=not.is.null&select=coach_id`,
  );
  const counts: Record<string, number> = {};
  for (const r of rows) {
    if (!r.coach_id) continue;
    counts[r.coach_id] = (counts[r.coach_id] ?? 0) + 1;
  }
  return counts;
}

export type OutreachCurrentRow = {
  athlete_id:       string | null;
  subject_coach_id: string | null;
  campaign_slug:    string;
  status:           "contacted" | "needs_follow_up" | "resolved";
  note:             string | null;
  contacted_by:     string | null;
  coach_id:         string | null; // actor — who performed the outreach, NOT the subject
  created_at:       string;
};

// Coach-keyed equivalent of getOutreachMap (src/lib/teamData.ts) —
// latest outreach row per SUBJECT coach, distinct from the existing
// actor-tracking coach_id column on the same table.
export async function getOutreachMapByCoach(campaignSlug: string): Promise<Record<string, OutreachCurrentRow>> {
  const rows = await restList<{ athlete_id: string | null; campaign_slug: string; status: OutreachCurrentRow["status"]; note: string | null; contacted_by: string | null; coach_id: string | null; subject_coach_id: string | null; created_at: string }>(
    `athlete_outreach?campaign_slug=eq.${encodeURIComponent(campaignSlug)}&subject_coach_id=not.is.null&order=created_at.desc&select=athlete_id,campaign_slug,status,note,contacted_by,coach_id,subject_coach_id,created_at`,
  );
  const bySubject: Record<string, OutreachCurrentRow> = {};
  for (const r of rows) {
    if (!r.subject_coach_id) continue;
    // rows are ordered created_at.desc, so the first hit per subject is the latest
    if (!bySubject[r.subject_coach_id]) bySubject[r.subject_coach_id] = r as OutreachCurrentRow;
  }
  return bySubject;
}

// Server-side "which coach id may this actor manage contacts/outreach
// for" resolver — never trusts a client-supplied coach id for ownership.
// Returns null when the actor isn't an eligible coach-only actor
// (isCoachOnly excludes boosters) or platform admin acting on their own
// behalf has no team_coaches row to scope to.
export function ownCoachIdForActor(actor: TeamActor): string | null {
  if (actor.kind === "coach" && isCoachOnly(actor)) return actor.session.id;
  return null;
}

// Server-side "may this actor edit/delete THIS contact" decision, used by
// contacts/[id]/route.ts's PATCH and DELETE handlers. A single source of
// truth so the two handlers can't drift.
//
// athlete-owned contact (contact.athlete_id set): UNCHANGED from the
// pre-coach-fundraising behavior — any staff actor (isStaff(), which
// includes every coach role AND boosters) may manage it, or the matching
// member (athlete/parent sharing that athlete_id). This is deliberately
// broad because staff already coordinate roster-wide outreach together.
//
// coach-owned contact (contact.coach_id set): DELIBERATELY TIGHTER — a
// coach's own fundraising contacts are personal to them, not roster-wide,
// so only that same coach (by session id, never a client-supplied id) or
// isHeadCoach() (head coach / platform admin, who retain campaign-wide
// management authority) may manage it. A different active coach, or a
// booster (isStaff() would otherwise include them), may not.
export function canManageContact(
  actor: TeamActor,
  contact: { athlete_id: string | null; coach_id: string | null },
): boolean {
  if (contact.coach_id) {
    if (isHeadCoach(actor)) return true;
    return actor.kind === "coach" && actor.session.id === contact.coach_id;
  }

  if (isStaff(actor)) return true;
  if (actor.kind !== "member") return false;
  const { session } = actor;
  if (session.role !== "athlete" && session.role !== "parent") return false;
  return Boolean(session.athlete_id) && session.athlete_id === contact.athlete_id;
}
