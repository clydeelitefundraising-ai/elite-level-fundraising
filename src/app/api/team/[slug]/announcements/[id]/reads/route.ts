import { NextRequest, NextResponse } from "next/server";
import { getTeamActor, isStaff } from "@/lib/permissions.server";
import { getTeamIdBySlug, getReadReceipts } from "@/lib/notifications";
import type { RecipientScope } from "@/lib/notifications";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

type RouteContext = { params: Promise<{ slug: string; id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { slug, id } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind === "public" || !isStaff(actor)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find the notification that was created for this announcement
  const notifRes = await fetch(
    `${BASE}/rest/v1/notifications?reference_id=eq.${encodeURIComponent(id)}&select=id,recipient_scope,recipient_athlete_id&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  const notifRows: { id: string; recipient_scope: string; recipient_athlete_id: string | null }[] =
    notifRes.ok ? await notifRes.json() : [];

  if (!notifRows.length) {
    return NextResponse.json({ scope: "everyone", reads: [], total_targeted: 0 });
  }

  const { id: notifId, recipient_scope, recipient_athlete_id } = notifRows[0];

  const teamId = await getTeamIdBySlug(slug);
  if (!teamId) return NextResponse.json({ error: "team not found" }, { status: 404 });

  const result = await getReadReceipts(
    notifId,
    slug,
    (recipient_scope ?? "everyone") as RecipientScope,
    recipient_athlete_id,
  );

  return NextResponse.json(result);
}
