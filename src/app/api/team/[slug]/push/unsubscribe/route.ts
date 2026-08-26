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
  // WHERE-filter only, not an insert — no FK/CHECK risk. A platform admin
  // has no push_subscriptions row under either column, so falling into the
  // coach_id branch with their platformAdminId is a harmless no-op delete.
  const ownerFilter = actor.kind === "member"
    ? `member_id=eq.${encodeURIComponent(actor.session.id)}`
    : `coach_id=eq.${encodeURIComponent(actor.kind === "coach" ? actor.session.id : actor.session.platformAdminId)}`;

  await fetch(
    `${BASE}/rest/v1/push_subscriptions?campaign_slug=eq.${encodeURIComponent(slug)}&endpoint=eq.${encodeURIComponent(endpoint)}&${ownerFilter}`,
    {
      method: "DELETE",
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    },
  );

  return NextResponse.json({ ok: true });
}
