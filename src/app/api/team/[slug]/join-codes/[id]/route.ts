import { NextRequest, NextResponse } from "next/server";
import { getTeamActor, isHeadCoach } from "@/lib/permissions.server";
import { logAuditEvent, toAuditActor, ipOf } from "@/lib/auditLog";

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

// PATCH — revoke a join code by id (Head-Coach-only — see join-codes/route.ts's
// POST for why this is narrower than isStaff)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params;
  const actor = await getTeamActor(slug);
  if (!isHeadCoach(actor)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.kind !== "coach" && actor.kind !== "platform_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify the code belongs to this campaign before revoking
  const res = await fetch(
    `${BASE}/rest/v1/team_join_codes?id=eq.${encodeURIComponent(id)}&campaign_slug=eq.${encodeURIComponent(slug)}`,
    {
      method: "PATCH",
      headers: h({ Prefer: "return=minimal" }),
      body: JSON.stringify({ revoked: true }),
    },
  );

  if (!res.ok) {
    const msg = await res.text();
    return NextResponse.json({ error: `Failed to revoke code: ${msg}` }, { status: 500 });
  }

  logAuditEvent({
    actor: toAuditActor(actor),
    action: "join_code.revoked",
    entity_type: "team_join_code",
    entity_id: id,
    campaign_slug: slug,
    summary: `Revoked the join code for ${slug}`,
    ip_address: ipOf(req),
    user_agent: req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true });
}
