import { NextRequest, NextResponse } from "next/server";
import { getMemberSession } from "@/lib/memberSession";
import { dismissNotification } from "@/lib/notifications";

type RouteContext = { params: Promise<{ slug: string; id: string }> };

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { slug, id } = await params;
  const member = await getMemberSession(slug);
  if (!member) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await dismissNotification(id, member.id);
  return NextResponse.json({ ok: true });
}
