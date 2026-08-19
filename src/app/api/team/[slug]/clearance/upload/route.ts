import { NextRequest, NextResponse } from "next/server";
import { getTeamActor, isHeadCoach } from "@/lib/permissions.server";
import { uploadTeamFile } from "@/lib/teamFileUpload";

type RouteContext = { params: Promise<{ slug: string }> };

// Phase 7: Clearance attachment upload. Reuses the exact same bucket/
// limits/team_files-write logic as the general Updates/Files upload route
// (src/lib/teamFileUpload.ts) — no second storage system. Gated tighter
// than the general upload route (isHeadCoach, not isStaff), since Clearance
// write access is Head-Coach-only end to end.
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind !== "coach" || !isHeadCoach(actor)) {
    return NextResponse.json({ error: "Only this team's Head Coach can upload Clearance attachments." }, { status: 403 });
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    const entry = form.get("file");
    if (entry instanceof File) file = entry;
  } catch {
    return NextResponse.json({ error: "Failed to read form data." }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: "No file provided." }, { status: 400 });

  const result = await uploadTeamFile(slug, file, actor.session.name, actor.session.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, file: result.file });
}
