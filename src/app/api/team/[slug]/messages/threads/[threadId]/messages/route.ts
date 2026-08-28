import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import { platformAdminRoleLabel } from "@/lib/permissions";
import {
  isParticipant,
  getThreadById,
  getThreadParticipants,
  insertMessage,
  updateThreadMeta,
  syncRequiredThreadParticipants,
  ParticipantSyncError,
  sendMessageWithAttachments,
  getResolvedMessageById,
  messagePreview,
  validateSendRequest,
  type ActorKey,
  type AttachmentKind,
} from "@/lib/messages";
import { sendPushToParticipants } from "@/lib/push";
import { getTeamIdBySlug, createNotification, buildMessageReferenceUrl } from "@/lib/notifications";
import { getAccountIdsForThreadParticipants } from "@/lib/pushRecipients";
import { dispatchApnsPush } from "@/lib/apns";

type RouteCtx = { params: Promise<{ slug: string; threadId: string }> };

export async function POST(
  req: NextRequest,
  { params }: RouteCtx,
) {
  const { slug, threadId } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind === "public") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorKey: ActorKey =
    actor.kind === "coach"          ? { kind: "coach",          id: actor.session.id } :
    actor.kind === "platform_admin" ? { kind: "platform_admin", id: actor.session.platformAdminId } :
    { kind: "member", id: actor.session.id };
  const actorName = actor.session.name;
  const actorRole = actor.kind === "platform_admin" ? platformAdminRoleLabel() : actor.session.role;

  const [thread, ok] = await Promise.all([
    getThreadById(threadId, slug),
    isParticipant(threadId, actorKey),
  ]);

  if (!thread || !ok) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const parsed = await req.json().catch(() => null);
  const msgBody: string = typeof parsed?.body === "string" ? parsed.body.trim() : "";
  const rawAttachmentIds: unknown = parsed?.attachmentIds;
  const attachmentIds: string[] = Array.isArray(rawAttachmentIds)
    ? rawAttachmentIds.filter((id): id is string => typeof id === "string")
    : [];

  // Shape validation only (length/count/required-one-of/duplicates) —
  // NOT ownership/thread/status. Those remain exclusively the RPC's job
  // (see send_message_with_attachments).
  const shapeCheck = validateSendRequest({ body: msgBody, attachmentIds });
  if (!shapeCheck.ok) {
    return NextResponse.json({ error: shapeCheck.error }, { status: 400 });
  }

  // Self-healing: a parent linked to this athlete after the thread was
  // created gets added here, before the new message is sent — additive
  // only, never removes an existing (even since-unlinked) participant.
  // If this fails, the family/oversight integrity rule is authoritative:
  // do not silently continue and send a message into a thread that's
  // missing a required parent. Fail cleanly, thread and messages
  // untouched — the reply was never inserted.
  try {
    await syncRequiredThreadParticipants(threadId, slug);
  } catch (err) {
    if (err instanceof ParticipantSyncError) {
      return NextResponse.json({ error: "Unable to send message right now. Please try again." }, { status: 500 });
    }
    throw err;
  }

  let responsePayload: unknown;
  let attachmentKindsForPreview: AttachmentKind[] = [];

  if (attachmentIds.length === 0) {
    // Text-only — exact existing path, unchanged.
    const msg = await insertMessage(threadId, actorKey, msgBody, actorName, actorRole);
    if (!msg) {
      return NextResponse.json({ error: "Failed to send message." }, { status: 500 });
    }
    responsePayload = msg;
  } else {
    // Attachment-carrying — the one narrow transactional RPC is the sole
    // authority for verifying each attachment's thread/status/uploader
    // match and claiming it atomically with the message insert. Nothing
    // here re-implements or duplicates that verification.
    const result = await sendMessageWithAttachments({
      threadId,
      actor: actorKey,
      senderName: actorName,
      senderRole: actorRole,
      body: msgBody,
      attachmentIds,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    // Return the same client-safe ResolvedMessage shape getMessagesForThread
    // already produces (attachments included) rather than inventing a
    // second response format. Falls back to the bare RPC result only if
    // this immediate re-read somehow fails — still a successful send.
    const resolved = await getResolvedMessageById(result.message.id, actorKey);
    responsePayload = resolved ?? result.message;
    attachmentKindsForPreview = resolved?.attachments.map(a => a.attachment_kind) ?? [];
  }

  // One canonical, privacy-safe preview computed once and reused for
  // both the thread's last_message_preview and the web-push body — text
  // wins whenever present (including text + attachments), the
  // attachment-kind fallback only applies to a genuinely empty body.
  // message.body itself is never touched by this: an attachment-only
  // message's stored body stays exactly empty, as designed. The in-app
  // notifications row and the native APNs alert are both already fixed,
  // generic strings regardless of content, so neither needs or gets any
  // change here. Never includes a filename.
  const preview = messagePreview(msgBody, attachmentKindsForPreview);

  void updateThreadMeta(threadId, preview);

  // Push to other participants
  void (async () => {
    try {
      const participants = await getThreadParticipants(threadId);
      const senderKey = `${actorKey.kind}:${actorKey.id}`;
      await sendPushToParticipants(slug, participants, senderKey, {
        title: `New message from ${actorName}`,
        body:  preview,
        url:   `/team/${slug}/messages/${threadId}`,
      });
    } catch {}
  })();

  // Phase 10: canonical notification row + native push, mirroring
  // threads/route.ts's notifyNewMessage exactly (kept inline here since
  // this route has no other shared-helper precedent to extend).
  void (async () => {
    try {
      const senderKey = `${actorKey.kind}:${actorKey.id}`;
      const teamId = await getTeamIdBySlug(slug);
      if (!teamId) return;
      await createNotification(teamId, {
        type: "message",
        title: "New Message",
        body: `${actorName} sent you a message`,
        reference_id: threadId,
        reference_url: buildMessageReferenceUrl(slug, threadId, senderKey),
      });
      const accountIds = await getAccountIdsForThreadParticipants(threadId, senderKey);
      await dispatchApnsPush({
        accountIds,
        category: "messages",
        kind: "message",
        ctx: { actorName },
        url: `/team/${slug}/messages/${threadId}`,
      });
    } catch (err) {
      console.error("[messages] notification/push failed:", err);
    }
  })();

  return NextResponse.json(responsePayload, { status: 201 });
}
