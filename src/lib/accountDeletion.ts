// Phase A38: Self-service Account Deletion (Apple Guideline 2.1 — account
// registration/login/deletion must all be demonstrable).
//
// GROUND TRUTH THIS DESIGN RELIES ON (confirmed by a read-only audit
// before writing any of this — see the session's Phase 5 investigation):
//  - elf_accounts is a SMALL table: id, email, password_hash, salt, name,
//    created_at, profile_photo_url. No session table exists — a login
//    cookie is `${accountId}:${sha256(accountId + salt + PEPPER)}`,
//    reverified against the CURRENT stored salt on every request
//    (src/lib/accountAuth.ts). So deleting the elf_accounts row itself
//    (not just editing it) makes every existing cookie for that account
//    fail verification on the very next request — there is no separate
//    session/token store to revoke.
//  - NO financial/fundraising table has any FK to elf_accounts:
//    `donations` and `team_orders` key off free-text donor/customer
//    fields, `campaign_slug`, and `athlete_id`/`stripe_session_id` —
//    never an account id. Deleting an elf_accounts row is therefore
//    architecturally incapable of corrupting donation totals, campaign
//    totals, or order history — those tables simply never reference it.
//  - Content authorship (announcements, comments, messages) FKs to
//    team_coaches.id / team_members.id / platform_admins.id, never
//    directly to elf_accounts.id, and already stores a durable
//    author_name/author_role SNAPSHOT independent of any live join (the
//    exact convention documented in phase_3b2_announcement_comments.sql
//    for a departing member). Deleting the login row only ever nulls out
//    team_coaches.account_id / team_members.account_id (existing ON
//    DELETE SET NULL) — the role row, its roster listing, and everything
//    it ever authored survive untouched, exactly as they already do
//    today when a membership is removed by staff.
//  - platform_admins.account_id has NO ON DELETE clause (defaults to
//    RESTRICT) and is NOT NULL UNIQUE — the database itself refuses to
//    delete an elf_accounts row that is still a platform admin. This
//    module respects that by explicitly removing the platform_admins row
//    first (only after confirming it is not the last one — see below),
//    rather than trying to defeat or route around the constraint.
//  - The same elf_accounts row can be linked to a coach role on one
//    campaign and a member role on another (account_id is unique per
//    (campaign_slug, account_id), not globally). Deletion here is
//    therefore whole-LOGIN deletion, not single-team removal — it is
//    what an ordinary user means by "delete my account", and it correctly
//    revokes access to every team the person belongs to, not just the
//    one they happened to click "Delete Account" from.
//  - team_coaches has no unique constraint limiting a campaign to one
//    head_coach row (src/lib/messages.ts's fetchHeadCoaches() already
//    returns an array, assuming zero-or-many) — so "don't leave a team
//    without an administrator" must be a runtime COUNT check here, not
//    something the schema already guarantees.
// Relative imports (not the "@/lib/..." alias) — see reports.ts for why:
// plain `node --test` has no path-alias resolution.
import { restList, restDelete } from "./platform/_client.ts";
import { logAuditEvent, type AuditActor } from "./auditLog.ts";
import type { TeamActor } from "./permissions.ts";
import { collectIdentities, purgePersonalUgc, type PurgeSummary } from "./accountDeletionPurge.ts";

type HeadCoachBlocker = { campaign_slug: string };

async function resolveAccountId(actor: TeamActor): Promise<string | null> {
  if (actor.kind === "platform_admin") return actor.session.accountId;
  if (actor.kind === "member") return actor.session.account_id;
  if (actor.kind === "coach") {
    // CoachSession does not carry account_id directly (unlike
    // MemberSession/PlatformAdminActorSession) — one extra lookup by the
    // coach's own row id.
    const rows = await restList<{ account_id: string | null }>(
      `team_coaches?id=eq.${encodeURIComponent(actor.session.id)}&select=account_id&limit=1`,
    );
    return rows[0]?.account_id ?? null;
  }
  return null;
}

// Every campaign where this account is a head_coach AND removing them
// would leave that campaign with zero head coaches. An account can be
// head coach of more than one team (Phase 5 investigation, §5) — every
// one of them must independently have a successor, or deletion is
// refused entirely rather than silently orphaning any single team.
async function findHeadCoachBlockers(accountId: string): Promise<HeadCoachBlocker[]> {
  const ownRows = await restList<{ id: string; campaign_slug: string }>(
    `team_coaches?account_id=eq.${encodeURIComponent(accountId)}&role=eq.head_coach&select=id,campaign_slug`,
  );
  if (!ownRows.length) return [];

  const blockers: HeadCoachBlocker[] = [];
  for (const row of ownRows) {
    const others = await restList<{ id: string }>(
      `team_coaches?campaign_slug=eq.${encodeURIComponent(row.campaign_slug)}&role=eq.head_coach` +
      `&id=neq.${encodeURIComponent(row.id)}&select=id&limit=1`,
    );
    if (others.length === 0) blockers.push({ campaign_slug: row.campaign_slug });
  }
  return blockers;
}

// True only if this account IS a platform admin AND is the last one —
// deletion must never silently eliminate ELF's own administrative
// access. Not a schema-enforced invariant (Phase 5 investigation found
// none), so checked here explicitly.
async function isLastPlatformAdmin(accountId: string): Promise<{ isAdmin: boolean; isLast: boolean }> {
  const mine = await restList<{ id: string }>(
    `platform_admins?account_id=eq.${encodeURIComponent(accountId)}&select=id&limit=1`,
  );
  if (!mine.length) return { isAdmin: false, isLast: false };
  const allAdmins = await restList<{ id: string }>(`platform_admins?select=id`);
  return { isAdmin: true, isLast: allAdmins.length <= 1 };
}

export type DeleteAccountResult =
  | { ok: true; purge: PurgeSummary }
  | { ok: false; reason: "no_linked_account" }
  // Both blockers below are DEPENDENCIES, not permanent denials — see
  // findHeadCoachBlockers/isLastPlatformAdmin: once a second head coach
  // (per blocked campaign) or a second platform admin exists, this same
  // call succeeds with no other change required.
  | { ok: false; reason: "last_platform_admin" }
  | { ok: false; reason: "head_coach_blocker"; campaigns: string[] }
  | { ok: false; reason: "server_error" };

export async function deleteAccount(actor: Extract<TeamActor, { kind: "coach" | "member" | "platform_admin" }>): Promise<DeleteAccountResult> {
  const accountId = await resolveAccountId(actor);
  if (!accountId) return { ok: false, reason: "no_linked_account" };

  const headCoachBlockers = await findHeadCoachBlockers(accountId);
  if (headCoachBlockers.length > 0) {
    return { ok: false, reason: "head_coach_blocker", campaigns: headCoachBlockers.map(b => b.campaign_slug) };
  }

  const { isAdmin, isLast } = await isLastPlatformAdmin(accountId);
  if (isAdmin && isLast) return { ok: false, reason: "last_platform_admin" };

  let purge: PurgeSummary;
  try {
    // Personal UGC purge MUST run before the elf_accounts row is deleted —
    // it needs both the account's identities (team_coaches/team_members/
    // platform_admins rows, keyed off account_id) and the account's own
    // profile_photo_url. See accountDeletionPurge.ts for exactly what is
    // deleted vs. anonymized vs. left alone, and why.
    const identities = await collectIdentities(accountId);
    purge = await purgePersonalUgc(accountId, identities);

    // Remove the platform_admins row FIRST — it's the only thing standing
    // between this account and deletion (RESTRICT, not SET NULL/CASCADE).
    // Already confirmed above this is not the last one.
    if (isAdmin) {
      await restDelete(`platform_admins?account_id=eq.${encodeURIComponent(accountId)}`);
    }

    // The elf_accounts row itself. Every other reference (team_coaches.
    // account_id, team_members.account_id, and the small ephemeral
    // tables — push_devices, push_preferences, account_reset_tokens,
    // pending_athlete_requests) resolves via their EXISTING ON DELETE
    // behavior (SET NULL or CASCADE, all already live in production
    // schema, none added by this change). announcements are deliberately
    // NOT touched — see accountDeletionPurge.ts's header comment for why
    // they're treated as team-owned operational records, not personal UGC.
    await restDelete(`elf_accounts?id=eq.${encodeURIComponent(accountId)}`);
  } catch (err) {
    console.error("[accountDeletion] deleteAccount failed:", err);
    return { ok: false, reason: "server_error" };
  }

  const auditActor: AuditActor =
    actor.kind === "coach"
      ? { type: "coach", id: actor.session.id, name: actor.session.name }
      : actor.kind === "platform_admin"
      ? { type: "platform_admin", id: actor.session.platformAdminId, email: actor.session.email, name: actor.session.name }
      : { type: "member", id: actor.session.id, name: actor.session.name };

  // campaign_slug is intentionally null — this is a cross-campaign
  // identity action, not scoped to the one team the request happened to
  // originate from.
  logAuditEvent({
    actor: auditActor,
    action: "account.deleted",
    entity_type: "elf_accounts",
    entity_id: accountId,
    campaign_slug: null,
    summary: "Self-service account deletion",
    new_value: { ...purge },
  });

  return { ok: true, purge };
}
