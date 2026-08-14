import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import { isHeadCoach } from "@/lib/permissions";
import { getPendingCommentApprovals } from "@/lib/platform/comments";

// Head-Coach-only management surface for pending comment approvals —
// mirrors athlete-requests/route.ts exactly (same isHeadCoach() check,
// same reasoning: already scoped to THIS campaign since getTeamActor(slug)
// only resolves a "coach" actor from a team_coaches row matching both the
// account and this exact campaign_slug). Assistant coaches and boosters
// must not see this queue at all.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (!isHeadCoach(actor)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const approvals = await getPendingCommentApprovals(slug);
  return NextResponse.json({ approvals });
}
