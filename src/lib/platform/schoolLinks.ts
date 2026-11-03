// School-Account Linking, Phase B — server-side reads and the one write
// (campaign_settings.organization_id, via the school_link_apply() database
// function) behind Platform Admin school linking.
// Server-only: service-role key via _client.ts. Callers (the
// /api/platform-admin/school-links routes and /platform-admin pages) verify
// getPlatformAdminSession() first. Rules are in schoolLinksLogic.ts.
//
// Reads here are STRICT (throw on any failure) — unlike restList(), an
// empty answer must never be mistaken for "no seasons" or "no school".
import { createHmac, timingSafeEqual } from "crypto";
import { restHeaders, restUrl } from "./_client";
import {
  isCampaignSlug,
  orderChain,
  sanitizeSchoolQuery,
  type OrgRow,
  type SeasonRow,
} from "./schoolLinksLogic";

export class SchoolLinkReadError extends Error {}

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

export type ApplyErrorCode =
  | "stale"
  | "nothing_to_change"
  | "season_not_in_team"
  | "team_not_found"
  | "organization_not_found"
  | "not_authorized"
  | "invalid"
  | "error";

export type ApplyResult =
  | { ok: true; updated: string[]; unchanged: string[] }
  | { ok: false; reason: ApplyErrorCode };

/** school_link_apply()'s fixed error codes → ours. Anything else (network,
 *  HTTP 5xx, an unexpected database error) is "error"; nothing changed. */
const RPC_ERRORS: Record<string, ApplyErrorCode> = {
  school_link_stale: "stale",
  school_link_nothing_to_change: "nothing_to_change",
  school_link_season_not_in_team: "season_not_in_team",
  school_link_team_not_found: "team_not_found",
  school_link_organization_not_found: "organization_not_found",
  school_link_actor_not_authorized: "not_authorized",
  school_link_actor_invalid: "not_authorized",
  school_link_invalid: "invalid",
};

/** Links (or unlinks, targetId null) the selected seasons of one team in a
 *  single database transaction — public.school_link_apply()
 *  (phase_o3_school_link_apply.sql). The database re-checks the Platform
 *  Admin, the team's season chain, and that every season still has the
 *  school the preview showed; then it writes the audit rows and the links
 *  together. Any failure changes nothing and writes no audit row — there is
 *  no application-level rollback. Completed seasons are allowed (only
 *  organization_id changes). `actor` must come from the verified
 *  getPlatformAdminSession(), never from the request body. */
export async function applySchoolLink(input: {
  actor: { platformAdminId: string; accountId: string };
  teamSlug: string;
  targetId: string | null;
  seasons: ReadonlyArray<{ campaign_slug: string; expectedOrganizationId: string | null }>;
  request: { ipAddress: string | null; userAgent: string | null };
}): Promise<ApplyResult> {
  let res: Response;
  try {
    res = await fetch(restUrl("rpc/school_link_apply"), {
      method: "POST",
      headers: restHeaders(),
      cache: "no-store",
      body: JSON.stringify({
        p_actor: { platform_admin_id: input.actor.platformAdminId, account_id: input.actor.accountId },
        p_team_slug: input.teamSlug,
        p_organization_id: input.targetId,
        p_seasons: input.seasons.map(s => ({ campaign_slug: s.campaign_slug, expected_organization_id: s.expectedOrganizationId })),
        p_request: { ip_address: input.request.ipAddress, user_agent: input.request.userAgent },
      }),
    });
  } catch {
    return { ok: false, reason: "error" };
  }
  if (!res.ok) {
    // Only the fixed code is read — never echoed (it can't carry row data,
    // but other database errors could).
    const body = await res.json().catch(() => null) as { message?: unknown } | null;
    const code = typeof body?.message === "string" ? RPC_ERRORS[body.message] : undefined;
    return { ok: false, reason: code ?? "error" };
  }
  const data = await res.json().catch(() => null) as { updated?: unknown; unchanged?: unknown } | null;
  const list = (v: unknown) => Array.isArray(v) && v.every(x => typeof x === "string") ? v as string[] : null;
  const updated = list(data?.updated), unchanged = list(data?.unchanged);
  // The transaction committed; an unreadable reply still means it applied.
  return { ok: true, updated: updated ?? [], unchanged: unchanged ?? [] };
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
