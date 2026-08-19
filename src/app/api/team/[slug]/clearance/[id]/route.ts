import { NextRequest, NextResponse } from "next/server";
import { getTeamActor, isHeadCoach } from "@/lib/permissions.server";
import { updateClearanceResource, deleteClearanceResource } from "@/lib/clearance";

type RouteContext = { params: Promise<{ slug: string; id: string }> };

// PATCH: Head Coach only — edit (including repointing/clearing attachment_id).
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { slug, id } = await params;
  const actor = await getTeamActor(slug);
  if (!isHeadCoach(actor)) {
    return NextResponse.json({ error: "Only this team's Head Coach can edit Clearance resources." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const result = await updateClearanceResource(id, slug, {
    title: body.title, description: body.description, url: body.url, attachment_id: body.attachment_id,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, resource: result.resource });
}

// DELETE: Head Coach only. Deletes only the clearance_resources row — the
// underlying team_files attachment (if any) is never touched here. See
// src/lib/clearance.ts's module header for the full lifecycle rationale.
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { slug, id } = await params;
  const actor = await getTeamActor(slug);
  if (!isHeadCoach(actor)) {
    return NextResponse.json({ error: "Only this team's Head Coach can delete Clearance resources." }, { status: 403 });
  }

  const result = await deleteClearanceResource(id, slug);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
