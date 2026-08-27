// Platform Admin Schools directory / School detail read layer.
//
// Reuses the existing organizations + campaign_settings.organization_id
// model (Phase A29/A29b) — no new tables, no public API surface. Every
// function here is server-only (service-role key via _client.ts) and is
// meant to be called from /platform-admin/* pages after the platform_admin
// session guard has already run in their layout.
//
// Aggregate-first by design: athlete counts use restCount() (PostgREST
// Content-Range, never fetches the underlying rows) and head-coach lookups
// are batched IN queries — this never queries the full donor/member list
// just to build a count, and never exposes donor/member PII (no donor
// name/email/phone is read anywhere in this file).

import { restList, restCount } from "./_client";
import { isActiveTeam, groupTeamsByOrganization, pickDirectoryHeadCoach, deriveSchoolStatus } from "./schoolsLogic";
export { groupTeamsByOrganization, pickDirectoryHeadCoach, deriveSchoolStatus } from "./schoolsLogic";

export type SchoolDirectoryRow = {
  id:                 string;
  slug:               string;
  school_name:        string;
  city:               string | null;
  state:              string | null;
  active_team_count:  number;
  total_team_count:   number;
  // Only ever populated when the school has exactly one team — with
  // multiple teams there is no single "the" head coach, and this
  // deliberately does not guess one rather than fabricate a value.
  head_coach_name:    string | null;
  status:             "active" | "no_active_teams";
};

export type SchoolTeam = {
  campaign_slug:   string;
  sport_name:       string;
  season:           string;
  status:           string | null;
  archived:         boolean;
  head_coach_name:  string | null;
  athlete_count:    number;
  raised_cents:     number;
};

export type SchoolDetail = {
  id:          string;
  slug:        string;
  school_name: string;
  city:        string | null;
  state:       string | null;
  address:     string | null;
  website:     string | null;
  teams:       SchoolTeam[];
};

type OrgRow = {
  id: string; slug: string; school_name: string;
  city: string | null; state: string | null;
  address?: string | null; website?: string | null;
};
type CampaignRow = {
  campaign_slug: string; organization_id: string | null;
  sport_name: string; season: string; status: string | null; archived: boolean | null;
};
type HeadCoachRow = { campaign_slug: string; name: string };

/** Schools directory — one row per organization (excluding the unused
 *  Phase A8 'default' seed row, which represents no real school).
 *  `search` filters by school_name, case-insensitive substring — applied
 *  server-side via PostgREST ilike, not fetched-then-filtered. */
export async function getSchoolsDirectory(search?: string): Promise<SchoolDirectoryRow[]> {
  const q = search?.trim();
  const searchFilter = q ? `&school_name=ilike.*${encodeURIComponent(q)}*` : "";

  const orgs = await restList<OrgRow>(
    `organizations?slug=neq.default&select=id,slug,school_name,city,state${searchFilter}&order=school_name.asc`,
  );
  if (!orgs.length) return [];

  const orgIds = orgs.map(o => o.id);
  const teams = await restList<CampaignRow>(
    `campaign_settings?organization_id=in.(${orgIds.join(",")})&select=campaign_slug,organization_id,sport_name,season,status,archived`,
  );

  const teamsByOrg = groupTeamsByOrganization(teams);

  const singleTeamSlugs = orgs
    .map(o => teamsByOrg.get(o.id) ?? [])
    .filter(list => list.length === 1)
    .map(list => list[0].campaign_slug);

  const headCoaches = singleTeamSlugs.length
    ? await restList<HeadCoachRow>(
        `team_coaches?campaign_slug=in.(${singleTeamSlugs.join(",")})&role=eq.head_coach&select=campaign_slug,name`,
      )
    : [];
  const headCoachBySlug = new Map(headCoaches.map(c => [c.campaign_slug, c.name]));

  return orgs.map(o => {
    const orgTeams = teamsByOrg.get(o.id) ?? [];
    const activeCount = orgTeams.filter(isActiveTeam).length;
    return {
      id:                o.id,
      slug:              o.slug,
      school_name:       o.school_name,
      city:              o.city || null,
      state:             o.state || null,
      active_team_count: activeCount,
      total_team_count:  orgTeams.length,
      head_coach_name:   pickDirectoryHeadCoach(orgTeams, headCoachBySlug),
      status:            deriveSchoolStatus(activeCount),
    };
  });
}

/** School detail — every campaign linked via campaign_settings.organization_id,
 *  enriched with head coach (per-team, unambiguous by definition), athlete
 *  count (restCount — never fetches athlete rows/names), and raised total
 *  (reuses the same donations aggregation already used by every existing
 *  Team Hub page — bounded to this one school's teams, not the platform). */
export async function getSchoolDetail(schoolId: string): Promise<SchoolDetail | null> {
  const orgs = await restList<OrgRow>(
    `organizations?id=eq.${encodeURIComponent(schoolId)}&select=id,slug,school_name,city,state,address,website&limit=1`,
  );
  const org = orgs[0];
  if (!org) return null;

  const teams = await restList<CampaignRow>(
    `campaign_settings?organization_id=eq.${encodeURIComponent(schoolId)}` +
    `&select=campaign_slug,organization_id,sport_name,season,status,archived` +
    `&order=archived.asc,sport_name.asc`,
  );

  if (!teams.length) {
    return {
      id: org.id, slug: org.slug, school_name: org.school_name,
      city: org.city || null, state: org.state || null,
      address: org.address || null, website: org.website || null,
      teams: [],
    };
  }

  const slugs = teams.map(t => t.campaign_slug);
  const inClause = slugs.join(",");

  const [headCoaches, athleteCounts, donationTotals] = await Promise.all([
    restList<HeadCoachRow>(`team_coaches?campaign_slug=in.(${inClause})&role=eq.head_coach&select=campaign_slug,name`),
    Promise.all(slugs.map(async slug => ({
      slug,
      count: await restCount(`athletes?campaign_slug=eq.${encodeURIComponent(slug)}&select=id&limit=1`),
    }))),
    // amount_cents (not donor identity) — same aggregation teamData.ts's
    // getDonationStats already performs per-team across the app; bounded
    // here to one school's teams, not queried platform-wide.
    Promise.all(slugs.map(async slug => {
      const rows = await restList<{ amount_cents: number }>(
        `donations?campaign_slug=eq.${encodeURIComponent(slug)}&select=amount_cents`,
      );
      return { slug, cents: rows.reduce((sum, r) => sum + (r.amount_cents || 0), 0) };
    })),
  ]);

  const headCoachBySlug   = new Map(headCoaches.map(c => [c.campaign_slug, c.name]));
  const athleteCountBySlug = new Map(athleteCounts.map(a => [a.slug, a.count]));
  const raisedBySlug       = new Map(donationTotals.map(d => [d.slug, d.cents]));

  return {
    id: org.id, slug: org.slug, school_name: org.school_name,
    city: org.city || null, state: org.state || null,
    address: org.address || null, website: org.website || null,
    teams: teams.map(t => ({
      campaign_slug:   t.campaign_slug,
      sport_name:      t.sport_name,
      season:          t.season,
      status:          t.status,
      archived:        t.archived === true,
      head_coach_name: headCoachBySlug.get(t.campaign_slug) ?? null,
      athlete_count:   athleteCountBySlug.get(t.campaign_slug) ?? 0,
      raised_cents:    raisedBySlug.get(t.campaign_slug) ?? 0,
    })),
  };
}
