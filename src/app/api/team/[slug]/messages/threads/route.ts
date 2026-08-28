import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import { platformAdminRoleLabel } from "@/lib/permissions";
import {
  getThreadsForActor,
  insertMessage,
  updateThreadMeta,
  getThreadParticipants,
  resolveOrCreateThreadForRecipient,
  type ActorKey,
} from "@/lib/messages";
import { sendPushToParticipants } from "@/lib/push";
import { getTeamIdBySlug, createNotification, buildMessageReferenceUrl } from "@/lib/notifications";
import { getAccountIdsForThreadParticipants } from "@/lib/pushRecipients";
import { dispatchApnsPush } from "@/lib/apns";

// Phase 10: canonical notification row + native push for a new message —
// shared by both the reused-thread and brand-new-thread paths below, so
// the exact same logic (and its non-blocking guarantee) never drifts
// between the two. reference_url smuggles the sender's actor key (see
// notifications.ts's filterMessageNotifications) since `notifications` has
// no dedicated sender column and this phase adds no migration.
function notifyNewMessage(slug: string, threadId: string, senderKey: string, senderName: string) {
  void (async () => {
    try {
      const teamId = await getTeamIdBySlug(slug);
      if (!teamId) return;
      await createNotification(teamId, {
        type: "message",
        title: "New Message",
        body: `${senderName} sent you a message`,
        reference_id: threadId,
        reference_url: buildMessageReferenceUrl(slug, threadId, senderKey),
      });
      const accountIds = await getAccountIdsForThreadParticipants(threadId, senderKey);
      await dispatchApnsPush({
        accountIds,
        category: "messages",
        kind: "message",
        ctx: { actorName: senderName },
        url: `/team/${slug}/messages/${threadId}`,
      });
    } catch (err) {
      console.error("[messages] notification/push failed:", err);
    }
  })();
}

type RouteCtx = { params: Promise<{ slug: string }> };

export async function GET(
  _req: NextRequest,
  { params }: RouteCtx,
) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind === "public") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorKey: ActorKey =
    actor.kind === "coach"          ? { kind: "coach",          id: actor.session.id } :
    actor.kind === "platform_admin" ? { kind: "platform_admin", id: actor.session.platformAdminId } :
    { kind: "member", id: actor.session.id };

  const threads = await getThreadsForActor(slug, actorKey);
  return NextResponse.json(threads);
}

export async function POST(
  req: NextRequest,
  { params }: RouteCtx,
) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind === "public") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  // subject is intentionally no longer accepted — new conversations are
  // always subjectless (Phase 2B); the column stays nullable, historical
  // threads with a subject are untouched.
  const { recipient_actor_type, recipient_id, body: msgBody } = body ?? {};

  if (!msgBody?.trim()) {
    return NextResponse.json({ error: "body required" }, { status: 400 });
  }
  if (!recipient_actor_type || !recipient_id) {
    return NextResponse.json({ error: "recipient required" }, { status: 400 });
  }

  const actorKey: ActorKey =
    actor.kind === "coach"          ? { kind: "coach",          id: actor.session.id } :
    actor.kind === "platform_admin" ? { kind: "platform_admin", id: actor.session.platformAdminId } :
    { kind: "member", id: actor.session.id };
  const actorName = actor.session.name;
  const actorRole = actor.kind === "platform_admin" ? platformAdminRoleLabel() : actor.session.role;
  // A platform admin carries head-coach-equivalent authority under their
  // own identity — their threads don't need Head Coach oversight added any
  // more than a real head coach's own threads do.
  const actorIsHeadCoach =
    (actor.kind === "coach" && actor.session.role === "head_coach") ||
    actor.kind === "platform_admin";

  // Phase 2: recipient validation, family auto-inclusion, Head Coach
  // oversight, canonical-thread reuse, and participant sync/top-up all
  // live in this one shared helper now — see src/lib/messages.ts. This
  // route never inserts a message itself; it always inserts exactly one,
  // right below, into whichever thread the helper resolved or created.
  const outcome = await resolveOrCreateThreadForRecipient({
    slug,
    actor: actorKey,
    actorName,
    actorRole,
    actorIsHeadCoach,
    recipientActorType: recipient_actor_type,
    recipientId: recipient_id,
    initialPreview: msgBody.trim().slice(0, 80),
  });

  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  }
  const { thread, reused } = outcome;

  const msg = await insertMessage(thread.id, actorKey, msgBody.trim(), actorName, actorRole);
  if (!msg) {
    return NextResponse.json(
      { error: reused ? "Failed to send message." : "Thread created but message failed." },
      { status: 500 },
    );
  }

  // The reuse path's thread row may predate this message and carry a
  // stale preview — re-assert it. The create path already set the
  // correct preview atomically at creation time (see initialPreview
  // above), so it deliberately skips this, exactly as before this
  // extraction.
  if (reused) {
    void updateThreadMeta(thread.id, msgBody.trim());
  }

  const senderKey = `${actorKey.kind}:${actorKey.id}`;
  void (async () => {
    try {
      const currentParticipants = await getThreadParticipants(thread.id);
      await sendPushToParticipants(slug, currentParticipants, senderKey, {
        title: `New message from ${actorName}`,
        body:  msgBody.trim().slice(0, 100),
        url:   `/team/${slug}/messages/${thread.id}`,
      });
    } catch {}
  })();
  notifyNewMessage(slug, thread.id, senderKey, actorName);

  return NextResponse.json(
    { thread_id: thread.id, ...thread, ...(reused ? { reused: true } : {}) },
    { status: reused ? 200 : 201 },
  );
}
