// Phase 7: shared storage-write core, extracted from
// api/team/[slug]/files/upload/route.ts so Clearance attachment upload can
// reuse the exact same bucket/limits/metadata-write logic instead of a
// second copy. Callers remain responsible for their own auth gate (the
// general Files upload stays isStaff-gated; Clearance's dedicated upload
// route gates isHeadCoach) and any side effects (push/notifications) —
// this module only writes storage + the team_files row.
const BASE   = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const TEAM_FILES_BUCKET = "team-files";
export const TEAM_FILES_MAX_BYTES = 25 * 1024 * 1024;

export const TEAM_FILES_ALLOWED_MIME: Record<string, "pdf" | "image" | "doc"> = {
  "application/pdf":    "pdf",
  "image/png":          "image",
  "image/jpeg":         "image",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "doc",
};

export type TeamFileRow = {
  id: string;
  campaign_slug: string;
  name: string;
  storage_path: string;
  file_type: "pdf" | "image" | "doc";
  size_bytes: number;
  uploaded_by: string;
  coach_id: string | null;
  uploaded_by_platform_admin_id: string | null;
  created_at: string;
};

export type UploadTeamFileResult =
  | { ok: true; file: TeamFileRow }
  | { ok: false; error: string; status: number };

export async function uploadTeamFile(
  slug: string,
  file: File,
  uploadedBy: string,
  coachId: string | null,
  platformAdminId: string | null = null,
): Promise<UploadTeamFileResult> {
  if (!TEAM_FILES_ALLOWED_MIME[file.type]) {
    return { ok: false, error: "File type not allowed. Use PDF, PNG, JPG, DOC, or DOCX.", status: 400 };
  }
  if (file.size > TEAM_FILES_MAX_BYTES) {
    return { ok: false, error: "File exceeds 25 MB limit.", status: 400 };
  }

  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const storagePath = `${slug}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const fileType = TEAM_FILES_ALLOWED_MIME[file.type];
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const uploadRes = await fetch(`${BASE}/storage/v1/object/${TEAM_FILES_BUCKET}/${storagePath}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": file.type },
    body: await file.arrayBuffer(),
  });
  if (!uploadRes.ok) {
    const msg = await uploadRes.text();
    return { ok: false, error: `Storage upload failed: ${msg}`, status: 500 };
  }

  const metaRes = await fetch(`${BASE}/rest/v1/team_files`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      campaign_slug: slug,
      name:          file.name,
      storage_path:  storagePath,
      file_type:     fileType,
      size_bytes:    file.size,
      uploaded_by:   uploadedBy,
      coach_id:      coachId,
      uploaded_by_platform_admin_id: platformAdminId,
    }),
  });
  if (!metaRes.ok) {
    const msg = await metaRes.text();
    return { ok: false, error: `Failed to save file record: ${msg}`, status: 500 };
  }

  const rows = await metaRes.json();
  return { ok: true, file: rows[0] as TeamFileRow };
}
