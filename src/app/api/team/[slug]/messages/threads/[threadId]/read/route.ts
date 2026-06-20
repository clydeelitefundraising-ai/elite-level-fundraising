import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import {
  isParticipant,
  getThreadById,
  markMessagesReadForActor,
  type ActorKey,
} from "@/lib/messages";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

type RouteCtx = { params: Promise<{ slug: string; threadId: string }> };

export async function POST(
  _req: NextRequest,
  { params }: RouteCtx,
) {
  const { slug, threadId } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind === "public") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorKey: ActorKey =
    actor.kind === "coach"
      ? { kind: "coach",  id: actor.session.id }
      : { kind: "member", id: actor.session.id };

  const [thread, ok] = await Promise.all([
    getThreadById(threadId, slug),
    isParticipant(threadId, actorKey),
  ]);
  if (!thread || !ok) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // Fetch all message IDs in this thread excluding own messages
  const fk = actorKey.kind === "coach" ? "sender_coach_id" : "sender_member_id";
  const msgRes = await fetch(
    `${BASE}/rest/v1/messages?thread_id=eq.${encodeURIComponent(threadId)}&${fk}=neq.${encodeURIComponent(actorKey.id)}&select=id`,
    { headers: h(), cache: "no-store" },
  );
  const msgs: { id: string }[] = msgRes.ok ? await msgRes.json() : [];
  const ids = msgs.map(m => m.id);

  await markMessagesReadForActor(ids, actorKey);
  return NextResponse.json({ ok: true });
}
