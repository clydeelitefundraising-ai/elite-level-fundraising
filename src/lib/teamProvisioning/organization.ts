import { randomBytes } from "crypto";
import { restList, restInsert, RestError } from "@/lib/platform/_client";

type OrgRow = { id: string };

/** Pure — mirrors the manual slugs already hand-written for every existing
 *  school in supabase/migrations/phase_a29b_backfill_organizations.sql
 *  (e.g. "Chino Valley High School" -> "chino-valley-high-school"), so a
 *  self-service-created organization's slug looks exactly like the ones
 *  that migration produced by hand. Deliberately simpler than
 *  generateCampaignSlug (slug.ts) — no filler-word stripping, no
 *  sport/year parts — this is a school name alone. */
export function slugifyOrganizationName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Resolves the organization (school) for a self-service team.
 *
 *  Phase O2 scope, deliberately simple and deterministic:
 *  - Exact (trimmed, case-sensitive) `school_name` match against an
 *    existing `organizations` row reuses its id — the same exact-match
 *    convention phase_a29b_backfill_organizations.sql already established
 *    for every pre-existing campaign. No fuzzy/normalized matching.
 *  - No match -> creates the minimum organization row (`slug`,
 *    `school_name` only; every other column already has a DB default).
 *    A `slug` collision (two different school names slugifying to the
 *    same string) is retried once with a short random suffix — collisions
 *    on `school_name` ITSELF are not retried; that's the "already exists"
 *    case handled by the lookup above.
 *
 *  Known, accepted Phase 1 race: two concurrent requests for the same
 *  brand-new school name (never seen before by either) can each pass the
 *  "no existing match" check and create two organizations rows for the
 *  same `school_name` — there is no unique constraint on `school_name`
 *  itself (only on `slug`), and adding one is a schema change out of O2's
 *  approved scope. Flagged, not fixed, here. */
export async function resolveOrCreateOrganizationId(schoolName: string): Promise<string> {
  const existing = await restList<OrgRow>(
    `organizations?school_name=eq.${encodeURIComponent(schoolName)}&select=id&limit=1`,
  );
  if (existing[0]) return existing[0].id;

  const base = slugifyOrganizationName(schoolName) || "school";

  for (let attempt = 0; attempt < 3; attempt++) {
    const candidateSlug = attempt === 0 ? base : `${base}-${randomBytes(3).toString("hex")}`;
    try {
      const rows = await restInsert<OrgRow>("organizations", { slug: candidateSlug, school_name: schoolName });
      return rows[0].id;
    } catch (err) {
      // 23505 here means a SLUG collision (a different school whose name
      // slugifies the same) — retry with a random suffix. Any other error
      // propagates; the caller treats organization resolution failure as a
      // hard stop (no campaign/coach/join-code is created without one).
      if (err instanceof RestError && err.code === "23505" && attempt < 2) continue;
      throw err;
    }
  }
  throw new Error("Could not allocate a unique organization slug.");
}
