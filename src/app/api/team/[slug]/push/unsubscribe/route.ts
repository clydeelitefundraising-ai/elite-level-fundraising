import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  // Reject unauthenticated callers — mirrors subscribe/route.ts.
  const actor = await getTeamActor(slug);
  if (actor.kind === "public") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const { endpoint } = body ?? {};

  if (typeof endpoint !== "string") {
    return NextResponse.json({ error: "endpoint required." }, { status: 400 });
  }

  // Scope the delete to a subscription row owned by this actor — matches
  // subscribe/route.ts's insert, which links every row to either the
  // subscribing member or coach. Without this, any authenticated user on
  // the team could unsubscribe any other user's device by endpoint alone.
  const ownerFilter = actor.kind === "member"
    ? `member_id=eq.${encodeURIComponent(actor.session.id)}`
    : `coach_id=eq.${encodeURIComponent(actor.session.id)}`;

  await fetch(
    `${BASE}/rest/v1/push_subscriptions?campaign_slug=eq.${encodeURIComponent(slug)}&endpoint=eq.${encodeURIComponent(endpoint)}&${ownerFilter}`,
    {
      method: "DELETE",
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    },
  );

  return NextResponse.json({ ok: true });
}
