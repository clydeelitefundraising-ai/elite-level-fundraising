// School-Account Linking, Phase B — server-side reads and the one write
// (campaign_settings.organization_id) behind Platform Admin school linking.
// Server-only: service-role key via _client.ts. Callers (the
// /api/platform-admin/school-links routes and /platform-admin pages) verify
// getPlatformAdminSession() first. Rules are in schoolLinksLogic.ts.
//
// Reads here are STRICT (throw on any failure) — unlike restList(), an
// empty answer must never be mistaken for "no seasons" or "no school".
import { createHmac, timingSafeEqual } from "crypto";
import { restHeaders, restUrl } from "./_client";
import {
  conditionalSeasonFilter,
  isCampaignSlug,
  orderChain,
  sanitizeSchoolQuery,
  type OrgRow,
  type SeasonRow,
} from "./schoolLinksLogic";

export class SchoolLinkReadError extends Error {}
class SchoolLinkWriteError extends Error {
  readonly readOnly: boolean;
  constructor(readOnly: boolean) {
    super(readOnly ? "season_completed_read_only" : "update_failed");
    this.readOnly = readOnly;
  }
}

const SEASON_SELECT = "campaign_slug,school_name,sport_name,season,organization_id,season_completed_at,successor_campaign_slug";
const ORG_SELECT = "id,slug,school_name,city,state,show_community_partners,show_community_partners_public";
/** A chain longer than this is treated as corrupt rather than walked forever. */
const MAX_CHAIN = 40;

async function strictList<T>(path: string): Promise<T[]> {
  const res = await fetch(restUrl(path), { headers: restHeaders(), cache: "no-store" });
  if (!res.ok) throw new SchoolLinkReadError(`HTTP ${res.status}`);
  const json = await res.json();
  if (!Array.isArray(json)) throw new SchoolLinkReadError("unexpected response");
  return json as T[];
}

/** Every season of the team that `slug` belongs to (oldest → newest), or
 *  null when `slug` isn't a team-season. Walks successor_campaign_slug in
 *  both directions. */
export async function loadTeamSeasons(slug: string): Promise<SeasonRow[] | null> {
  if (!isCampaignSlug(slug)) return null;
  const one = async (s: string) => (await strictList<SeasonRow>(`campaign_settings?campaign_slug=eq.${encodeURIComponent(s)}&select=${SEASON_SELECT}&limit=1`))[0] ?? null;
  const start = await one(slug);
  if (!start) return null;
  const rows = new Map<string, SeasonRow>([[start.campaign_slug, start]]);
  // forward
  let cur: SeasonRow | null = start;
  while (cur?.successor_campaign_slug && !rows.has(cur.successor_campaign_slug)) {
    if (rows.size >= MAX_CHAIN) throw new SchoolLinkReadError("season chain too long");
    cur = await one(cur.successor_campaign_slug);
    if (cur) rows.set(cur.campaign_slug, cur);
  }
  // backward
  let frontier = [start.campaign_slug];
  while (frontier.length) {
    const prev = await strictList<SeasonRow>(
      `campaign_settings?successor_campaign_slug=in.(${frontier.map(encodeURIComponent).join(",")})&select=${SEASON_SELECT}`);
    frontier = [];
    for (const p of prev) {
      if (rows.has(p.campaign_slug)) continue;
      if (rows.size >= MAX_CHAIN) throw new SchoolLinkReadError("season chain too long");
      rows.set(p.campaign_slug, p);
      frontier.push(p.campaign_slug);
    }
  }
  return orderChain([...rows.values()]);
}

export async function loadOrganizations(ids: readonly string[]): Promise<Map<string, OrgRow>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const rows = await strictList<OrgRow>(`organizations?id=in.(${unique.join(",")})&select=${ORG_SELECT}`);
  return new Map(rows.map(o => [o.id, o]));
}

/** Schools whose name, city or state contains the query (all, A→Z, when
 *  empty). Name, city and state are returned so same-named schools stay
 *  distinct. Never creates anything. */
export async function searchSchools(rawQuery: unknown, limit = 25): Promise<OrgRow[]> {
  const q = sanitizeSchoolQuery(rawQuery);
  const filter = q
    ? `&or=(${["school_name", "city", "state", "slug"].map(c => `${c}.ilike.*${encodeURIComponent(q)}*`).join(",")})`
    : "";
  return strictList<OrgRow>(`organizations?select=${ORG_SELECT}${filter}&order=school_name.asc,slug.asc&limit=${limit}`);
}

export async function listAllSeasons(): Promise<SeasonRow[]> {
  return strictList<SeasonRow>(`campaign_settings?select=${SEASON_SELECT}&order=campaign_slug.asc`);
}

export async function listAllOrganizations(): Promise<OrgRow[]> {
  return strictList<OrgRow>(`organizations?select=${ORG_SELECT}&order=school_name.asc,slug.asc`);
}

export type ApplyResult =
  | { ok: true; updated: string[] }
  | { ok: false; reason: "stale"; reverted: boolean }
  | { ok: false; reason: "read_only" }
  | { ok: false; reason: "error" };

async function patchSeasons(filter: string, body: unknown): Promise<string[]> {
  const res = await fetch(restUrl(`campaign_settings?${filter}&select=campaign_slug`), {
    method: "PATCH",
    headers: restHeaders({ Prefer: "return=representation" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    // Status only is kept — never the body (it can quote row values).
    throw new SchoolLinkWriteError(/season_completed_read_only/.test(text));
  }
  return ((await res.json()) as { campaign_slug: string }[]).map(r => r.campaign_slug);
}

/** Sets organization_id on exactly these seasons, all-or-nothing:
 *  - ONE UPDATE statement, matching each season only while it still has
 *    the school the preview showed (so a concurrent change isn't
 *    overwritten), and touching organization_id only;
 *  - if fewer rows matched than requested (someone changed one in
 *    between), the rows that did change are put back (again only where
 *    they still hold the new value) and the request is refused as stale;
 *  - a completed season makes the database refuse the whole statement. */
export async function applySchoolLink(
  expected: ReadonlyArray<{ campaign_slug: string; organization_id: string | null }>,
  targetId: string | null,
): Promise<ApplyResult> {
  let updated: string[];
  try {
    updated = await patchSeasons(conditionalSeasonFilter(expected), { organization_id: targetId });
  } catch (err) {
    if (err instanceof SchoolLinkWriteError && err.readOnly) return { ok: false, reason: "read_only" };
    return { ok: false, reason: "error" };
  }
  if (updated.length === expected.length && expected.every(e => updated.includes(e.campaign_slug))) {
    return { ok: true, updated };
  }
  // Partial match: undo what changed so nothing is left half-applied.
  let reverted = true;
  const toRevert = expected.filter(e => updated.includes(e.campaign_slug));
  const byPrevious = new Map<string | null, string[]>();
  for (const e of toRevert) byPrevious.set(e.organization_id, [...(byPrevious.get(e.organization_id) ?? []), e.campaign_slug]);
  for (const [previous, slugs] of byPrevious) {
    try {
      const target = targetId ? `organization_id=eq.${targetId}` : "organization_id=is.null";
      const back = await patchSeasons(`campaign_slug=in.(${slugs.join(",")})&${target}`, { organization_id: previous });
      if (back.length !== slugs.length) reverted = false;
    } catch {
      reverted = false;
    }
  }
  return { ok: false, reason: "stale", reverted };
}

// ── Mandatory preview ─────────────────────────────────────────────────────
// The preview returns a signed token binding the admin, team, target school
// and each season's previewed school; the confirm must send it back. A
// confirm that wasn't previewed — or that changed the school, seasons or
// admin since — is refused. Valid for PREVIEW_TTL_MS.

export const PREVIEW_TTL_MS = 15 * 60 * 1000;

type PreviewPayload = {
  adminId: string;
  slug: string;
  organizationId: string | null;
  seasons: ReadonlyArray<{ campaign_slug: string; expectedOrganizationId: string | null }>;
};

function previewKey(): string {
  const k = process.env.ELF_ACCOUNT_PEPPER;
  if (!k) throw new Error("ELF_ACCOUNT_PEPPER is required");
  return `school-link-preview:${k}`;
}

function canonical(p: PreviewPayload, issuedAt: number): string {
  const seasons = [...p.seasons].sort((a, b) => a.campaign_slug.localeCompare(b.campaign_slug))
    .map(s => `${s.campaign_slug}=${s.expectedOrganizationId ?? "-"}`).join(";");
  return [p.adminId, p.slug, p.organizationId ?? "-", seasons, issuedAt].join("|");
}

export function signPreview(p: PreviewPayload, now = Date.now()): string {
  const mac = createHmac("sha256", previewKey()).update(canonical(p, now)).digest("hex");
  return `${now}.${mac}`;
}

export function verifyPreview(token: unknown, p: PreviewPayload, now = Date.now()): boolean {
  if (typeof token !== "string") return false;
  const m = /^(\d{13})\.([0-9a-f]{64})$/.exec(token);
  if (!m) return false;
  const issuedAt = Number(m[1]);
  if (!(now - issuedAt >= 0 && now - issuedAt <= PREVIEW_TTL_MS)) return false;
  const expected = createHmac("sha256", previewKey()).update(canonical(p, issuedAt)).digest();
  const given = Buffer.from(m[2], "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
