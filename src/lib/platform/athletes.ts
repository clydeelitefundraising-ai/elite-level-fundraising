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

import { restList, restInsert, restUpdate } from "./_client";

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

export type UnlinkedAthleteMember = {
  id:            string;
  campaign_slug: string;
  name:          string;
  role:          string;
  created_at:    string;
};

function normalizeName(name: string): string {
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

function nameSimilarity(a: string, b: string): number {
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

// Safe member-to-athlete linking helper for Phase 1B. Validates the athlete
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

// Diagnostic read only — does not remediate. Identifies athlete-role team
// members with no athlete_id link, optionally scoped to one campaign.
export async function getUnlinkedAthleteMembers(campaignSlug?: string): Promise<UnlinkedAthleteMember[]> {
  const scope = campaignSlug ? `campaign_slug=eq.${encodeURIComponent(campaignSlug)}&` : "";
  return restList<UnlinkedAthleteMember>(
    `team_members?${scope}role=eq.athlete&athlete_id=is.null&select=id,campaign_slug,name,role,created_at`,
  );
}
