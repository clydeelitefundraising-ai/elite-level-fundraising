// Who can be messaged as a parent/guardian — the ONE definition used by the
// Messages directory (Parent tab and "Message Parent/Guardian") and by the
// server when a new conversation is started (resolveOrCreateThreadForRecipient).
// Pure, so the server and tests share it.
//
// A parent is message-capable when someone can actually sign in as them:
//   • they have an ELF account (team_members.account_id) — every parent
//     approved through the account join flow; or
//   • they joined through the legacy team-code endpoint
//     (POST /api/team/[slug]/join) less than LEGACY_MEMBER_SESSION_DAYS ago.
//     That route creates a row with no account and signs the person in
//     with a team_member cookie that lasts 30 days and is never renewed or
//     re-issued (there is no password to sign back in with), so after that
//     window no one can be signed in as that row.
// Every other parent row without an account (expired legacy joins, seeded
// or placeholder records) can't read messages, so starting a conversation
// with them is refused. Existing conversations are never affected: reuse
// and replies don't go through this check.

/** Lifetime of the legacy team-code join's team_member cookie (maxAge in
 *  src/app/api/team/[slug]/join/route.ts — a test keeps them in sync). */
export const LEGACY_MEMBER_SESSION_DAYS = 30;

export type ParentRecipientRow = {
  role: string;
  account_id: string | null | undefined;
  created_at: string | null | undefined;
};

export type ParentRecipientStatus = "account" | "legacy_session" | "no_account";

export const PARENT_UNAVAILABLE_TEXT = "No active ELF account yet";
export const PARENT_UNAVAILABLE_ERROR =
  "This parent doesn't have an active ELF account yet, so a new conversation can't be started with them.";

export function parentRecipientStatus(row: ParentRecipientRow, now: Date = new Date()): ParentRecipientStatus {
  if (row.account_id) return "account";
  const created = row.created_at ? Date.parse(row.created_at) : NaN;
  if (Number.isFinite(created)) {
    const age = now.getTime() - created;
    if (age >= 0 && age < LEGACY_MEMBER_SESSION_DAYS * 86_400_000) return "legacy_session";
  }
  return "no_account";
}

/** True when a new conversation may be started with this parent. */
export function isMessageCapableParent(row: ParentRecipientRow, now: Date = new Date()): boolean {
  return parentRecipientStatus(row, now) !== "no_account";
}
