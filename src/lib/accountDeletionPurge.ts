// Phase A38 (revision): personal UGC purge, run as part of self-service
// account deletion — see accountDeletion.ts for the caller and the
// head-coach/platform-admin/last-admin protections that gate this.
//
// APPLE-FACING DATA DECISION (documented once, here, since every function
// below implements it): this module deletes INTERPERSONAL, PERSONALLY-
// AUTHORED content (comments, direct messages + their attachments, likes,
// blocks) and ANONYMIZES the deleting user's own filed reports (kept for
// moderation/audit continuity, per Apple's own reporting requirement —
// destroying evidence a moderator may still be acting on would undermine
// the very safeguard Apple asked for). It does NOT touch announcements.
//
// Why announcements are NOT deleted (Option A vs B, decided): an
// announcement can only ever be authored by team STAFF (coach or
// platform admin) acting in an official coaching/administrative capacity
// — never by an ordinary member (confirmed: announcements has no
// author_member_id column at all, staff-only creation is enforced at the
// API route). It is the operational record of record for schedule,
// safety, and logistics information that OTHER users still depend on
// after this person leaves the team — deleting it out from under a team
// because one coach later deletes their personal login would actively
// harm the athletes/parents who received and relied on it, and Apple's
// own guidance ("data not legally/operationally required... including
// UGC shared with others") is about personal social content, not an
// organization's own operational records. This is treated the same way
// employer/organization-authored records are generally treated under
// consumer privacy regimes: retained by the organization (the team),
// with the departing person's PERSONAL identifiers minimized — which is
// already true here without any extra work, since announcements.coach_id
// already SET NULLs on account deletion via the existing FK chain
// (elf_accounts delete -> team_coaches.account_id SET NULL — the
// team_coaches ROW and its id, which announcements.coach_id references,
// is untouched), and author_name/author_role are a durable snapshot
// independent of the live account, exactly like every other
// already-shipped author-snapshot in this codebase.
import { restList, restDelete, restUpdate } from "./platform/_client.ts";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const MESSAGE_ATTACHMENTS_BUCKET = "message-attachments";
const PROFILE_PHOTOS_BUCKET = "profile-photos";

function storageHeaders() {
  return { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
}

async function deleteStorageObjects(bucket: string, paths: string[]): Promise<void> {
  if (!paths.length) return;
  try {
    const res = await fetch(`${BASE}/storage/v1/object/${bucket}`, {
      method: "DELETE",
      headers: storageHeaders(),
      body: JSON.stringify({ prefixes: paths }),
    });
    if (!res.ok) console.error("[accountDeletionPurge] storage cleanup failed", bucket, res.status);
  } catch (err) {
    console.error("[accountDeletionPurge] storage cleanup threw", bucket, err);
  }
}

export type Identity = { kind: "coach" | "member" | "platform_admin"; id: string };

export type PurgeSummary = {
  commentsDeleted:    number;
  messagesDeleted:    number;
  attachmentsDeleted: number;
  likesDeleted:       number;
  blocksDeleted:      number;
  reportsAnonymized:  number;
};

const AUTHOR_COL: Record<Identity["kind"], string> = {
  coach: "author_coach_id", member: "author_member_id", platform_admin: "author_platform_admin_id",
};
const SENDER_COL: Record<Identity["kind"], string> = {
  coach: "sender_coach_id", member: "sender_member_id", platform_admin: "sender_platform_admin_id",
};
const UPLOADER_COL: Record<Identity["kind"], string> = {
  coach: "uploader_coach_id", member: "uploader_member_id", platform_admin: "uploader_platform_admin_id",
};

// Every team_coaches / team_members / platform_admins row this login
// controls, across every campaign — a single account can be a coach on
// one team and a parent on another (Phase 5 investigation, accountDeletion.ts).
export async function collectIdentities(accountId: string): Promise<Identity[]> {
  const [coaches, members, admins] = await Promise.all([
    restList<{ id: string }>(`team_coaches?account_id=eq.${encodeURIComponent(accountId)}&select=id`),
    restList<{ id: string }>(`team_members?account_id=eq.${encodeURIComponent(accountId)}&select=id`),
    restList<{ id: string }>(`platform_admins?account_id=eq.${encodeURIComponent(accountId)}&select=id`),
  ]);
  return [
    ...coaches.map(c => ({ kind: "coach" as const, id: c.id })),
    ...members.map(m => ({ kind: "member" as const, id: m.id })),
    ...admins.map(a => ({ kind: "platform_admin" as const, id: a.id })),
  ];
}

async function purgeComments(identity: Identity): Promise<number> {
  const deleted = await restDelete<{ id: string }>(
    `announcement_comments?${AUTHOR_COL[identity.kind]}=eq.${encodeURIComponent(identity.id)}`,
  );
  return deleted.length;
}

async function purgeMessagesAndAttachments(identity: Identity): Promise<{ messages: number; attachments: number }> {
  // Attachments this identity uploaded (message-send always uploads under
  // the sender's own identity in this app — see uploadMessageAttachments.ts
  // — so uploader match alone covers every attachment tied to their
  // messages, pending or attached, with no separate message_id join
  // needed).
  const attachmentRows = await restList<{ id: string; storage_path: string }>(
    `message_attachments?${UPLOADER_COL[identity.kind]}=eq.${encodeURIComponent(identity.id)}&select=id,storage_path`,
  );
  if (attachmentRows.length > 0) {
    await restDelete(`message_attachments?${UPLOADER_COL[identity.kind]}=eq.${encodeURIComponent(identity.id)}`);
    await deleteStorageObjects(MESSAGE_ATTACHMENTS_BUCKET, attachmentRows.map(a => a.storage_path));
  }

  const deletedMessages = await restDelete<{ id: string }>(
    `messages?${SENDER_COL[identity.kind]}=eq.${encodeURIComponent(identity.id)}`,
  );
  return { messages: deletedMessages.length, attachments: attachmentRows.length };
}

async function purgeLikes(identity: Identity): Promise<number> {
  const deleted = await restDelete<{ id: string }>(
    `post_likes?${AUTHOR_COL[identity.kind]}=eq.${encodeURIComponent(identity.id)}`,
  );
  return deleted.length;
}

async function purgeBlocks(identity: Identity): Promise<number> {
  // Purely personal interaction records — no moderation/audit value in
  // either direction, unlike content_reports below.
  const asBlocker = await restDelete<{ id: string }>(
    `user_blocks?blocker_kind=eq.${encodeURIComponent(identity.kind)}&blocker_id=eq.${encodeURIComponent(identity.id)}`,
  );
  const asBlocked = await restDelete<{ id: string }>(
    `user_blocks?blocked_kind=eq.${encodeURIComponent(identity.kind)}&blocked_id=eq.${encodeURIComponent(identity.id)}`,
  );
  return asBlocker.length + asBlocked.length;
}

// Reports this identity FILED are anonymized, not destroyed — the report
// may still be open/under review, and the underlying safety concern
// doesn't disappear just because the reporter's login does. target-side
// reports (this identity being REPORTED by someone else) are untouched
// entirely — that is the other party's evidence, never this account's own
// data to remove.
async function anonymizeFiledReports(identity: Identity): Promise<number> {
  const updated = await restUpdate<{ id: string }>(
    `content_reports?reporter_kind=eq.${encodeURIComponent(identity.kind)}&reporter_id=eq.${encodeURIComponent(identity.id)}`,
    { reporter_name: "Deleted user" },
  );
  return updated.length;
}

// Deletes the account's own profile photo object (if any) and clears the
// mirrored copy on any linked athlete row — same two effects
// /api/account/profile/photo's DELETE handler already produces for a
// live user removing their own photo; replicated here (not imported,
// since that file is a route handler, not a lib) because both must
// happen unconditionally as part of deletion, not as a separate user
// action.
async function purgeProfilePhoto(accountId: string): Promise<void> {
  const rows = await restList<{ profile_photo_url: string | null }>(
    `elf_accounts?id=eq.${encodeURIComponent(accountId)}&select=profile_photo_url&limit=1`,
  );
  const url = rows[0]?.profile_photo_url;
  if (url) {
    const marker = `/storage/v1/object/public/${PROFILE_PHOTOS_BUCKET}/`;
    const idx = url.indexOf(marker);
    if (idx >= 0) {
      const path = url.slice(idx + marker.length);
      await deleteStorageObjects(PROFILE_PHOTOS_BUCKET, [path]);
    }
  }

  const linkedAthletes = await restList<{ athlete_id: string }>(
    `team_members?account_id=eq.${encodeURIComponent(accountId)}&athlete_id=not.is.null&select=athlete_id`,
  );
  await Promise.all(
    linkedAthletes.map(m => restUpdate(`athletes?id=eq.${encodeURIComponent(m.athlete_id)}`, { profile_photo: null })),
  );
}

// Runs BEFORE the elf_accounts row itself is deleted (accountDeletion.ts
// calls this first) — every query here still needs the account row and
// its identities to resolve who "this account's content" even is.
export async function purgePersonalUgc(accountId: string, identities: Identity[]): Promise<PurgeSummary> {
  const summary: PurgeSummary = {
    commentsDeleted: 0, messagesDeleted: 0, attachmentsDeleted: 0,
    likesDeleted: 0, blocksDeleted: 0, reportsAnonymized: 0,
  };

  for (const identity of identities) {
    summary.commentsDeleted += await purgeComments(identity);
    const { messages, attachments } = await purgeMessagesAndAttachments(identity);
    summary.messagesDeleted += messages;
    summary.attachmentsDeleted += attachments;
    summary.likesDeleted += await purgeLikes(identity);
    summary.blocksDeleted += await purgeBlocks(identity);
    summary.reportsAnonymized += await anonymizeFiledReports(identity);
  }

  await purgeProfilePhoto(accountId);

  return summary;
}
