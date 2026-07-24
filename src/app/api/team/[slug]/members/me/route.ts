import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";

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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  // getTeamActor resolves both the account-based elf_session (Phase A22)
  // and the legacy team_member cookie — getMemberSession alone (the old
  // check here) only recognized the legacy cookie, so every Phase A22
  // account-based member session was rejected with a false "Unauthorized"
  // the moment they tried to link a profile.
  const actor = await getTeamActor(slug);
  if (actor.kind !== "member") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const member = actor.session;

  const body = await req.json().catch(() => null);
  if (!body?.athlete_id || typeof body.athlete_id !== "string") {
    return NextResponse.json({ error: "athlete_id required" }, { status: 400 });
  }
  const { athlete_id } = body;

  // Verify athlete belongs to this campaign — prevents cross-team linkage
  const checkRes = await fetch(
    `${BASE}/rest/v1/athletes?id=eq.${encodeURIComponent(athlete_id)}&campaign_slug=eq.${encodeURIComponent(slug)}&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!checkRes.ok) return NextResponse.json({ error: "Failed to verify athlete" }, { status: 500 });
  const rows = await checkRes.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "Athlete not found for this team" }, { status: 404 });
  }

  if (member.role === "athlete") {
    // Athlete's own single self-link — team_members.athlete_id, unchanged
    // from the original behavior. The DB partial unique index
    // (team_members_athlete_claim_uniq) rejects a roster spot that's
    // already claimed by someone else.
    const updateRes = await fetch(
      `${BASE}/rest/v1/team_members?id=eq.${encodeURIComponent(member.id)}`,
      { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify({ athlete_id }) },
    );
    if (!updateRes.ok) {
      const msg = await updateRes.text();
      const isClaimConflict = msg.includes("team_members_athlete_claim_uniq") || msg.includes("23505");
      if (isClaimConflict) {
        return NextResponse.json(
          { error: "This athlete already has an account. If this is you, try logging in or use Forgot Password." },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: `Update failed: ${msg}` }, { status: 500 });
    }
  } else {
    // Parent (or booster) — additive many-to-many link via
    // team_member_athletes, matching the join-flow's claim model. Never
    // writes to team_members.athlete_id for a non-athlete role — that
    // column is specifically the athlete's own self-link.
    const insertRes = await fetch(`${BASE}/rest/v1/team_member_athletes`, {
      method: "POST",
      headers: h({ Prefer: "resolution=ignore-duplicates,return=minimal" }),
      body: JSON.stringify({ team_member_id: member.id, athlete_id }),
    });
    if (!insertRes.ok) {
      const msg = await insertRes.text();
      return NextResponse.json({ error: `Failed to link profile: ${msg}` }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
