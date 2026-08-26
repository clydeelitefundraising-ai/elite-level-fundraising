import type { TeamActor } from "@/lib/permissions";

// Who actually performed the action, resolved server-side and never
// trusted from client input. Three kinds, matching the three real
// identity systems in this codebase:
//  - "coach"          a real team_coaches row (head/assistant coach)
//  - "platform_admin" an authorized ELF employee, resolved from the
//                      platform_admins table — NEVER a team_coaches row
//  - "admin_tool"      the legacy shared-password /admin ops tool, which
//                      has no per-employee identity to attribute to
// "system" is NOT one of the three kinds Phase 3 scoped — it exists only
// because one pre-existing call site (auth/staff-invite-accept) audits a
// public, unauthenticated self-registration action (an invitee redeeming
// their own invite token, before any session/TeamActor exists at all).
// Neither "coach" nor "platform_admin" nor "admin_tool" honestly describes
// that actor, so this narrow escape hatch exists rather than mislabeling
// it as one of the three. Not intended for any new call site — flag this
// with the user before reusing it elsewhere.
export type AuditActor =
  | { type: "coach";          id: string; name?: string | null }
  | { type: "platform_admin"; id: string; email: string; name?: string | null }
  | { type: "admin_tool" }
  | { type: "system"; note: string };

/** The legacy /admin ops tool has no per-employee login — every call site
 *  under src/app/api/admin/** uses this literal, making the "no real
 *  identity here" fact explicit in actor_type rather than implicit in a
 *  hardcoded string. */
export const ADMIN_TOOL_ACTOR: AuditActor = { type: "admin_tool" };

/** Builds an AuditActor from an already-resolved, already-authorized
 *  TeamActor. Callers narrow to "coach" | "platform_admin" themselves
 *  (every mutation route already does this via isHeadCoach/canManageStaff
 *  before calling logAuditEvent) — this never accepts "member" or
 *  "public" because no audited mutation is reachable by either. */
export function toAuditActor(actor: Extract<TeamActor, { kind: "coach" | "platform_admin" }>): AuditActor {
  if (actor.kind === "coach") {
    return { type: "coach", id: actor.session.id, name: actor.session.name };
  }
  return { type: "platform_admin", id: actor.session.platformAdminId, email: actor.session.email, name: actor.session.name };
}

// Preserves the exact string every historical row already has ("admin",
// for every admin_tool-era row) and gives every new coach/platform_admin
// row a real, human-readable identifier — so the existing CommandCenter
// feed (src/lib/platform/audit.ts), which only ever displays this column,
// keeps rendering sensibly with zero changes to it required.
export function adminIdentifierFor(actor: AuditActor): string {
  if (actor.type === "admin_tool") return "admin";
  if (actor.type === "system") return `system:${actor.note}`;
  if (actor.type === "platform_admin") return actor.email;
  return actor.name ?? `coach:${actor.id}`;
}

export type AuditEventParams = {
  actor:           AuditActor;
  action:          string;
  entity_type?:    string;
  entity_id?:      string;
  campaign_slug?:  string | null;
  summary?:        string;
  previous_value?: Record<string, unknown> | null;
  new_value?:      Record<string, unknown> | null;
  ip_address?:     string | null;
  user_agent?:     string | null;
};

export function logAuditEvent(params: AuditEventParams): void {
  const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!BASE || !key) return;

  fetch(`${BASE}/rest/v1/audit_logs`, {
    method:  "POST",
    headers: {
      apikey:           key,
      Authorization:    `Bearer ${key}`,
      "Content-Type":   "application/json",
      Prefer:           "return=minimal",
    },
    body: JSON.stringify({
      action:           params.action,
      entity_type:      params.entity_type    ?? null,
      entity_id:        params.entity_id      ?? null,
      campaign_slug:    params.campaign_slug   ?? null,
      summary:          params.summary         ?? null,
      previous_value:   params.previous_value  ?? null,
      new_value:        params.new_value        ?? null,
      admin_identifier: adminIdentifierFor(params.actor),
      actor_type:       params.actor.type,
      actor_id:         params.actor.type === "coach" || params.actor.type === "platform_admin" ? params.actor.id : null,
      actor_email:      params.actor.type === "platform_admin" ? params.actor.email : null,
      ip_address:       params.ip_address      ?? null,
      user_agent:       params.user_agent       ?? null,
    }),
  })
    // Fire-and-forget — an audit failure must never fail the user's
    // request. Not silent, though: a failed insert is a real operational
    // problem (a mutation happened with no audit trail), so it's worth a
    // server log line. Only the action name + response status are
    // logged — never the summary/previous_value/new_value payload, which
    // can carry names/emails/ids that don't belong in server logs.
    .then(res => {
      if (!res.ok) {
        console.warn(`[auditLog] insert failed for action "${params.action}" (status ${res.status})`);
      }
    })
    .catch(() => {
      console.warn(`[auditLog] insert threw for action "${params.action}"`);
    });
}

export function ipOf(req: { headers: { get(k: string): string | null } }): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip");
}
