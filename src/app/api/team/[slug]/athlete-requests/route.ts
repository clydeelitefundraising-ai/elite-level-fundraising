import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import { isHeadCoach } from "@/lib/permissions";
import { getPendingRequestsWithMatches } from "@/lib/platform/athleteRequests";

// Head-Coach-only management surface for pending athlete requests. isHeadCoach()
// is deliberately the narrowest permission check available — it is already
// scoped to "this campaign" because getTeamActor(slug) only resolves a
// "coach" actor from a team_coaches row matching BOTH the account and this
// exact campaign_slug. Assistant coaches and boosters (isStaff() would
// include both) must not see this queue at all, per Phase 1B.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (!isHeadCoach(actor)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const requests = await getPendingRequestsWithMatches(slug);
  return NextResponse.json({ requests });
}
