import { NextRequest, NextResponse } from "next/server";
import { getTeamActor, isStaff } from "@/lib/permissions.server";
import { sendPushToTeam } from "@/lib/push";
import { getTeamIdBySlug, createNotification } from "@/lib/notifications";

const BASE   = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const BUCKET = "team-files";
const MAX_BYTES = 25 * 1024 * 1024;

const ALLOWED_MIME: Record<string, "pdf" | "image" | "doc"> = {
  "application/pdf":    "pdf",
  "image/png":          "image",
  "image/jpeg":         "image",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "doc",
};

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
  if (!ALLOWED_MIME[file.type]) {
    return NextResponse.json({ error: "File type not allowed. Use PDF, PNG, JPG, DOC, or DOCX." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File exceeds 25 MB limit." }, { status: 400 });
  }

  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const storagePath = `${slug}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const fileType = ALLOWED_MIME[file.type];
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  // Server-to-server upload — no CORS
  const uploadRes = await fetch(`${BASE}/storage/v1/object/${BUCKET}/${storagePath}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": file.type,
    },
    body: await file.arrayBuffer(),
  });

  if (!uploadRes.ok) {
    const msg = await uploadRes.text();
    return NextResponse.json({ error: `Storage upload failed: ${msg}` }, { status: 500 });
  }

  // Save metadata
  const metaRes = await fetch(`${BASE}/rest/v1/team_files`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      campaign_slug: slug,
      name:          file.name,
      storage_path:  storagePath,
      file_type:     fileType,
      size_bytes:    file.size,
      uploaded_by:   actor.session.name,
      coach_id:      actor.kind === "coach" ? actor.session.id : null,
    }),
  });

  if (!metaRes.ok) {
    const msg = await metaRes.text();
    return NextResponse.json({ error: `Failed to save file record: ${msg}` }, { status: 500 });
  }

  const rows = await metaRes.json();
  const newFile = rows[0];

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
