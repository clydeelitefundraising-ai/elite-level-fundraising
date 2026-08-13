import { NextRequest, NextResponse } from "next/server";
import { getMemberSession } from "@/lib/memberSession";
import { linkMemberToAthlete } from "@/lib/platform/athletes";
import { syncParentIntoAthleteThreads } from "@/lib/messages";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const member = await getMemberSession(slug);
  if (!member) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.athlete_id || typeof body.athlete_id !== "string") {
    return NextResponse.json({ error: "athlete_id required" }, { status: 400 });
  }

  try {
    const result = await linkMemberToAthlete(member.id, body.athlete_id, slug);
    if (!result.ok) {
      return NextResponse.json({ error: "Athlete not found for this team" }, { status: 404 });
    }
  } catch (err) {
    return NextResponse.json({ error: `Update failed: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }

  // A parent linking themselves to an athlete may be catching up to a
  // thread that already exists (athlete started a coach DM before this
  // parent had an account). Best-effort — a messaging sync hiccup must
  // never fail the linking operation itself, which already succeeded.
  if (member.role === "parent") {
    try {
      await syncParentIntoAthleteThreads(body.athlete_id, slug);
    } catch (err) {
      console.error("[members/me] syncParentIntoAthleteThreads failed:", err);
    }
  }

  return NextResponse.json({ ok: true });
}
