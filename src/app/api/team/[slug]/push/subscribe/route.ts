import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  // Reject unauthenticated subscribers
  const actor = await getTeamActor(slug);
  if (actor.kind === "public") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const { endpoint, keys } = body ?? {};

  if (
    typeof endpoint !== "string" ||
    !endpoint.startsWith("https://") ||
    typeof keys?.p256dh !== "string" ||
    typeof keys?.auth !== "string"
  ) {
    return NextResponse.json({ error: "Invalid subscription data." }, { status: 400 });
  }

  // Link subscription to member (for role-targeted scope pushes) or coach (for DM pushes).
  const memberId = actor.kind === "member" ? actor.session.id : null;
  const coachId  = actor.kind === "coach"  ? actor.session.id : null;

  // Phase 24.4: explicit on_conflict target. Without it, PostgREST's
  // upsert falls back to the primary key (`id`, server-generated fresh on
  // every insert) — so resubscribing the same browser endpoint was always
  // a plain insert, never an update, silently accumulating duplicate rows.
  // `endpoint` is the real identity of a web-push subscription (each
  // browser/service-worker registration gets a unique push endpoint URL
  // from the browser vendor), so it's the correct conflict target — see
  // supabase/migrations/phase_24_4_push_subscriptions_endpoint_unique.sql
  // for the backing UNIQUE index this depends on.
  const res = await fetch(`${BASE}/rest/v1/push_subscriptions?on_conflict=endpoint`, {
    method: "POST",
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      campaign_slug: slug,
      platform:      "web",
      endpoint,
      p256dh:        keys.p256dh,
      auth_key:      keys.auth,
      member_id:     memberId,
      coach_id:      coachId,
    }),
  });

  if (!res.ok) {
    const msg = await res.text();
    return NextResponse.json({ error: `DB error: ${msg}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
