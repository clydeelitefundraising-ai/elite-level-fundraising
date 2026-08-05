// Phase A28: Head Coach-managed Team Staff (Assistant Coach / Booster).
//
// Mirrors coachAssignment.ts's shape and conventions (same REST helper
// pattern, same "validate everything before the first write" discipline
// established by the Phase A26 orphaned-campaign fix) but is scoped to a
// single Head Coach's own campaign rather than platform-wide admin.
import { randomBytes } from "crypto";
import { generateAccountSalt, hashAccountPassword } from "@/lib/accountAuth";
import { generateInviteToken, hashInviteToken, tokenExpiresAt } from "@/lib/coachInvite";
import { findAccountByEmail, type CoachAccount } from "@/lib/coachAssignment";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

export const STAFF_ASSIGNABLE_ROLES = ["assistant_coach", "booster"] as const;
export type StaffAssignableRole = typeof STAFF_ASSIGNABLE_ROLES[number];

export function isStaffAssignableRole(role: unknown): role is StaffAssignableRole {
  return typeof role === "string" && (STAFF_ASSIGNABLE_ROLES as readonly string[]).includes(role);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Invitations reuse the same 24h duration as the existing coach-invite flow
// (coachInvite.ts's inviteExpiresAt) — same category of "set up account
// access" token, not the 1h password-reset duration.
const INVITE_EXPIRY_HOURS = 24;

export type StaffRow = {
  id: string;
  name: string;
  email: string | null;
  role: "head_coach" | "assistant_coach" | "booster";
  account_id: string | null;
  created_at: string;
};

export async function listTeamCoaches(slug: string): Promise<StaffRow[]> {
  const res = await fetch(
    `${BASE}/rest/v1/team_coaches?campaign_slug=eq.${encodeURIComponent(slug)}&select=id,name,email,role,account_id,created_at&order=created_at.asc`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return [];
  return res.json();
}

export type PendingInvitationRow = {
  id: string;
  email: string;
  full_name: string;
  role: StaffAssignableRole;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

export async function listPendingInvitations(slug: string): Promise<PendingInvitationRow[]> {
  const res = await fetch(
    `${BASE}/rest/v1/team_staff_invitations?campaign_slug=eq.${encodeURIComponent(slug)}&accepted_at=is.null&revoked_at=is.null&select=id,email,full_name,role,expires_at,created_at,updated_at&order=created_at.desc`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return [];
  return res.json();
}

// True if this account already has ANY relationship (coach or member) on
// this exact campaign. getActorForAccount's documented "member wins over
// coach" precedence means a second, same-campaign team_coaches row would
// silently never resolve for a member-role account — a shadowed,
// functionally invisible relationship. Rather than extend that precedence
// model here, this is deliberately blocked. See Phase A28 discovery report.
export async function hasSameCampaignRelationship(accountId: string, slug: string): Promise<boolean> {
  const [coachRes, memberRes] = await Promise.all([
    fetch(`${BASE}/rest/v1/team_coaches?account_id=eq.${encodeURIComponent(accountId)}&campaign_slug=eq.${encodeURIComponent(slug)}&select=id&limit=1`, { headers: h(), cache: "no-store" }),
    fetch(`${BASE}/rest/v1/team_members?account_id=eq.${encodeURIComponent(accountId)}&campaign_slug=eq.${encodeURIComponent(slug)}&select=id&limit=1`, { headers: h(), cache: "no-store" }),
  ]);
  const coachRows = coachRes.ok ? await coachRes.json() : [];
  const memberRows = memberRes.ok ? await memberRes.json() : [];
  return (Array.isArray(coachRows) && coachRows.length > 0) || (Array.isArray(memberRows) && memberRows.length > 0);
}

export { findAccountByEmail };
export type { CoachAccount };

// ── Direct assignment (temp-password or existing-account) ─────────────────────

export type AssignResult =
  | { ok: true; staff: StaffRow; alreadyAssigned?: boolean }
  | { ok: false; error: string; status: number; existingAccount?: CoachAccount };

export async function createStaffAccountWithPassword(
  slug: string,
  fullName: string,
  email: string,
  role: StaffAssignableRole,
  password: string,
): Promise<AssignResult> {
  const normalized = normalizeEmail(email);
  const existing = await findAccountByEmail(normalized);
  if (existing) {
    return {
      ok: false,
      status: 409,
      error: "An ELF account already exists for this email. Add their existing account instead.",
      existingAccount: existing,
    };
  }

  const acctSalt = generateAccountSalt();
  const acctHash = hashAccountPassword(password, acctSalt);
  const acctRes = await fetch(`${BASE}/rest/v1/elf_accounts`, {
    method: "POST",
    headers: h({ Prefer: "return=representation" }),
    body: JSON.stringify({ email: normalized, name: fullName.trim(), password_hash: acctHash, salt: acctSalt }),
  });
  if (!acctRes.ok) {
    const msg = await acctRes.text();
    if (msg.includes("23505") || msg.includes("unique")) {
      // Race: another request created the account between our check and insert.
      const raced = await findAccountByEmail(normalized);
      if (raced) {
        return { ok: false, status: 409, error: "An ELF account already exists for this email. Add their existing account instead.", existingAccount: raced };
      }
    }
    return { ok: false, status: 500, error: "Failed to create the account." };
  }
  const acctRows = await acctRes.json();
  const account = acctRows[0] as { id: string };

  const coachRes = await fetch(`${BASE}/rest/v1/team_coaches`, {
    method: "POST",
    headers: h({ Prefer: "return=representation" }),
    body: JSON.stringify({
      campaign_slug: slug,
      name: fullName.trim(),
      email: normalized,
      role,
      account_id: account.id,
      // Vestigial once account_id is set — same "unused" convention used
      // throughout the account-based coach flows (coachAssignment.ts).
      password_hash: "unused",
      salt: randomBytes(16).toString("hex"),
    }),
  });
  if (!coachRes.ok) {
    // Best-effort cleanup: the account was created but the team relationship
    // failed. Remove the orphaned account rather than leaving a login with
    // no team access — the exact class of bug Phase A26 fixed for campaigns.
    await fetch(`${BASE}/rest/v1/elf_accounts?id=eq.${encodeURIComponent(account.id)}`, { method: "DELETE", headers: h({ Prefer: "return=minimal" }) }).catch(() => {});
    return { ok: false, status: 500, error: "Failed to add this person to the team." };
  }
  const coachRows = await coachRes.json();
  return { ok: true, staff: coachRows[0] as StaffRow };
}

export async function assignExistingAccountAsStaff(
  slug: string,
  accountId: string,
  role: StaffAssignableRole,
): Promise<AssignResult> {
  const acctRes = await fetch(
    `${BASE}/rest/v1/elf_accounts?id=eq.${encodeURIComponent(accountId)}&select=id,name,email&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  const acctRows = acctRes.ok ? await acctRes.json() : [];
  if (!Array.isArray(acctRows) || acctRows.length === 0) {
    return { ok: false, status: 400, error: "Selected account was not found." };
  }
  const account = acctRows[0] as CoachAccount;

  if (await hasSameCampaignRelationship(accountId, slug)) {
    // Covers both "already on this team" (idempotent — not an error a Head
    // Coach needs to see as a failure) and the same-campaign dual-role
    // conflict noted above (a member-role account on this exact team).
    const existingCoachRes = await fetch(
      `${BASE}/rest/v1/team_coaches?account_id=eq.${encodeURIComponent(accountId)}&campaign_slug=eq.${encodeURIComponent(slug)}&select=id,name,email,role,account_id,created_at&limit=1`,
      { headers: h(), cache: "no-store" },
    );
    const existingCoachRows = existingCoachRes.ok ? await existingCoachRes.json() : [];
    if (Array.isArray(existingCoachRows) && existingCoachRows.length > 0) {
      return { ok: true, staff: existingCoachRows[0] as StaffRow, alreadyAssigned: true };
    }
    return {
      ok: false,
      status: 409,
      error: "This person already has a role on this team (parent, athlete, or member) and can't also be added as staff. This is a known platform limitation — contact ELF Admin.",
    };
  }

  const coachRes = await fetch(`${BASE}/rest/v1/team_coaches`, {
    method: "POST",
    headers: h({ Prefer: "return=representation" }),
    body: JSON.stringify({
      campaign_slug: slug,
      name: account.name,
      email: account.email,
      role,
      account_id: account.id,
      password_hash: "unused",
      salt: randomBytes(16).toString("hex"),
    }),
  });
  if (!coachRes.ok) {
    const msg = await coachRes.text();
    if (msg.includes("23505") || msg.includes("unique")) {
      // Race with a concurrent identical request — idempotent success.
      const rows = await fetch(
        `${BASE}/rest/v1/team_coaches?account_id=eq.${encodeURIComponent(accountId)}&campaign_slug=eq.${encodeURIComponent(slug)}&select=id,name,email,role,account_id,created_at&limit=1`,
        { headers: h(), cache: "no-store" },
      ).then(r => (r.ok ? r.json() : []));
      if (Array.isArray(rows) && rows.length > 0) return { ok: true, staff: rows[0] as StaffRow, alreadyAssigned: true };
    }
    return { ok: false, status: 500, error: "Failed to add this person to the team." };
  }
  const coachRows = await coachRes.json();
  return { ok: true, staff: coachRows[0] as StaffRow };
}

// ── Invitations ─────────────────────────────────────────────────────────────

export type InviteResult =
  | { ok: true; outcome: "invitation_sent"; invitation: PendingInvitationRow; rawToken: string }
  | { ok: true; outcome: "existing_account"; account: CoachAccount }
  | { ok: false; error: string; status: number };

export async function createStaffInvitation(
  slug: string,
  fullName: string,
  email: string,
  role: StaffAssignableRole,
  invitedByAccountId: string | null,
): Promise<InviteResult> {
  const normalized = normalizeEmail(email);

  const existing = await findAccountByEmail(normalized);
  if (existing) {
    if (await hasSameCampaignRelationship(existing.id, slug)) {
      return { ok: false, status: 409, error: "This person is already part of this team." };
    }
    return { ok: true, outcome: "existing_account", account: existing };
  }

  const pendingRes = await fetch(
    `${BASE}/rest/v1/team_staff_invitations?campaign_slug=eq.${encodeURIComponent(slug)}&normalized_email=eq.${encodeURIComponent(normalized)}&role=eq.${role}&accepted_at=is.null&revoked_at=is.null&select=id&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  const pendingRows = pendingRes.ok ? await pendingRes.json() : [];
  if (Array.isArray(pendingRows) && pendingRows.length > 0) {
    return { ok: false, status: 409, error: "A pending invitation for this email and role already exists." };
  }

  const rawToken = generateInviteToken();
  const tokenHash = hashInviteToken(rawToken);
  const expiresAt = tokenExpiresAt(INVITE_EXPIRY_HOURS);

  const insertRes = await fetch(`${BASE}/rest/v1/team_staff_invitations`, {
    method: "POST",
    headers: h({ Prefer: "return=representation" }),
    body: JSON.stringify({
      campaign_slug: slug,
      email: email.trim(),
      normalized_email: normalized,
      full_name: fullName.trim(),
      role,
      token_hash: tokenHash,
      invited_by_account_id: invitedByAccountId,
      expires_at: expiresAt,
    }),
  });
  if (!insertRes.ok) {
    const msg = await insertRes.text();
    if (msg.includes("23505") || msg.includes("unique")) {
      return { ok: false, status: 409, error: "A pending invitation for this email and role already exists." };
    }
    return { ok: false, status: 500, error: "Failed to create the invitation." };
  }
  const rows = await insertRes.json();
  return { ok: true, outcome: "invitation_sent", invitation: rows[0] as PendingInvitationRow, rawToken };
}

export type MutateInviteResult =
  | { ok: true; invitation: PendingInvitationRow; rawToken?: string }
  | { ok: false; error: string; status: number };

async function getOwnedInvitation(id: string, slug: string) {
  const res = await fetch(
    `${BASE}/rest/v1/team_staff_invitations?id=eq.${encodeURIComponent(id)}&campaign_slug=eq.${encodeURIComponent(slug)}&select=id,campaign_slug,email,full_name,role,accepted_at,revoked_at,expires_at,created_at,updated_at&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  const rows = res.ok ? await res.json() : [];
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

export async function resendStaffInvitation(id: string, slug: string): Promise<MutateInviteResult> {
  const invite = await getOwnedInvitation(id, slug);
  if (!invite) return { ok: false, status: 404, error: "Invitation not found." };
  if (invite.accepted_at) return { ok: false, status: 409, error: "This invitation has already been accepted." };
  if (invite.revoked_at) return { ok: false, status: 409, error: "This invitation has been revoked." };

  // Rotate the token in place (same row) rather than inserting a new one —
  // avoids ever having more than one valid token per invitation.
  const rawToken = generateInviteToken();
  const tokenHash = hashInviteToken(rawToken);
  const expiresAt = tokenExpiresAt(INVITE_EXPIRY_HOURS);

  const updateRes = await fetch(
    `${BASE}/rest/v1/team_staff_invitations?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: h({ Prefer: "return=representation" }),
      body: JSON.stringify({ token_hash: tokenHash, expires_at: expiresAt, updated_at: new Date().toISOString() }),
    },
  );
  if (!updateRes.ok) return { ok: false, status: 500, error: "Failed to resend the invitation." };
  const rows = await updateRes.json();
  return { ok: true, invitation: rows[0] as PendingInvitationRow, rawToken };
}

export async function revokeStaffInvitation(id: string, slug: string): Promise<MutateInviteResult> {
  const invite = await getOwnedInvitation(id, slug);
  if (!invite) return { ok: false, status: 404, error: "Invitation not found." };
  if (invite.accepted_at) return { ok: false, status: 409, error: "This invitation has already been accepted." };
  if (invite.revoked_at) return { ok: true, invitation: invite as PendingInvitationRow };

  const updateRes = await fetch(
    `${BASE}/rest/v1/team_staff_invitations?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: h({ Prefer: "return=representation" }),
      body: JSON.stringify({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
    },
  );
  if (!updateRes.ok) return { ok: false, status: 500, error: "Failed to revoke the invitation." };
  const rows = await updateRes.json();
  return { ok: true, invitation: rows[0] as PendingInvitationRow };
}

// ── Acceptance (public, token-authenticated) ───────────────────────────────────

export type InvitationLookup = {
  id: string;
  campaign_slug: string;
  email: string;
  full_name: string;
  role: StaffAssignableRole;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};

export async function lookupInvitationByToken(rawToken: string): Promise<InvitationLookup | null> {
  const tokenHash = hashInviteToken(rawToken);
  const res = await fetch(
    `${BASE}/rest/v1/team_staff_invitations?token_hash=eq.${encodeURIComponent(tokenHash)}&select=id,campaign_slug,email,full_name,role,expires_at,accepted_at,revoked_at&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  const rows = res.ok ? await res.json() : [];
  return Array.isArray(rows) && rows.length > 0 ? (rows[0] as InvitationLookup) : null;
}

export type AcceptResult =
  | { ok: true; existingAccount: boolean; campaignSlug: string; newAccountId?: string; newAccountSalt?: string }
  | { ok: false; error: string; status: number };

export async function acceptStaffInvitation(rawToken: string, password: string | undefined): Promise<AcceptResult> {
  const invite = await lookupInvitationByToken(rawToken);
  if (!invite) return { ok: false, status: 400, error: "This invitation link is invalid." };
  if (invite.revoked_at) return { ok: false, status: 400, error: "This invitation has been revoked." };
  if (invite.accepted_at) return { ok: false, status: 400, error: "This invitation has already been used." };
  if (new Date(invite.expires_at) < new Date()) {
    return { ok: false, status: 400, error: "This invitation has expired. Ask your Head Coach to resend it." };
  }

  const normalized = normalizeEmail(invite.email);
  const existing = await findAccountByEmail(normalized);

  let accountId: string;
  let newAccountSalt: string | undefined;

  if (existing) {
    accountId = existing.id;
  } else {
    if (!password || password.length < 8) {
      return { ok: false, status: 400, error: "Password must be at least 8 characters." };
    }
    const salt = generateAccountSalt();
    const passwordHash = hashAccountPassword(password, salt);
    const acctRes = await fetch(`${BASE}/rest/v1/elf_accounts`, {
      method: "POST",
      headers: h({ Prefer: "return=representation" }),
      body: JSON.stringify({ email: normalized, name: invite.full_name, password_hash: passwordHash, salt }),
    });
    if (!acctRes.ok) {
      const msg = await acctRes.text();
      if (msg.includes("23505") || msg.includes("unique")) {
        // Raced with another signup for this email — retry as "existing".
        const raced = await findAccountByEmail(normalized);
        if (!raced) return { ok: false, status: 500, error: "Account creation failed." };
        accountId = raced.id;
      } else {
        return { ok: false, status: 500, error: "Account creation failed." };
      }
    } else {
      const rows = await acctRes.json();
      accountId = (rows[0] as { id: string }).id;
      newAccountSalt = salt;
    }
  }

  if (await hasSameCampaignRelationship(accountId, invite.campaign_slug)) {
    // State drifted since the invite was sent (e.g. they joined this same
    // team another way in the meantime). Do not create a shadowed second
    // relationship, and do not mark the invitation accepted — leaves it in
    // a state an admin can inspect rather than silently failing.
    return { ok: false, status: 409, error: "You already have a role on this team. Contact your Head Coach or ELF Admin." };
  }

  const coachRes = await fetch(`${BASE}/rest/v1/team_coaches`, {
    method: "POST",
    headers: h({ Prefer: "return=minimal" }),
    body: JSON.stringify({
      campaign_slug: invite.campaign_slug,
      name: invite.full_name,
      email: normalized,
      role: invite.role,
      account_id: accountId,
      password_hash: "unused",
      salt: randomBytes(16).toString("hex"),
    }),
  });
  if (!coachRes.ok) {
    const msg = await coachRes.text();
    const isDupe = msg.includes("23505") || msg.includes("unique");
    if (!isDupe) return { ok: false, status: 500, error: "Failed to join the team. Please try again." };
    // Idempotent: a concurrent accept already created this relationship.
  }

  await fetch(
    `${BASE}/rest/v1/team_staff_invitations?id=eq.${encodeURIComponent(invite.id)}`,
    { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify({ accepted_at: new Date().toISOString(), updated_at: new Date().toISOString() }) },
  );

  const isNewAccount = !!newAccountSalt;
  return { ok: true, existingAccount: !isNewAccount, campaignSlug: invite.campaign_slug, newAccountId: isNewAccount ? accountId : undefined, newAccountSalt };
}

// ── Removal ─────────────────────────────────────────────────────────────────

export type RemoveResult = { ok: true } | { ok: false; error: string; status: number };

export async function removeStaffRelationship(
  relationshipId: string,
  slug: string,
  actingAccountRelationshipId: string,
): Promise<RemoveResult> {
  const res = await fetch(
    `${BASE}/rest/v1/team_coaches?id=eq.${encodeURIComponent(relationshipId)}&campaign_slug=eq.${encodeURIComponent(slug)}&select=id,role&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  const rows = res.ok ? await res.json() : [];
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, status: 404, error: "Staff member not found on this team." };
  const target = rows[0] as { id: string; role: string };

  if (target.role === "head_coach") {
    return { ok: false, status: 403, error: "Head Coaches cannot be removed from here." };
  }
  if (target.id === actingAccountRelationshipId) {
    return { ok: false, status: 403, error: "You cannot remove yourself." };
  }

  const deleteRes = await fetch(
    `${BASE}/rest/v1/team_coaches?id=eq.${encodeURIComponent(relationshipId)}`,
    { method: "DELETE", headers: h({ Prefer: "return=minimal" }) },
  );
  if (!deleteRes.ok) return { ok: false, status: 500, error: "Failed to remove this staff member." };
  return { ok: true };
}
