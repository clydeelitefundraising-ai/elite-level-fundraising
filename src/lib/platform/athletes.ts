// Canonical athlete identity service — Phase 1A.
//
// Single entrypoint for single-athlete creation across all production paths
// (admin roster, coach roster). Bulk/onboarding athlete creation
// (admin/onboard's starter_athletes) and demo/seed bulk creation are
// deliberately NOT routed through this — different validation shape, out of
// scope for Phase 1A.
//
// No DB uniqueness constraint backs the collision check below (jersey
// numbers are intentionally not unique; exact-name collisions are an
// application-level warning, not a DB-level rule) — see Phase 1A plan.

import { restList, restInsert, restUpdate, restDelete } from "./_client.ts";
import { generateMemberSalt } from "../memberAuth.ts";

export type AthleteRow = {
  id:             string;
  campaign_slug:  string;
  name:           string;
  event:          string | null;
  class_year:     string | null;
  jersey_number:  number | null;
  grad_year:      number | null;
  profile_photo:  string | null;
  goal_cents:     number | null;
  contact_phone:  string | null;
  contact_email:  string | null;
  created_at:     string;
};

export type CreateAthleteInput = {
  campaignSlug:  string;
  name:          string;
  classYear:     string;
  event?:        string | null;
  jerseyNumber?: number | null;
  gradYear?:     number | null;
  profilePhoto?: string | null;
  goalCents?:    number | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
};

export type CreateAthleteOptions = {
  // Explicit caller acknowledgement to proceed past an exact-name collision.
  overrideCollision?: boolean;
};

export type AthleteCollision = {
  type:     "exact_duplicate";
  existing: AthleteRow;
};

export type CreateAthleteResult =
  | { ok: true;  athlete: AthleteRow }
  | { ok: false; reason: "validation"; message: string }
  | { ok: false; reason: "collision";  collision: AthleteCollision };

export type PossibleDuplicate = {
  athlete:    AthleteRow;
  similarity: number; // 0..1, 1 = identical after normalization
};

export type LinkMemberResult =
  | { ok: true }
  | { ok: false; reason: "not_found" };

// Safe member-to-athlete linking helper for Phase 1B, now scoped to
// role="athlete" only (Phase 11a routes role="parent" through
// parentAccessRequests.ts's approval flow instead — a parent's
// relationship is never activated immediately). Validates the athlete
// belongs to the campaign before writing — never links across campaigns,
// never links to a nonexistent athlete.
export async function linkMemberToAthlete(
  memberId: string,
  athleteId: string,
  campaignSlug: string,
): Promise<LinkMemberResult> {
  const athlete = await validateAthleteForCampaign(athleteId, campaignSlug);
  if (!athlete) return { ok: false, reason: "not_found" };
  await restUpdate(`team_members?id=eq.${encodeURIComponent(memberId)}`, { athlete_id: athleteId });
  return { ok: true };
}

export type UnlinkedAthleteMember = {
  id:            string;
  campaign_slug: string;
  name:          string;
  role:          string;
  created_at:    string;
};

export type TeamMemberRow = {
  id:            string;
  campaign_slug: string;
  account_id:    string | null;
  role:          string;
  athlete_id:    string | null;
  name:          string;
  salt:          string;
  created_at:    string;
};

export type CreateLinkedAthleteMemberInput = {
  campaignSlug: string;
  athleteId:    string;
  accountId:    string;
  name:         string;
};

export type CreateLinkedAthleteMemberResult =
  | { ok: true;  member: TeamMemberRow }
  | { ok: false; reason: "athlete_not_found" };

// Exported for reuse by the roster-import pipeline (src/lib/platform/import/),
// which must apply the exact same exact-match normalization this module uses
// for createAthlete()'s collision check — never a reimplementation.
export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

// Plain Levenshtein distance — small rosters (tens of rows per campaign),
// no need for a dependency here.
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// Exported for reuse by the roster-import pipeline's fuzzy duplicate pass —
// same similarity function findPossibleDuplicates() below uses, so an
// imported-roster review surfaces identical "possible duplicate" judgments
// as the rest of the admin tools.
export function nameSimilarity(a: string, b: string): number {
  if (!a.length && !b.length) return 1;
  const dist = levenshtein(a, b);
  return 1 - dist / Math.max(a.length, b.length);
}

// Canonical single-athlete creation. Enforces the Phase 1A contract
// (campaignSlug/name/classYear required, everything else optional) and an
// exact-normalized-same-campaign-name collision guard. Never touches jersey
// numbers as an identity signal, never auto-links, never consults fuzzy
// matches — those are advisory-only via findPossibleDuplicates.
export async function createAthlete(
  input: CreateAthleteInput,
  options?: CreateAthleteOptions,
): Promise<CreateAthleteResult> {
  const campaignSlug = input.campaignSlug?.trim();
  const name         = input.name?.trim();
  const classYear    = input.classYear?.trim();

  if (!campaignSlug) return { ok: false, reason: "validation", message: "campaignSlug is required." };
  if (!name)         return { ok: false, reason: "validation", message: "name is required." };
  if (!classYear)    return { ok: false, reason: "validation", message: "classYear is required." };

  if (!options?.overrideCollision) {
    const normalized = normalizeName(name);
    const existing = await restList<AthleteRow>(
      `athletes?campaign_slug=eq.${encodeURIComponent(campaignSlug)}&select=*`,
    );
    const collision = existing.find(a => normalizeName(a.name) === normalized);
    if (collision) {
      return { ok: false, reason: "collision", collision: { type: "exact_duplicate", existing: collision } };
    }
  }

  const body: Record<string, unknown> = {
    campaign_slug: campaignSlug,
    name,
    class_year:    classYear,
    event:         input.event?.trim() || null,
    contact_phone: input.contactPhone?.trim() || null,
    contact_email: input.contactEmail?.trim() || null,
  };
  if (input.jerseyNumber != null)   body.jersey_number = input.jerseyNumber;
  if (input.gradYear != null)       body.grad_year     = input.gradYear;
  if (input.profilePhoto?.trim())   body.profile_photo = input.profilePhoto.trim();
  if (input.goalCents != null)      body.goal_cents    = input.goalCents;

  const rows = await restInsert<AthleteRow>("athletes", body);
  return { ok: true, athlete: rows[0] };
}

// Advisory-only fuzzy match. Never blocks creation, never used to make an
// identity or authorization decision — callers may surface these as
// suggestions, nothing more. Excludes exact matches (those are the
// collision path in createAthlete, not a "possible" match).
export async function findPossibleDuplicates(
  campaignSlug: string,
  name: string,
): Promise<PossibleDuplicate[]> {
  const normalized = normalizeName(name);
  if (!normalized) return [];

  const existing = await restList<AthleteRow>(
    `athletes?campaign_slug=eq.${encodeURIComponent(campaignSlug)}&select=*`,
  );

  return existing
    .map(athlete => ({ athlete, similarity: nameSimilarity(normalized, normalizeName(athlete.name)) }))
    .filter(match => match.similarity >= 0.6 && match.similarity < 1)
    .sort((a, b) => b.similarity - a.similarity);
}

// Confirms an athlete exists AND belongs to the given campaign. Reusable
// same-campaign athlete validator — mirrors the check already used by
// team/[slug]/members/me/route.ts, generalized for reuse elsewhere
// (join endpoints).
export async function validateAthleteForCampaign(
  athleteId: string,
  campaignSlug: string,
): Promise<AthleteRow | null> {
  const rows = await restList<AthleteRow>(
    `athletes?id=eq.${encodeURIComponent(athleteId)}&campaign_slug=eq.${encodeURIComponent(campaignSlug)}&select=*&limit=1`,
  );
  return rows[0] ?? null;
}

// Atomic "create the team_members row and link it to a canonical athlete"
// helper — for flows where no member row exists yet at all (Phase 1B:
// existing-roster-athlete self-join, and Head Coach approval of a
// not-listed request). Distinct from linkMemberToAthlete(), which patches
// an athlete_id onto an ALREADY-existing member row (Phase 1A: parent
// self-link via members/me).
//
// Validates the athlete belongs to the campaign first — never creates a
// membership with a nonexistent or cross-campaign athlete_id, and by
// construction never returns a member with athlete_id = null. If a
// team_members row already exists for this account+campaign (e.g. a race,
// or an account that already joined some other way), links the athlete
// onto that existing row instead of creating a second membership.
//
// G3A: this is the single, canonical "roster athlete became a joined
// identity" lifecycle event — every current join path (/enter-code
// athlete self-join, Head Coach approval of a not-listed request) goes
// through here and only here. After a successful link, best-effort
// activates any roster-group assignments (message_thread_athletes) this
// athlete already has, via a DYNAMIC import of messages.ts — never a
// static one. athletes.ts is a platform-layer primitive (src/lib/platform/)
// and messages.ts is a large, feature-layer module (attachments,
// moderation, DM/group logic); a static import would pull that whole
// feature module into the platform layer for one lifecycle hook, which is
// poor layering even though no circular dependency actually exists today
// (messages.ts does not import athletes.ts, directly or transitively). The
// dynamic import mirrors the EXACT existing convention already used by
// parentAccessRequests.ts's approveRequest() for the same reason — a sync
// hiccup must never fail the join that already succeeded.
export async function createLinkedAthleteMember(
  input: CreateLinkedAthleteMemberInput,
): Promise<CreateLinkedAthleteMemberResult> {
  const athlete = await validateAthleteForCampaign(input.athleteId, input.campaignSlug);
  if (!athlete) return { ok: false, reason: "athlete_not_found" };

  const existing = await restList<TeamMemberRow>(
    `team_members?account_id=eq.${encodeURIComponent(input.accountId)}&campaign_slug=eq.${encodeURIComponent(input.campaignSlug)}&select=*&limit=1`,
  );

  let member: TeamMemberRow;
  if (existing[0]) {
    const rows = await restUpdate<TeamMemberRow>(
      `team_members?id=eq.${encodeURIComponent(existing[0].id)}`,
      { athlete_id: input.athleteId },
    );
    member = rows[0];
  } else {
    const rows = await restInsert<TeamMemberRow>("team_members", {
      campaign_slug: input.campaignSlug,
      account_id:    input.accountId,
      role:          "athlete",
      name:          input.name,
      athlete_id:    input.athleteId,
      salt:          generateMemberSalt(),
    });
    member = rows[0];
  }

  try {
    const { activateRosterAssignmentsForJoinedAthlete } = await import("../messages.ts");
    await activateRosterAssignmentsForJoinedAthlete(input.athleteId, input.campaignSlug, member.id);
  } catch (err) {
    console.error("[athletes] activateRosterAssignmentsForJoinedAthlete failed:", err);
  }

  return { ok: true, member };
}

// Diagnostic read only — does not remediate. Identifies athlete-role team
// members with no athlete_id link, optionally scoped to one campaign.
export async function getUnlinkedAthleteMembers(campaignSlug?: string): Promise<UnlinkedAthleteMember[]> {
  const scope = campaignSlug ? `campaign_slug=eq.${encodeURIComponent(campaignSlug)}&` : "";
  return restList<UnlinkedAthleteMember>(
    `team_members?${scope}role=eq.athlete&athlete_id=is.null&select=id,campaign_slug,name,role,created_at`,
  );
}

export type DeleteAthleteResult =
  | { ok: true }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "messaging_cleanup_failed" }
  | { ok: false; reason: "delete_failed" };

// G3A review correction — the single canonical "delete a roster athlete"
// lifecycle helper. Both DELETE /api/admin/athletes/[id] and DELETE
// /api/team/[slug]/roster/[id] now go through this instead of deleting the
// athletes row directly, closing a gap the architecture audit found: a
// roster-only `athletes` row has always been hard-deleted with no
// team_members/messaging cleanup at all, and a NEW message_thread_athletes
// row (G3A) cascades away the instant the athletes row is gone — but
// nothing ever cleaned up the athlete's ALREADY-ACTIVE
// message_thread_participants row (if they'd joined) or any auto-included
// family participant, which could otherwise let a deleted-from-the-roster
// athlete (and their family) keep reading/sending in a group they are no
// longer assigned to.
//
// Ordering is load-bearing: messaging cleanup (removeRosterAthleteFromAllGroups,
// messages.ts) MUST run BEFORE the athletes row is deleted — its own
// comment explains why the cascade would otherwise erase the very rows
// needed to discover which threads to reconcile. If cleanup fails, this
// function does NOT proceed to delete the athlete — a conservative choice:
// an undeleted-but-still-fully-functional roster row is always safer than
// a deleted row that may have left stale, unreconciled group access behind.
// There is no transactional guarantee across the two REST calls (no stored
// procedure/RPC exists in this schema for it, and introducing one is out of
// scope here) — this ordering + abort-on-cleanup-failure is the strongest
// consistency available without one.
//
// `campaignSlug` is optional because the admin tool route (unlike the team
// roster route) does not carry a slug in its URL at all — when omitted,
// the athlete's own campaign_slug is read from its row and used for cleanup
// instead of trusting a caller-supplied one.
//
// Dynamically imports messages.ts for the exact same reason
// createLinkedAthleteMember() above does — see that function's comment.
export async function deleteAthleteWithMessagingCleanup(
  athleteId: string,
  campaignSlug?: string,
): Promise<DeleteAthleteResult> {
  const scoped = campaignSlug ? `&campaign_slug=eq.${encodeURIComponent(campaignSlug)}` : "";
  const rows = await restList<Pick<AthleteRow, "id" | "campaign_slug">>(
    `athletes?id=eq.${encodeURIComponent(athleteId)}${scoped}&select=id,campaign_slug&limit=1`,
  );
  const athlete = rows[0];
  if (!athlete) return { ok: false, reason: "not_found" };

  try {
    const { removeRosterAthleteFromAllGroups } = await import("../messages.ts");
    await removeRosterAthleteFromAllGroups(athlete.id, athlete.campaign_slug);
  } catch (err) {
    console.error("[athletes] deleteAthleteWithMessagingCleanup: messaging cleanup failed, athlete NOT deleted:", err);
    return { ok: false, reason: "messaging_cleanup_failed" };
  }

  try {
    await restDelete(`athletes?id=eq.${encodeURIComponent(athleteId)}`);
  } catch (err) {
    console.error("[athletes] deleteAthleteWithMessagingCleanup: delete failed after cleanup already ran:", err);
    return { ok: false, reason: "delete_failed" };
  }

  return { ok: true };
}
