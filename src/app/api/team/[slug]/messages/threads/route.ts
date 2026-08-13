import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import {
  getThreadsForActor,
  insertParticipants,
  insertMessage,
  fetchMemberById,
  fetchCoachById,
  resolveRequiredFamilyParticipants,
  fetchHeadCoaches,
  type ParticipantInsert,
  type ActorKey,
} from "@/lib/messages";
import { sendPushToParticipants } from "@/lib/push";

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
    actor.kind === "coach"
      ? { kind: "coach",  id: actor.session.id }
      : { kind: "member", id: actor.session.id };

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
  const { recipient_actor_type, recipient_id, subject, body: msgBody } = body ?? {};

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
    actor.kind === "coach"
      ? { kind: "coach",  id: actor.session.id }
      : { kind: "member", id: actor.session.id };

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
    actor_type: "coach" | "member",
    id: string,
    is_auto_included: boolean,
    is_observer: boolean,
  ) {
    const key = `${actor_type}:${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    participants.push({
      actor_type,
      coach_id:   actor_type === "coach"  ? id : null,
      member_id:  actor_type === "member" ? id : null,
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

  // Head coach oversight: add if thread has athlete/parent OR actor is not head coach.
  const hasAthleteOrParent = participants.some(p => {
    if (p.actor_type !== "member") return false;
    const id = p.member_id!;
    return id === recipient_id
      ? ["athlete", "parent"].includes(recipientMember?.role ?? "")
      : true;
  });
  const actorIsHeadCoach = actor.kind === "coach" && actor.session.role === "head_coach";

  if (hasAthleteOrParent || !actorIsHeadCoach) {
    const headCoaches = await fetchHeadCoaches(slug);
    for (const hc of headCoaches) addParticipant("coach", hc.id, true, true);
  }

  // Create thread
  const threadRes = await fetch(`${BASE}/rest/v1/message_threads`, {
    method:  "POST",
    headers: h({ Prefer: "return=representation" }),
    body:    JSON.stringify({
      campaign_slug:        slug,
      subject:              subject?.trim() || null,
      created_by_type:      actorKey.kind,
      created_by_coach_id:  actorKey.kind === "coach"  ? actorKey.id : null,
      created_by_member_id: actorKey.kind === "member" ? actorKey.id : null,
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
  const msg = await insertMessage(thread.id, actorKey, msgBody.trim());
  if (!msg) {
    return NextResponse.json({ error: "Thread created but message failed." }, { status: 500 });
  }

  // Push (fire-and-forget)
  const senderKey = `${actorKey.kind}:${actorKey.id}`;
  void (async () => {
    try {
      await sendPushToParticipants(slug, ptInserts, senderKey, {
        title: `New message from ${actor.session.name}`,
        body:  msgBody.trim().slice(0, 100),
        url:   `/team/${slug}/messages/${thread.id}`,
      });
    } catch {}
  })();

  return NextResponse.json({ thread_id: thread.id, ...thread }, { status: 201 });
}
