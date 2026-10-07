// Phase O2 — campaign_slug generation/validation, promoted out of
// src/app/admin/campaigns/new/NewCampaignWizard.tsx (the only place this
// logic lived before now) so the legacy admin creation flow and the new
// self-service provisioning flow (src/lib/teamProvisioning/selfServiceCreate.ts)
// never maintain two independent slug algorithms. Byte-identical to the
// wizard's own previous local copy — this is a pure extraction, not a
// behavior change; the wizard now imports generateCampaignSlug from here
// instead of defining it locally.

/** Same format every existing slug-accepting route already enforces
 *  (src/app/api/admin/onboard/route.ts, the wizard's own client-side
 *  check) — lowercase letters, digits, hyphens, must start with an
 *  alphanumeric. */
export const CAMPAIGN_SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
export const MIN_CAMPAIGN_SLUG_LENGTH = 3;

export function isValidCampaignSlugFormat(slug: string): boolean {
  return slug.length >= MIN_CAMPAIGN_SLUG_LENGTH && CAMPAIGN_SLUG_RE.test(slug);
}

/** Deterministic slug from school/sport/year — strips generic filler
 *  words ("high school," "varsity," gendered team-name words, etc.),
 *  slugifies each part independently, then joins with hyphens and caps
 *  the result at 60 chars. Never random, never includes any uniqueness
 *  suffix — callers are responsible for checking/handling collisions
 *  (see selfServiceCreate.ts and the admin onboard route, which both
 *  treat a collision as a clean conflict, never a silent overwrite). */
export function generateCampaignSlug(school: string, sport: string, year: string): string {
  const clean = (s: string) =>
    s.toLowerCase()
      .replace(/\b(high school|high|school|academy|middle|junior|prep|varsity|boys|girls|mens|womens)\b/g, " ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-+/g, "-");

  const parts = [clean(school), clean(sport), year.trim()].filter(s => s.length > 0);
  return parts.join("-").slice(0, 60).replace(/-+$/, "");
}
