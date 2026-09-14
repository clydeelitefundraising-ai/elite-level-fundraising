// Phase A37: Interpersonal User Blocking.
//
// CRITICAL INVARIANT: this module is never imported by
// src/lib/teamData.ts's getAnnouncements()/getAnnouncementMeta(), by
// src/lib/announcementVisibility.ts, or by any push-notification dispatch
// for official announcements. A block suppresses interpersonal messaging
// and (optionally, at render time) a blocked actor's comments from the
// blocker's own view — nothing else. See phase_a37_user_blocks.sql for
// the full rationale.
// Relative imports (not the "@/lib/..." alias) — see reports.ts for why:
// plain `node --test` has no path-alias resolution.
import { restList, restInsert, restDelete } from "../platform/_client.ts";
import { fetchCoachById, fetchMemberById, type ActorKey } from "../messages.ts";
import { staffRoleLabel, memberRoleLabel, platformAdminRoleLabel } from "../permissions.ts";

export type UserBlockRow = {
  id:            string;
  campaign_slug: string;
  blocker_kind:  ActorKey["kind"];
  blocker_id:    string;
  blocked_kind:  ActorKey["kind"];
  blocked_id:    string;
  created_at:    string;
};

export type CreateBlockResult =
  | { ok: true; block: UserBlockRow }
  | { ok: true; already_blocked: true }
  | { ok: false; reason: "self_block" }
  | { ok: false; reason: "server_error" };

export async function blockUser(
  campaignSlug: string,
  blocker:      ActorKey,
  blockedKind:  ActorKey["kind"],
  blockedId:    string,
): Promise<CreateBlockResult> {
  if (blocker.kind === blockedKind && blocker.id === blockedId) {
    return { ok: false, reason: "self_block" };
  }

  const existing = await restList<UserBlockRow>(
    `user_blocks?campaign_slug=eq.${encodeURIComponent(campaignSlug)}` +
    `&blocker_kind=eq.${encodeURIComponent(blocker.kind)}&blocker_id=eq.${encodeURIComponent(blocker.id)}` +
    `&blocked_kind=eq.${encodeURIComponent(blockedKind)}&blocked_id=eq.${encodeURIComponent(blockedId)}&select=id&limit=1`,
  );
  if (existing.length > 0) return { ok: true, already_blocked: true };

  try {
    const rows = await restInsert<UserBlockRow>("user_blocks?select=*", {
      campaign_slug: campaignSlug,
      blocker_kind:  blocker.kind,
      blocker_id:    blocker.id,
      blocked_kind:  blockedKind,
      blocked_id:    blockedId,
    });
    return { ok: true, block: rows[0] };
  } catch (err) {
    console.error("[moderation/blocks] blockUser insert failed:", err);
    return { ok: false, reason: "server_error" };
  }
}

export async function unblockUser(
  campaignSlug: string,
  blocker:      ActorKey,
  blockedKind:  ActorKey["kind"],
  blockedId:    string,
): Promise<{ ok: true } | { ok: false; reason: "server_error" }> {
  try {
    await restDelete(
      `user_blocks?campaign_slug=eq.${encodeURIComponent(campaignSlug)}` +
      `&blocker_kind=eq.${encodeURIComponent(blocker.kind)}&blocker_id=eq.${encodeURIComponent(blocker.id)}` +
      `&blocked_kind=eq.${encodeURIComponent(blockedKind)}&blocked_id=eq.${encodeURIComponent(blockedId)}`,
    );
    return { ok: true };
  } catch (err) {
    console.error("[moderation/blocks] unblockUser failed:", err);
    return { ok: false, reason: "server_error" };
  }
}

export async function getBlockedByMe(campaignSlug: string, blocker: ActorKey): Promise<UserBlockRow[]> {
  return restList<UserBlockRow>(
    `user_blocks?campaign_slug=eq.${encodeURIComponent(campaignSlug)}` +
    `&blocker_kind=eq.${encodeURIComponent(blocker.kind)}&blocker_id=eq.${encodeURIComponent(blocker.id)}&select=*`,
  );
}

export type BlockedUserDisplay = UserBlockRow & {
  // Best-effort DISPLAY info, resolved fresh at read time (not stored on
  // the block row — user_blocks has no name snapshot, unlike
  // announcement_comments' author_name, since a block is a live
  // relationship, not authored content that needs to survive independent
  // of the other party's current membership). blocked_name falls back to
  // a generic, non-identifying label if the person's row can no longer
  // be found (e.g. they left the team) — never an email or raw id, which
  // would be a private-identifier leak the UI must not show.
  blocked_name: string;
  blocked_role: string;
};

async function resolveBlockedDisplay(
  campaignSlug: string,
  kind: ActorKey["kind"],
  id: string,
): Promise<{ name: string; role: string }> {
  if (kind === "coach") {
    const row = await fetchCoachById(id, campaignSlug);
    return row ? { name: row.name, role: staffRoleLabel(row.role) } : { name: "Former team member", role: "" };
  }
  if (kind === "member") {
    const row = await fetchMemberById(id, campaignSlug);
    return row ? { name: row.name, role: memberRoleLabel(row.role) } : { name: "Former team member", role: "" };
  }
  // platform_admin: name lives on elf_accounts, not platform_admins
  // itself — same embed pattern already used for platform-admin-authored
  // comments/announcements (see lib/platform/comments.ts's
  // PLATFORM_ADMIN_INFO_SELECT).
  const rows = await restList<{ elf_accounts: { name: string } | null }>(
    `platform_admins?id=eq.${encodeURIComponent(id)}&select=elf_accounts!account_id(name)&limit=1`,
  );
  const name = rows[0]?.elf_accounts?.name;
  return name ? { name, role: platformAdminRoleLabel() } : { name: "ELF Staff", role: platformAdminRoleLabel() };
}

// Enriches getBlockedByMe()'s raw rows with the blocked person's CURRENT
// display name/role, for the "Blocked Users" management UI — getBlockedByMe
// itself is left untouched (still used wherever only the raw
// kind/id relationship matters, e.g. isThreadBlockedForActor's lookups
// elsewhere never need a name).
export async function getBlockedByMeWithDisplay(campaignSlug: string, blocker: ActorKey): Promise<BlockedUserDisplay[]> {
  const rows = await getBlockedByMe(campaignSlug, blocker);
  return Promise.all(
    rows.map(async row => {
      const { name, role } = await resolveBlockedDisplay(campaignSlug, row.blocked_kind, row.blocked_id);
      return { ...row, blocked_name: name, blocked_role: role };
    }),
  );
}

// Used ONLY by the direct-message thread-creation path (never by
// announcement/comment-visibility reads other than the optional
// blocker-side comment hide) to decide whether `blocker` has blocked
// `other`, in either direction — a block should stop either party from
// reaching the other via DM, symmetric to how blocking works on any
// consumer platform, even though only one party performed the block.
export async function isBlockedEitherDirection(
  campaignSlug: string,
  a: ActorKey,
  b: ActorKey,
): Promise<boolean> {
  const rows = await restList<{ id: string }>(
    `user_blocks?campaign_slug=eq.${encodeURIComponent(campaignSlug)}&select=id&limit=1` +
    `&or=(and(blocker_kind.eq.${encodeURIComponent(a.kind)},blocker_id.eq.${encodeURIComponent(a.id)},blocked_kind.eq.${encodeURIComponent(b.kind)},blocked_id.eq.${encodeURIComponent(b.id)}),` +
    `and(blocker_kind.eq.${encodeURIComponent(b.kind)},blocker_id.eq.${encodeURIComponent(b.id)},blocked_kind.eq.${encodeURIComponent(a.kind)},blocked_id.eq.${encodeURIComponent(a.id)}))`,
  );
  return rows.length > 0;
}
