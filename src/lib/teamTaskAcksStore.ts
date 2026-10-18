// Team Management Phase 3 — task acknowledgments: database access via the
// service-role PostgREST API. Pure rules live in src/lib/teamTaskAcks.ts.
//
// Identity is ALWAYS derived here from the server-resolved TeamActor (signed
// session cookie) — never from anything the browser sends. The database
// function team_task_acknowledge() then re-checks every claim (team, role,
// account, current links, revision) inside its own transaction.
import type { TeamActor } from "./permissions.ts";
import { ACK_STATEMENT_VERSION, type AckIdentity, type AckRequirement, type AckStatusRow } from "./teamTaskAcks.ts";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

export type AckFailure =
  | "unavailable"        // acknowledgment table/functions not migrated
  | "not_found"          // task not on this team
  | "inactive"           // task archived
  | "not_required"       // task doesn't ask this role to acknowledge
  | "revision_changed"   // task changed since it was reviewed
  | "not_eligible"       // not (or no longer) linked / wrong role or team
  | "invalid_name"
  | "error";

export type AckResult<T> = { ok: true; value: T } | { ok: false; reason: AckFailure };

const MISSING_SCHEMA_CODES = new Set(["PGRST205", "PGRST202", "42P01", "42883"]);

function parseError(body: string): { code?: string; message?: string } {
  try {
    const j = JSON.parse(body) as { code?: string; message?: string };
    return { code: j.code, message: j.message };
  } catch {
    return {};
  }
}

/** Maps a failed team_task_acknowledge()/status response to an AckFailure. */
export function classifyAckError(body: string): AckFailure {
  const { code, message = "" } = parseError(body);
  if (code && MISSING_SCHEMA_CODES.has(code)) return "unavailable";
  if (message.includes("team_task_ack_task_not_found")) return "not_found";
  if (message.includes("team_task_ack_task_inactive")) return "inactive";
  if (message.includes("team_task_ack_not_required")) return "not_required";
  if (message.includes("team_task_ack_revision_changed")) return "revision_changed";
  if (message.includes("team_task_ack_invalid_name")) return "invalid_name";
  if (
    message.includes("team_task_ack_member_not_found") ||
    message.includes("team_task_ack_identity_mismatch") ||
    message.includes("team_task_ack_role_mismatch") ||
    message.includes("team_task_ack_athlete_not_linked") ||
    message.includes("team_task_ack_no_athletes")
  ) return "not_eligible";
  return "error";
}

type MemberRow = { id: string; name: string | null; role: string; athlete_id: string | null; account_id: string | null };

// Strict reads: a database error THROWS. Never read a failed lookup as
// "no rows" — for acknowledgments that would hide a linked child (and
// could show a parent as done when a child is still outstanding).
async function strictRows<T>(path: string): Promise<T[]> {
  const res = await fetch(`${BASE}/rest/v1/${path}`, { headers: h(), cache: "no-store" });
  if (!res.ok) throw new Error(`[teamTaskAcks] ${res.status} ${await res.text()}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error("[teamTaskAcks] unexpected response");
  return rows as T[];
}

async function firstRow<T>(path: string): Promise<T | null> {
  return (await strictRows<T>(path))[0] ?? null;
}

/** Every athlete a parent member is linked to: the legacy athlete_id
 *  column plus team_member_athletes (second/third child). Same
 *  relationship model as getLinkedAthleteIdsForMember() in
 *  familyRelationships.ts, but strict — it throws on a database error
 *  instead of returning only the legacy link. */
async function linkedAthleteIdsStrict(memberId: string, legacyAthleteId: string | null): Promise<string[]> {
  const rows = await strictRows<{ athlete_id: string }>(
    `team_member_athletes?team_member_id=eq.${encodeURIComponent(memberId)}&select=athlete_id`,
  );
  const ids = new Set(rows.map(r => r.athlete_id));
  if (legacyAthleteId) ids.add(legacyAthleteId);
  return [...ids];
}

async function identityFor(member: MemberRow, accountId: string | null): Promise<AckIdentity | null> {
  if (member.role !== "athlete" && member.role !== "parent") return null;
  const requirement = member.role as AckRequirement;
  const athleteIds = requirement === "athlete"
    ? (member.athlete_id ? [member.athlete_id] : [])
    : await linkedAthleteIdsStrict(member.id, member.athlete_id);
  return { memberId: member.id, accountId, memberName: member.name, requirement, athleteIds };
}

/**
 * Who this actor may acknowledge as on this team, or null if nobody:
 *  - an athlete or parent member: their own team_members row and the
 *    account the session resolved (null for a legacy team-login member);
 *  - a Head/Assistant Coach who is also a linked parent on this team: the
 *    parent team_members row owned by the coach's own ELF account (read
 *    from their team_coaches row — never from the browser);
 *  - platform admins and boosters: nobody (they never acknowledge).
 * Throws if any lookup fails — callers must treat that as "status
 * unknown", never as "nothing to acknowledge".
 */
export async function resolveAckIdentity(actor: TeamActor, slug: string): Promise<AckIdentity | null> {
  if (actor.kind === "member") {
    const s = actor.session;
    return identityFor(
      { id: s.id, name: s.name, role: s.role, athlete_id: s.athlete_id, account_id: s.account_id },
      s.account_id,
    );
  }
  if (actor.kind === "coach") {
    const coach = await firstRow<{ account_id: string | null }>(
      `team_coaches?id=eq.${encodeURIComponent(actor.session.id)}&campaign_slug=eq.${encodeURIComponent(slug)}&select=account_id&limit=1`,
    );
    if (!coach?.account_id) return null;
    const member = await firstRow<MemberRow>(
      `team_members?account_id=eq.${encodeURIComponent(coach.account_id)}&campaign_slug=eq.${encodeURIComponent(slug)}` +
        `&role=eq.parent&select=id,name,role,athlete_id,account_id&limit=1`,
    );
    return member ? identityFor(member, coach.account_id) : null;
  }
  return null;
}

/** team_task_ack_status() for some athletes (and optionally tasks). */
export async function getAckStatus(
  slug: string,
  athleteIds: readonly string[],
  taskIds?: readonly string[],
): Promise<AckResult<AckStatusRow[]>> {
  if (athleteIds.length === 0) return { ok: true, value: [] };
  try {
    const res = await fetch(`${BASE}/rest/v1/rpc/team_task_ack_status`, {
      method: "POST",
      headers: h(),
      body: JSON.stringify({ p_campaign_slug: slug, p_athlete_ids: athleteIds, p_task_ids: taskIds ?? null }),
    });
    if (!res.ok) {
      const body = await res.text();
      const reason = classifyAckError(body);
      if (reason === "error") console.error("[teamTaskAcks] status failed:", res.status, body);
      return { ok: false, reason };
    }
    const rows = await res.json();
    return { ok: true, value: Array.isArray(rows) ? rows : [] };
  } catch (err) {
    console.error("[teamTaskAcks] status failed:", err);
    return { ok: false, reason: "error" };
  }
}

/** Display names for exactly these athletes on this team. Strict: throws on
 *  a database error, or if any requested athlete is missing or has a blank
 *  name — the acknowledgment form names every child it covers, so a
 *  generic placeholder must never stand in for one. Rows for any other id
 *  are ignored. */
export async function getAthleteNamesStrict(slug: string, ids: readonly string[]): Promise<Map<string, string>> {
  const wanted = new Set(ids);
  const names = new Map<string, string>();
  if (wanted.size === 0) return names;
  const rows = await strictRows<{ id: string; name: string | null }>(
    `athletes?campaign_slug=eq.${encodeURIComponent(slug)}&id=in.(${[...wanted].map(encodeURIComponent).join(",")})&select=id,name`,
  );
  for (const a of rows) {
    const name = typeof a.name === "string" ? a.name.trim() : "";
    if (wanted.has(a.id) && name) names.set(a.id, name);
  }
  const missing = [...wanted].filter(id => !names.has(id));
  if (missing.length > 0) throw new Error(`[teamTaskAcks] athlete names unavailable for ${missing.length} athlete(s)`);
  return names;
}

export type AckOutcome = { athlete_id: string; outcome: "recorded" | "already_satisfied"; acknowledgment_id: string };

/** Records the acknowledgment through team_task_acknowledge() — the only
 *  write path the database allows. Every argument except the typed name
 *  and the reviewed revision comes from the server-derived identity. */
export async function submitAcknowledgment(args: {
  slug: string;
  taskId: string;
  expectedRevision: number;
  identity: AckIdentity;
  athleteIds: readonly string[];
  fullName: string;
}): Promise<AckResult<AckOutcome[]>> {
  try {
    const res = await fetch(`${BASE}/rest/v1/rpc/team_task_acknowledge`, {
      method: "POST",
      headers: h(),
      body: JSON.stringify({
        p_task_id: args.taskId,
        p_campaign_slug: args.slug,
        p_expected_revision: args.expectedRevision,
        p_requirement: args.identity.requirement,
        p_athlete_ids: args.athleteIds,
        p_member_id: args.identity.memberId,
        p_account_id: args.identity.accountId,
        p_full_name: args.fullName,
        p_statement_version: ACK_STATEMENT_VERSION,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      const reason = classifyAckError(body);
      if (reason === "error") console.error("[teamTaskAcks] acknowledge failed:", res.status, body);
      return { ok: false, reason };
    }
    const rows = await res.json();
    return { ok: true, value: Array.isArray(rows) ? rows : [] };
  } catch (err) {
    console.error("[teamTaskAcks] acknowledge failed:", err);
    return { ok: false, reason: "error" };
  }
}
