import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function supabaseHeaders(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get("elf_admin")?.value);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Fetch the target coach to know their role and campaign
  const coachRes = await fetch(
    `${BASE}/rest/v1/team_coaches?id=eq.${encodeURIComponent(id)}&select=id,role,campaign_slug&limit=1`,
    { headers: supabaseHeaders(), cache: "no-store" },
  );

  if (!coachRes.ok) {
    return NextResponse.json({ error: "Failed to look up coach." }, { status: 500 });
  }

  const coachRows = await coachRes.json();
  if (!Array.isArray(coachRows) || coachRows.length === 0) {
    return NextResponse.json({ error: "Coach not found." }, { status: 404 });
  }

  const coach = coachRows[0];

  // Block removal of the last head coach for this campaign
  if (coach.role === "head_coach") {
    const countRes = await fetch(
      `${BASE}/rest/v1/team_coaches?campaign_slug=eq.${encodeURIComponent(coach.campaign_slug)}&role=eq.head_coach&select=id`,
      { headers: supabaseHeaders(), cache: "no-store" },
    );

    if (countRes.ok) {
      const headCoaches = await countRes.json();
      if (Array.isArray(headCoaches) && headCoaches.length <= 1) {
        return NextResponse.json(
          { error: "Cannot remove the last Head Coach for this campaign. Assign another Head Coach first." },
          { status: 409 },
        );
      }
    }
  }

  const deleteRes = await fetch(
    `${BASE}/rest/v1/team_coaches?id=eq.${encodeURIComponent(id)}`,
    { method: "DELETE", headers: supabaseHeaders({ Prefer: "return=minimal" }) },
  );

  if (!deleteRes.ok) {
    const msg = await deleteRes.text();
    return NextResponse.json({ error: `Failed to delete coach: ${msg}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
