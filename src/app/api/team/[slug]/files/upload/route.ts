import { NextRequest, NextResponse } from "next/server";
import { getTeamActor, isStaff } from "@/lib/permissions.server";
import { sendPushToTeam } from "@/lib/push";
import { getTeamIdBySlug, createNotification } from "@/lib/notifications";
import { uploadTeamFile } from "@/lib/teamFileUpload";

type RouteContext = { params: Promise<{ slug: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind === "public" || !isStaff(actor)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const result = await uploadTeamFile(
    slug,
    file,
    actor.session.name,
    actor.kind === "coach" ? actor.session.id : null,
    actor.kind === "platform_admin" ? actor.session.platformAdminId : null,
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const newFile = result.file;

  // Fire-and-forget: in-app notification + push dispatch.
  // Each step is independently try/catched — a push failure never affects
  // notification creation, and neither blocks the 200 response above.
  void (async () => {
    // Step 1: in-app notification (DB write, shown in bell + notifications page)
    try {
      const teamId = await getTeamIdBySlug(slug);
      if (teamId) {
        await createNotification(teamId, {
          type:          "file_upload",
          title:         "New File Uploaded",
          body:          file.name,
          reference_id:  newFile.id,
          reference_url: `/team/${slug}/communications?tab=updates`,
        });
      }
    } catch (err) {
      console.error("[files/upload] createNotification failed:", err);
    }

    // Step 2: device push — independent of notification creation above.
    try {
      await sendPushToTeam(slug, {
        title: "New File Uploaded",
        body:  file.name,
        url:   `/team/${slug}/communications?tab=updates`,
      });
    } catch (err) {
      console.error("[files/upload] sendPushToTeam failed:", err);
    }
  })();

  return NextResponse.json(newFile);
}
