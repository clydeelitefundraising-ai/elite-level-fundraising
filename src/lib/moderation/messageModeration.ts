// Phase A40: moderator removal of messages and attachments.
//
// Same convention as reports.ts/blocks.ts: this module has no session/
// role knowledge of its own and never checks permissions — the caller
// (API route) resolves isHeadCoach()/platform-admin status server-side
// and only calls these functions once that check has already passed. A
// member or non-head-coach cannot reach this code at all.
//
// campaignSlug is always independently verified against the message's/
// attachment's own thread (message_threads.campaign_slug) rather than
// trusted from the caller — this is what stops a Head Coach of Team A
// from removing content that actually belongs to Team B, even if they
// somehow obtained a valid-looking message/attachment id for it. A
// Platform Admin may legitimately pass any campaign's slug (their
// session isn't team-locked); a real coach's campaignSlug always comes
// from getTeamActor(slug), which is itself locked to their own team.
import { restList, restUpdate } from "../platform/_client.ts";
import { MESSAGE_ATTACHMENTS_BUCKET } from "../messages.ts";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function deleteStorageObjects(bucket: string, paths: string[]): Promise<void> {
  if (!paths.length) return;
  try {
    const res = await fetch(`${BASE}/storage/v1/object/${bucket}`, {
      method: "DELETE",
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: paths }),
    });
    if (!res.ok) console.error("[messageModeration] storage cleanup failed", bucket, res.status);
  } catch (err) {
    console.error("[messageModeration] storage cleanup threw", bucket, err);
  }
}

async function campaignSlugForThread(threadId: string): Promise<string | null> {
  const rows = await restList<{ campaign_slug: string }>(
    `message_threads?id=eq.${encodeURIComponent(threadId)}&select=campaign_slug&limit=1`,
  );
  return rows[0]?.campaign_slug ?? null;
}

// Platform Admin routes have no :slug segment (their session isn't
// team-locked) — these resolve the REAL campaign a message/attachment
// belongs to, server-side, so the platform-admin route can then call
// removeMessage()/removeAttachment() with the correct scope rather than
// trusting anything client-supplied for it.
export async function resolveCampaignSlugForMessage(messageId: string): Promise<string | null> {
  const rows = await restList<{ thread_id: string }>(
    `messages?id=eq.${encodeURIComponent(messageId)}&select=thread_id&limit=1`,
  );
  const threadId = rows[0]?.thread_id;
  return threadId ? campaignSlugForThread(threadId) : null;
}

export async function resolveCampaignSlugForAttachment(attachmentId: string): Promise<string | null> {
  const rows = await restList<{ thread_id: string }>(
    `message_attachments?id=eq.${encodeURIComponent(attachmentId)}&select=thread_id&limit=1`,
  );
  const threadId = rows[0]?.thread_id;
  return threadId ? campaignSlugForThread(threadId) : null;
}

export type RemoveMessageResult =
  | { ok: true; attachmentsRemoved: number }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "server_error" };

export async function removeMessage(messageId: string, campaignSlug: string): Promise<RemoveMessageResult> {
  const rows = await restList<{ id: string; thread_id: string; deleted_at: string | null }>(
    `messages?id=eq.${encodeURIComponent(messageId)}&select=id,thread_id,deleted_at&limit=1`,
  );
  const message = rows[0];
  if (!message) return { ok: false, reason: "not_found" };

  const actualSlug = await campaignSlugForThread(message.thread_id);
  if (actualSlug !== campaignSlug) return { ok: false, reason: "not_found" };

  // Already removed — idempotent success, no double-processing, no error.
  if (message.deleted_at) return { ok: true, attachmentsRemoved: 0 };

  try {
    // Conditional UPDATE (WHERE deleted_at IS NULL) — same claim-before-
    // mutate race-safety pattern already used by comments.ts's decide().
    await restUpdate(
      `messages?id=eq.${encodeURIComponent(messageId)}&deleted_at=is.null`,
      { body: "", deleted_at: new Date().toISOString() },
    );

    const attachments = await restList<{ id: string; storage_path: string }>(
      `message_attachments?message_id=eq.${encodeURIComponent(messageId)}&removed_at=is.null&select=id,storage_path`,
    );
    if (attachments.length > 0) {
      await restUpdate(
        `message_attachments?message_id=eq.${encodeURIComponent(messageId)}&removed_at=is.null`,
        { removed_at: new Date().toISOString() },
      );
      await deleteStorageObjects(MESSAGE_ATTACHMENTS_BUCKET, attachments.map(a => a.storage_path));
    }

    return { ok: true, attachmentsRemoved: attachments.length };
  } catch (err) {
    console.error("[messageModeration] removeMessage failed:", err);
    return { ok: false, reason: "server_error" };
  }
}

export type RemoveAttachmentResult =
  | { ok: true }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "server_error" };

// Independent attachment removal — used when only the ATTACHMENT was
// reported/objectionable and the message's text body should stay intact.
export async function removeAttachment(attachmentId: string, campaignSlug: string): Promise<RemoveAttachmentResult> {
  const rows = await restList<{ id: string; thread_id: string; storage_path: string; removed_at: string | null }>(
    `message_attachments?id=eq.${encodeURIComponent(attachmentId)}&select=id,thread_id,storage_path,removed_at&limit=1`,
  );
  const attachment = rows[0];
  if (!attachment) return { ok: false, reason: "not_found" };

  const actualSlug = await campaignSlugForThread(attachment.thread_id);
  if (actualSlug !== campaignSlug) return { ok: false, reason: "not_found" };

  if (attachment.removed_at) return { ok: true };

  try {
    await restUpdate(
      `message_attachments?id=eq.${encodeURIComponent(attachmentId)}&removed_at=is.null`,
      { removed_at: new Date().toISOString() },
    );
    await deleteStorageObjects(MESSAGE_ATTACHMENTS_BUCKET, [attachment.storage_path]);
    return { ok: true };
  } catch (err) {
    console.error("[messageModeration] removeAttachment failed:", err);
    return { ok: false, reason: "server_error" };
  }
}
