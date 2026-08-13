import { NextRequest, NextResponse } from "next/server";
import { getMemberSession } from "@/lib/memberSession";
import { linkMemberToAthlete } from "@/lib/platform/athletes";

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

  return NextResponse.json({ ok: true });
}
