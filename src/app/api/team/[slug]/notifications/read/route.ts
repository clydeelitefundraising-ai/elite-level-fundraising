import { NextRequest, NextResponse } from "next/server";
import { getMemberSession } from "@/lib/memberSession";
import { parseMemberId } from "@/lib/memberAuth";
import {
  getTeamIdBySlug,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/notifications";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
function h() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

type RouteContext = { params: Promise<{ slug: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { slug } = await params;
  console.log("[DEBUG] /notifications/read POST hit, slug=", slug);

  // ── 1. Inspect raw cookie ────────────────────────────────────────────────────
  const rawCookie = req.cookies.get("team_member")?.value ?? null;
  console.log("[DEBUG] raw team_member cookie present=", rawCookie !== null);
  console.log("[DEBUG] raw team_member cookie value=", rawCookie ? rawCookie.slice(0, 40) + "…" : null);

  const cookieMemberId = parseMemberId(rawCookie ?? undefined);
  console.log("[DEBUG] parseMemberId result=", cookieMemberId);

  if (!cookieMemberId) {
    console.error("[DEBUG] no valid member id in cookie — returning 401");
    return NextResponse.json({ error: "Unauthorized: no member cookie" }, { status: 401 });
  }

  // ── 2. Resolve full member session (verifies HMAC + slug scope) ──────────────
  const member = await getMemberSession(slug);
  console.log("[DEBUG] getMemberSession result=", member ? { id: member.id, role: member.role, slug: member.campaign_slug } : null);

  if (!member) {
    console.error("[DEBUG] getMemberSession returned null — cookie present but session invalid for slug=", slug);
    return NextResponse.json({ error: "Unauthorized: session invalid" }, { status: 401 });
  }

  // ── 3. Hard-verify member_id exists in team_members ─────────────────────────
  const memberCheckRes = await fetch(
    `${BASE}/rest/v1/team_members?id=eq.${encodeURIComponent(member.id)}&select=id,campaign_slug&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  const memberRows: { id: string; campaign_slug: string }[] = memberCheckRes.ok
    ? await memberCheckRes.json()
    : [];
  console.log("[DEBUG] team_members DB lookup for id=", member.id, "→", memberRows);

  if (memberRows.length === 0) {
    console.error("[DEBUG] member.id not found in team_members — cannot write FK-constrained row");
    return NextResponse.json({ error: "member not found in DB" }, { status: 400 });
  }

  // ── 4. Parse request body ────────────────────────────────────────────────────
  const body = await req.json().catch(() => ({}));
  console.log("[DEBUG] request body=", body);

  // ── 5. Resolve team_id ───────────────────────────────────────────────────────
  const teamId = await getTeamIdBySlug(slug);
  console.log("[DEBUG] teamId=", teamId);
  if (!teamId) {
    console.error("[DEBUG] getTeamIdBySlug returned null for slug=", slug);
    return NextResponse.json({ error: "team not found" }, { status: 404 });
  }

  // ── 6. Write read state ──────────────────────────────────────────────────────
  if (typeof body.id === "string" && body.id) {
    console.log("[DEBUG] marking single read: notificationId=", body.id, "memberId=", member.id);
    const result = await markNotificationRead(body.id, member.id);
    if (!result.ok) {
      console.error("[DEBUG] markNotificationRead failed:", result.error);
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
  } else {
    console.log("[DEBUG] marking all read: teamId=", teamId, "memberId=", member.id);
    await markAllNotificationsRead(teamId, member.id);
  }

  return NextResponse.json({ ok: true });
}
