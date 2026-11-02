// School-Account Linking, Phase B — pure rules for linking team-seasons to
// schools (campaign_settings.organization_id → organizations). Shared by
// the Platform Admin API and its tests; no I/O here.
//
//   Team grouping   A team's seasons are one chain of campaign_settings rows
//                   linked by successor_campaign_slug (Complete Season). Only
//                   seasons in the chain of the team being edited may be
//                   changed in one request.
//   Read-only       A completed season (season_completed_at or a successor)
//                   is read-only in the database (phase_s2 guard), so its
//                   school can't change here — it is shown, never selectable.
//   Preview         Every change is previewed first: per season, the school
//                   before and after, and Community Partner visibility in
//                   the Team App and on the public campaign page.
//   Stale           The confirm carries the school each season had in the
//                   preview; if any differs now, the whole change is refused.
//   No inventing    Linking never creates a school; unlinking sets null.

export type SeasonRow = {
  campaign_slug: string;
  school_name: string | null;
  sport_name: string | null;
  season: string | null;
  organization_id: string | null;
  season_completed_at: string | null;
  successor_campaign_slug: string | null;
};

export type OrgRow = {
  id: string;
  slug: string;
  school_name: string;
  city: string | null;
  state: string | null;
  show_community_partners: boolean | null;
  show_community_partners_public: boolean | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,99}$/;

export function isOrganizationId(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}
export function isCampaignSlug(v: unknown): v is string {
  return typeof v === "string" && SLUG_RE.test(v);
}

export function isCompletedSeason(s: Pick<SeasonRow, "season_completed_at" | "successor_campaign_slug">): boolean {
  return Boolean(s.season_completed_at) || Boolean(s.successor_campaign_slug);
}

/** The chain's seasons oldest → newest, given every row in it. */
export function orderChain(rows: readonly SeasonRow[]): SeasonRow[] {
  const bySlug = new Map(rows.map(r => [r.campaign_slug, r]));
  const hasPredecessor = new Set(rows.map(r => r.successor_campaign_slug).filter((s): s is string => Boolean(s) && bySlug.has(s!)));
  const heads = rows.filter(r => !hasPredecessor.has(r.campaign_slug));
  const out: SeasonRow[] = [];
  const seen = new Set<string>();
  for (const head of heads.sort((a, b) => a.campaign_slug.localeCompare(b.campaign_slug))) {
    let cur: SeasonRow | undefined = head;
    while (cur && !seen.has(cur.campaign_slug)) {
      seen.add(cur.campaign_slug);
      out.push(cur);
      cur = cur.successor_campaign_slug ? bySlug.get(cur.successor_campaign_slug) : undefined;
    }
  }
  for (const r of rows) if (!seen.has(r.campaign_slug)) out.push(r); // defensive: cycles
  return out;
}

/** The season selected by default: the newest season that isn't completed
 *  (the team's current season), else none. */
export function currentSeasonSlug(chain: readonly SeasonRow[]): string | null {
  const open = chain.filter(s => !isCompletedSeason(s));
  return open.length ? open[open.length - 1].campaign_slug : null;
}

export type Visibility = { teamApp: boolean; publicPage: boolean };

/** Community Partner visibility a season gets from its school. An unlinked
 *  season shows none (home/page.tsx, sponsors/page.tsx, campaign-stats). */
export function partnerVisibility(org: Pick<OrgRow, "show_community_partners" | "show_community_partners_public"> | null): Visibility {
  return {
    teamApp: org?.show_community_partners === true,
    publicPage: org?.show_community_partners_public === true,
  };
}

export type SeasonChange = {
  campaign_slug: string;
  label: string;
  before: { organization_id: string | null; school: string | null; visibility: Visibility };
  after: { organization_id: string | null; school: string | null; visibility: Visibility };
  changesSchool: boolean;
  changesPartners: boolean;
};

export function seasonLabel(s: Pick<SeasonRow, "school_name" | "sport_name" | "season" | "campaign_slug">): string {
  const parts = [s.sport_name?.trim(), s.season?.trim()].filter(Boolean).join(" · ");
  return parts ? `${parts} (${s.campaign_slug})` : s.campaign_slug;
}

export function schoolLabel(o: Pick<OrgRow, "school_name" | "city" | "state" | "slug"> | null): string | null {
  if (!o) return null;
  const name = o.school_name.trim() || `Unnamed record (${o.slug})`;
  const place = [o.city?.trim(), o.state?.trim()].filter(Boolean).join(", ");
  return place ? `${name} — ${place}` : name;
}

export type PlanError =
  | "no_seasons"
  | "duplicate_season"
  | "season_not_in_team"
  | "season_read_only"
  | "stale"
  | "nothing_to_change";

export const PLAN_ERROR_TEXT: Record<PlanError, string> = {
  no_seasons: "Choose at least one season.",
  duplicate_season: "A season was selected more than once.",
  season_not_in_team: "A selected season doesn't belong to this team.",
  season_read_only: "Completed seasons are read-only and can't change school.",
  stale: "The school for one or more seasons changed after the preview. Review the new preview before confirming.",
  nothing_to_change: "The selected seasons already have this school.",
};

export type PlanResult =
  | { ok: true; changes: SeasonChange[] }
  | { ok: false; error: PlanError; seasons?: string[] };

/** Validates a link/change/unlink for selected seasons of one team and
 *  describes every change. `expected` (from a previous preview) makes it a
 *  confirm: each season's current school must still match exactly. */
export function planSchoolLink(input: {
  chain: readonly SeasonRow[];
  selected: readonly string[];
  target: OrgRow | null;
  orgsById: ReadonlyMap<string, OrgRow>;
  expected?: ReadonlyMap<string, string | null>;
}): PlanResult {
  const { chain, selected, target, orgsById, expected } = input;
  if (selected.length === 0) return { ok: false, error: "no_seasons" };
  if (new Set(selected).size !== selected.length) return { ok: false, error: "duplicate_season" };
  const bySlug = new Map(chain.map(s => [s.campaign_slug, s]));
  const outside = selected.filter(s => !bySlug.has(s));
  if (outside.length) return { ok: false, error: "season_not_in_team", seasons: outside };
  const readOnly = selected.filter(s => isCompletedSeason(bySlug.get(s)!));
  if (readOnly.length) return { ok: false, error: "season_read_only", seasons: readOnly };
  if (expected) {
    const stale = selected.filter(s => !expected.has(s) || (expected.get(s) ?? null) !== (bySlug.get(s)!.organization_id ?? null));
    if (stale.length) return { ok: false, error: "stale", seasons: stale };
  }
  const targetId = target?.id ?? null;
  const changes: SeasonChange[] = chain.filter(s => selected.includes(s.campaign_slug)).map(s => {
    const beforeOrg = s.organization_id ? orgsById.get(s.organization_id) ?? null : null;
    const before = { organization_id: s.organization_id ?? null, school: s.organization_id ? schoolLabel(beforeOrg) ?? "Unknown school record" : null, visibility: partnerVisibility(beforeOrg) };
    const after = { organization_id: targetId, school: schoolLabel(target), visibility: partnerVisibility(target) };
    return {
      campaign_slug: s.campaign_slug,
      label: seasonLabel(s),
      before,
      after,
      changesSchool: before.organization_id !== after.organization_id,
      changesPartners: before.visibility.teamApp !== after.visibility.teamApp || before.visibility.publicPage !== after.visibility.publicPage,
    };
  });
  if (!changes.some(c => c.changesSchool)) return { ok: false, error: "nothing_to_change" };
  return { ok: true, changes };
}

/** One PostgREST `or` filter that matches each selected season only while
 *  it still has the school the confirm expects — a single UPDATE statement,
 *  so a row that changed meanwhile simply isn't matched. */
export function conditionalSeasonFilter(expected: ReadonlyArray<{ campaign_slug: string; organization_id: string | null }>): string {
  const parts = expected.map(e =>
    `and(campaign_slug.eq.${e.campaign_slug},organization_id.${e.organization_id ? `eq.${e.organization_id}` : "is.null"})`);
  return `or=(${parts.join(",")})`;
}

// ── Search ────────────────────────────────────────────────────────────────

/** A search term safe inside a PostgREST or=(…ilike.*q*…) filter: letters,
 *  digits, spaces and a few name characters only; max 60. */
export function sanitizeSchoolQuery(q: unknown): string {
  if (typeof q !== "string") return "";
  return q.replace(/[^A-Za-z0-9 .'&-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

// ── Dry-run backfill report (read-only; never applied) ────────────────────

export function normalizeSchoolName(name: string | null | undefined): string {
  return (name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export type DryRunReport = {
  exactMatches: { campaign_slug: string; school_name: string; organization: string; organization_id: string; completed: boolean }[];
  ambiguous: { school_name: string; campaign_slugs: string[]; organizations: string[] }[];
  unmatched: { school_name: string; campaign_slugs: string[] }[];
  possibleDuplicates: { normalized: string; organizations: string[] }[];
  totals: { seasons: number; linked: number; unlinked: number; organizations: number };
};

/** Exact (trimmed, case-sensitive) school_name matches only — the same rule
 *  as the 2026-08-24 backfill. Names that match more than one school and
 *  names that match none are listed for review. Possible duplicate schools
 *  share a normalized name; they are reported, never merged. */
export function buildDryRunReport(seasons: readonly SeasonRow[], orgs: readonly OrgRow[]): DryRunReport {
  const byName = new Map<string, OrgRow[]>();
  for (const o of orgs) {
    const k = o.school_name.trim();
    if (!k) continue;
    byName.set(k, [...(byName.get(k) ?? []), o]);
  }
  const unlinked = seasons.filter(s => !s.organization_id);
  const exactMatches: DryRunReport["exactMatches"] = [];
  const ambiguousMap = new Map<string, Set<string>>();
  const unmatchedMap = new Map<string, string[]>();
  for (const s of unlinked) {
    const name = (s.school_name ?? "").trim();
    const hits = name ? byName.get(name) ?? [] : [];
    if (hits.length === 1) {
      exactMatches.push({ campaign_slug: s.campaign_slug, school_name: name, organization: schoolLabel(hits[0])!, organization_id: hits[0].id, completed: isCompletedSeason(s) });
    } else if (hits.length > 1) {
      ambiguousMap.set(name, new Set([...(ambiguousMap.get(name) ?? []), s.campaign_slug]));
    } else {
      const key = name || "(no school name)";
      unmatchedMap.set(key, [...(unmatchedMap.get(key) ?? []), s.campaign_slug]);
    }
  }
  const dupMap = new Map<string, OrgRow[]>();
  for (const o of orgs) {
    const k = normalizeSchoolName(o.school_name);
    if (!k) continue;
    dupMap.set(k, [...(dupMap.get(k) ?? []), o]);
  }
  const sortBy = <T,>(xs: T[], key: (x: T) => string) => xs.sort((a, b) => key(a).localeCompare(key(b)));
  return {
    exactMatches: sortBy(exactMatches, x => x.campaign_slug),
    ambiguous: sortBy([...ambiguousMap].map(([school_name, slugs]) => ({
      school_name, campaign_slugs: [...slugs].sort(), organizations: (byName.get(school_name) ?? []).map(o => schoolLabel(o)!),
    })), x => x.school_name),
    unmatched: sortBy([...unmatchedMap].map(([school_name, campaign_slugs]) => ({ school_name, campaign_slugs: campaign_slugs.sort() })), x => x.school_name),
    possibleDuplicates: sortBy([...dupMap].filter(([, os]) => os.length > 1).map(([normalized, os]) => ({ normalized, organizations: os.map(o => `${schoolLabel(o)} [${o.slug}]`) })), x => x.normalized),
    totals: { seasons: seasons.length, linked: seasons.length - unlinked.length, unlinked: unlinked.length, organizations: orgs.length },
  };
}
