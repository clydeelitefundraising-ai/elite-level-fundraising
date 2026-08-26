import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import { platformAdminRoleLabel } from "@/lib/permissions";
import {
  getThreadsForActor,
  insertParticipants,
  insertMessage,
  updateThreadMeta,
  getThreadParticipants,
  fetchMemberById,
  fetchCoachById,
  resolveRequiredFamilyParticipants,
  syncRequiredThreadParticipants,
  findCanonicalExistingThread,
  ensureHeadCoachOversight,
  fetchHeadCoaches,
  type ParticipantInsert,
  type ParticipantRef,
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

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
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

  // Members (athlete/parent/booster) can only initiate threads with coaches.
  if (actor.kind === "member" && recipient_actor_type !== "coach") {
    return NextResponse.json(
      { error: "Members can only start conversations with coaches." },
      { status: 403 },
    );
  }

  const actorKey: ActorKey =
    actor.kind === "coach"          ? { kind: "coach",          id: actor.session.id } :
    actor.kind === "platform_admin" ? { kind: "platform_admin", id: actor.session.platformAdminId } :
    { kind: "member", id: actor.session.id };
  const actorName = actor.session.name;
  const actorRole = actor.kind === "platform_admin" ? platformAdminRoleLabel() : actor.session.role;

  // Validate recipient exists in this campaign.
  const recipientCoach = recipient_actor_type === "coach"
    ? await fetchCoachById(recipient_id, slug)
    : null;
  const recipientMember = recipient_actor_type === "member"
    ? await fetchMemberById(recipient_id, slug)
    : null;
  if (!recipientCoach && !recipientMember) {
    return NextResponse.json({ error: "Recipient not found." }, { status: 404 });
  }

  // Build participant list (deduped by actor key)
  const seen = new Set<string>();
  const participants: Omit<ParticipantInsert, "thread_id">[] = [];

  function addParticipant(
    actor_type: "coach" | "member" | "platform_admin",
    id: string,
    is_auto_included: boolean,
    is_observer: boolean,
  ) {
    const key = `${actor_type}:${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    participants.push({
      actor_type,
      coach_id:          actor_type === "coach"          ? id : null,
      member_id:         actor_type === "member"         ? id : null,
      platform_admin_id: actor_type === "platform_admin" ? id : null,
      is_auto_included,
      is_observer,
    });
  }

  // Creator
  addParticipant(actorKey.kind, actorKey.id, false, false);

  // Explicit recipient
  addParticipant(
    recipient_actor_type as "coach" | "member",
    recipient_id,
    false,
    false,
  );

  // Family auto-include (athlete ↔ parent) — canonical, symmetric in both
  // directions. Seeds from whichever side(s) of this thread are members:
  // the actor (covers athlete→coach, parent→coach) and the explicit
  // recipient (covers coach→athlete, coach→parent). The thread initiator
  // never determines whether assigned parents are included — both
  // directions resolve through the same canonical team_members/athlete_id
  // relationship, never inferred from name/email.
  const familySeedIds: string[] = [];
  if (actorKey.kind === "member") familySeedIds.push(actorKey.id);
  if (recipientMember) familySeedIds.push(recipientMember.id);
  const familyParticipants = await resolveRequiredFamilyParticipants(familySeedIds, slug);
  for (const fp of familyParticipants) {
    if (fp.member_id) addParticipant("member", fp.member_id, true, false);
  }

  // Head coach oversight condition: add if thread has athlete/parent OR
  // actor is not head coach. Computed once, used by both the reuse path
  // (top-up on an existing thread) and the fresh-create path below — same
  // rule either way, so reuse never leaves weaker oversight than a brand
  // new thread would have gotten.
  const hasAthleteOrParent = participants.some(p => {
    if (p.actor_type !== "member") return false;
    const id = p.member_id!;
    return id === recipient_id
      ? ["athlete", "parent"].includes(recipientMember?.role ?? "")
      : true;
  });
  // A platform admin carries head-coach-equivalent authority under their
  // own identity — their threads don't need Head Coach oversight added any
  // more than a real head coach's own threads do.
  const actorIsHeadCoach =
    (actor.kind === "coach" && actor.session.role === "head_coach") ||
    actor.kind === "platform_admin";
  const needsOversight = hasAthleteOrParent || !actorIsHeadCoach;
  const headCoaches = needsOversight ? await fetchHeadCoaches(slug) : [];

  // Canonical conversation reuse (Phase 2B): `participants` at this point
  // is exactly the desired NON-OBSERVER set (creator + explicit recipient
  // + resolved family) — oversight hasn't been added yet, so observers
  // are excluded from the identity check by construction, not by a filter.
  const desiredNonObserver: ParticipantRef[] = participants.map(p => ({
    actor_type: p.actor_type, coach_id: p.coach_id, member_id: p.member_id, platform_admin_id: p.platform_admin_id,
  }));
  const existingThread = await findCanonicalExistingThread(slug, actorKey, desiredNonObserver);

  if (existingThread) {
    // Reuse: sync family (defensive — the match already requires an exact
    // current-state match, but cheap and correct to re-assert) and top up
    // any missing oversight, then send through the exact same downstream
    // path a reply would use — same push, same unread mechanics, same
    // Phase 2A guarantees. No new thread row, no participant duplication.
    try {
      await syncRequiredThreadParticipants(existingThread.id, slug);
      if (headCoaches.length) {
        await ensureHeadCoachOversight(existingThread.id, headCoaches.map(hc => hc.id));
      }
    } catch {
      return NextResponse.json({ error: "Unable to send message right now. Please try again." }, { status: 500 });
    }

    const msg = await insertMessage(existingThread.id, actorKey, msgBody.trim(), actorName, actorRole);
    if (!msg) {
      return NextResponse.json({ error: "Failed to send message." }, { status: 500 });
    }
    void updateThreadMeta(existingThread.id, msgBody.trim());

    void (async () => {
      try {
        const currentParticipants = await getThreadParticipants(existingThread.id);
        const senderKey = `${actorKey.kind}:${actorKey.id}`;
        await sendPushToParticipants(slug, currentParticipants, senderKey, {
          title: `New message from ${actorName}`,
          body:  msgBody.trim().slice(0, 100),
          url:   `/team/${slug}/messages/${existingThread.id}`,
        });
      } catch {}
    })();
    notifyNewMessage(slug, existingThread.id, `${actorKey.kind}:${actorKey.id}`, actorName);

    return NextResponse.json({ thread_id: existingThread.id, ...existingThread, reused: true }, { status: 200 });
  }

  for (const hc of headCoaches) addParticipant("coach", hc.id, true, true);

  // Create thread — always subjectless going forward (see body destructure
  // above). Historical threads with a subject are never touched by this.
  const threadRes = await fetch(`${BASE}/rest/v1/message_threads`, {
    method:  "POST",
    headers: h({ Prefer: "return=representation" }),
    body:    JSON.stringify({
      campaign_slug:                 slug,
      subject:                       null,
      created_by_type:               actorKey.kind,
      created_by_coach_id:           actorKey.kind === "coach"          ? actorKey.id : null,
      created_by_member_id:          actorKey.kind === "member"         ? actorKey.id : null,
      created_by_platform_admin_id:  actorKey.kind === "platform_admin" ? actorKey.id : null,
      // Durable snapshot (Phase 3C) — resolved server-side from the
      // session, never from client input.
      creator_name:         actorName,
      creator_role:         actorRole,
      last_message_preview: msgBody.trim().slice(0, 80),
    }),
  });
  if (!threadRes.ok) {
    return NextResponse.json({ error: "Failed to create thread." }, { status: 500 });
  }
  const [thread] = await threadRes.json();

  // Insert participants. Must not silently create a thread that omits
  // required parents/oversight — fail cleanly instead of continuing to
  // insert the first message. (No compensating delete of the already-
  // created thread row here — this codebase has no distributed
  // transactions anywhere; this failure mode is rare, and an empty,
  // never-messaged thread with the wrong participants is an acceptable
  // residual artifact compared to the alternative of silently presenting
  // an incorrectly-participated conversation as if it succeeded.)
  const ptInserts: ParticipantInsert[] = participants.map(p => ({
    ...p,
    thread_id: thread.id,
  }));
  try {
    await insertParticipants(ptInserts);
  } catch {
    return NextResponse.json({ error: "Failed to set up conversation participants. Please try again." }, { status: 500 });
  }

  // Insert first message
  const msg = await insertMessage(thread.id, actorKey, msgBody.trim(), actorName, actorRole);
  if (!msg) {
    return NextResponse.json({ error: "Thread created but message failed." }, { status: 500 });
  }

  // Push (fire-and-forget)
  const senderKey = `${actorKey.kind}:${actorKey.id}`;
  void (async () => {
    try {
      await sendPushToParticipants(slug, ptInserts, senderKey, {
        title: `New message from ${actorName}`,
        body:  msgBody.trim().slice(0, 100),
        url:   `/team/${slug}/messages/${thread.id}`,
      });
    } catch {}
  })();
  notifyNewMessage(slug, thread.id, senderKey, actorName);

  return NextResponse.json({ thread_id: thread.id, ...thread }, { status: 201 });
}
