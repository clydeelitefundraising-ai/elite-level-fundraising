import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import { isHeadCoach } from "@/lib/permissions";
import { getPendingRequestsForCampaign } from "@/lib/platform/parentAccessRequests";

type RouteCtx = { params: Promise<{ slug: string }> };

// Head Coach queue listing — mirrors athlete-requests/route.ts (GET) and
// comment-approvals/route.ts exactly: Head-Coach-only for THIS campaign.
export async function GET(_req: NextRequest, { params }: RouteCtx) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (!isHeadCoach(actor)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requests = await getPendingRequestsForCampaign(slug);
  return NextResponse.json({ requests });
}
