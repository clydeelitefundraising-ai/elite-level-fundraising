// Client-safe attachment helpers for the Message Attachments composer.
//
// Deliberately duplicated from src/lib/messages.ts's server-side allow-list
// (max counts, per-kind MIME/size rules) rather than imported from it —
// that module reads SUPABASE_SERVICE_ROLE_KEY and is server-only; pulling
// any runtime value from it into a client bundle would be a real secret-
// exposure risk. Everything duplicated here is public, non-secret product
// policy (which file types/sizes are allowed), and this validation is UX
// only — the sign endpoint (validateAttachmentFile) remains authoritative
// and re-validates independently server-side regardless of what the
// client already checked.

export type ClientAttachmentKind = "image" | "video" | "file";

export const MAX_ATTACHMENTS_PER_MESSAGE = 6;

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_FILE_BYTES  = 25 * 1024 * 1024;

export const MAX_BYTES_BY_KIND: Record<ClientAttachmentKind, number> = {
  image: MAX_IMAGE_BYTES,
  video: MAX_VIDEO_BYTES,
  file:  MAX_FILE_BYTES,
};

const MIME_TO_KIND: Record<string, ClientAttachmentKind> = {
  "image/jpeg": "image",
  "image/png":  "image",
  "image/webp": "image",
  "image/heic": "image",
  "image/heif": "image",
  "video/mp4":       "video",
  "video/quicktime": "video",
  "application/pdf":    "file",
  "application/msword": "file",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "file",
};

export const ACCEPTED_FILE_INPUT_ACCEPT = Object.keys(MIME_TO_KIND).join(",");

export function classifyClientMime(mimeType: string): ClientAttachmentKind | null {
  return MIME_TO_KIND[mimeType] ?? null;
}

// HEIC/HEIF report an image/* MIME type but most browsers cannot decode
// them into an <img>-renderable object URL — a broken-image icon would be
// worse than the generic file/kind icon these fall back to. Only the
// formats a browser can reliably rasterize get a local preview.
export function canPreviewAsImage(mimeType: string): boolean {
  return mimeType === "image/jpeg" || mimeType === "image/png" || mimeType === "image/webp";
}

export type ClientFileValidationResult =
  | { ok: true; kind: ClientAttachmentKind }
  | { ok: false; error: string };

export function validateClientFile(file: { name: string; type: string; size: number }): ClientFileValidationResult {
  const kind = classifyClientMime(file.type);
  if (!kind) {
    return { ok: false, error: `"${file.name}" isn't a supported file type.` };
  }
  const maxBytes = MAX_BYTES_BY_KIND[kind];
  if (file.size > maxBytes) {
    return {
      ok: false,
      error: `"${file.name}" exceeds the ${Math.round(maxBytes / (1024 * 1024))} MB limit for ${kind}s.`,
    };
  }
  return { ok: true, kind };
}

export type SelectFilesResult = {
  validFiles: { file: { name: string; type: string; size: number }; kind: ClientAttachmentKind }[];
  errors: string[];
};

/** Validates a freshly-picked batch of files against both per-file rules
 *  (MIME/size) and the running total against MAX_ATTACHMENTS_PER_MESSAGE.
 *  `existingCount` is however many attachments are already selected
 *  before this batch. Stops accepting once the max would be exceeded —
 *  any files picked in the same batch beyond that point are reported as
 *  a single "max attachments" error, not one error per excess file. */
export function selectFilesForAttachment<F extends { name: string; type: string; size: number }>(
  existingCount: number,
  incoming: F[],
): { validFiles: { file: F; kind: ClientAttachmentKind }[]; errors: string[] } {
  const errors: string[] = [];
  const validFiles: { file: F; kind: ClientAttachmentKind }[] = [];
  let count = existingCount;

  for (const file of incoming) {
    if (count >= MAX_ATTACHMENTS_PER_MESSAGE) {
      errors.push(`Only ${MAX_ATTACHMENTS_PER_MESSAGE} attachments are allowed per message.`);
      break;
    }
    const result = validateClientFile(file);
    if (!result.ok) {
      errors.push(result.error);
      continue;
    }
    validFiles.push({ file, kind: result.kind });
    count++;
  }

  return { validFiles, errors };
}

export function readableFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Bubble rendering decision (pure) ──────────────────────────────────────────

/** Whether a message bubble should render its text container at all — an
 *  attachment-only message has an empty (or whitespace-only) body, and
 *  rendering an empty rounded speech bubble for it would read as a
 *  rendering bug rather than "no caption." Attachment cards render
 *  independently of this — this decision only ever hides the TEXT part. */
export function shouldRenderTextBubble(body: string): boolean {
  return body.trim().length > 0;
}

// ─── Sign-response parsing (pure) ──────────────────────────────────────────────

export type SignResponseParsed =
  | { ok: true; attachmentId: string; signedUploadUrl: string; mimeType: string }
  | { ok: false; error: string };

/** Parses the sign endpoint's JSON response. Deliberately reads only
 *  attachment_id/signed_upload_url/mime_type — storage_path is never
 *  present in this response at all (the server doesn't return it), so
 *  there is no field here that could even accidentally be treated as
 *  claim/download authority. */
export function parseSignResponse(json: unknown): SignResponseParsed {
  const j = json as
    | { attachment_id?: unknown; signed_upload_url?: unknown; mime_type?: unknown; error?: unknown }
    | null;
  if (typeof j?.error === "string") return { ok: false, error: j.error };
  if (
    typeof j?.attachment_id === "string" &&
    typeof j?.signed_upload_url === "string" &&
    typeof j?.mime_type === "string"
  ) {
    return { ok: true, attachmentId: j.attachment_id, signedUploadUrl: j.signed_upload_url, mimeType: j.mime_type };
  }
  return { ok: false, error: "Unexpected response from server." };
}
