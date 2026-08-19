import { NextRequest, NextResponse } from "next/server";
import { getTeamActor, isHeadCoach } from "@/lib/permissions.server";
import { reorderClearanceResource } from "@/lib/clearance";

type RouteContext = { params: Promise<{ slug: string; id: string }> };

// POST: Head Coach only. Simple move up/down — swaps sort_order with the
// adjacent resource. No drag-and-drop in Phase 7 (see migration comment).
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { slug, id } = await params;
  const actor = await getTeamActor(slug);
  if (!isHeadCoach(actor)) {
    return NextResponse.json({ error: "Only this team's Head Coach can reorder Clearance resources." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const direction = body?.direction;
  if (direction !== "up" && direction !== "down") {
    return NextResponse.json({ error: "direction must be 'up' or 'down'." }, { status: 400 });
  }

  const result = await reorderClearanceResource(id, slug, direction);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, resource: result.resource });
}
