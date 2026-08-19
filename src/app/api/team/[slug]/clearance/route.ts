import { NextRequest, NextResponse } from "next/server";
import { getTeamActor, isHeadCoach } from "@/lib/permissions.server";
import { getAccountSession } from "@/lib/accountSession";
import { getClearanceResources, createClearanceResource } from "@/lib/clearance";

type RouteContext = { params: Promise<{ slug: string }> };

// GET: any authenticated team member/coach may read.
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind === "public") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const resources = await getClearanceResources(slug);
  return NextResponse.json({ resources, canManage: isHeadCoach(actor) });
}

// POST: Head Coach only. Server-side authorization — never trust a hidden
// button on the client.
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (!isHeadCoach(actor)) {
    return NextResponse.json({ error: "Only this team's Head Coach can add Clearance resources." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const account = await getAccountSession();
  const result = await createClearanceResource(
    slug,
    { title: body.title, description: body.description, url: body.url, attachment_id: body.attachment_id },
    account?.id ?? null,
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, resource: result.resource });
}
