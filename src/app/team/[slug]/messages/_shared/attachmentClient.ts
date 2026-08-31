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

// ─── Attachment-open anchor behavior (pure) ─────────────────────────────────────

export type AttachmentAnchorProps = { target?: "_blank"; rel?: "noopener noreferrer" };

/** Pure. Decides the anchor attributes AttachmentCard uses to open an
 *  attachment, given whether the app is running as a native Capacitor
 *  shell (the caller passes Capacitor.isNativePlatform() — never called
 *  here directly, so this stays testable without mocking @capacitor/core).
 *
 *  Desktop/mobile WEB: target="_blank" (unchanged, existing behavior) —
 *  opening in a new tab is harmless there since the tab shares the same
 *  browser's cookie jar as the page that opened it.
 *
 *  Native Capacitor: no target at all, so the navigation stays inside the
 *  app's own authenticated WKWebView instead of Capacitor's default
 *  target="_blank" handling, which hands the URL off to the SYSTEM
 *  browser (a separate app/process with its own, unrelated cookie
 *  storage) — the exact cause of the "File not found." bug: the app's
 *  HttpOnly ELF session cookie never reaches that separate browser, so
 *  the authenticated download route can't recognize the requester as a
 *  participant. Keeping the navigation in-WebView means the existing
 *  session cookie is attached exactly like the inline <img> load already
 *  does. The download route's existing Content-Disposition header
 *  (inline for images, attachment for everything else) is untouched and
 *  still governs how the WebView displays/downloads the response — this
 *  fix is purely about which webview/browser makes the request, not the
 *  URL, the route, or its authorization. */
export function attachmentAnchorProps(isNative: boolean): AttachmentAnchorProps {
  if (isNative) return {};
  return { target: "_blank", rel: "noopener noreferrer" };
}

// ─── Attachment-open destination (pure) ─────────────────────────────────────────

/** The authenticated raw-bytes route — always the <img>/<video>/<iframe>
 *  SOURCE regardless of platform, and (on web) also the anchor's
 *  navigation target. Never a public or signed Storage URL. */
export function attachmentApiHref(slug: string, attachmentId: string): string {
  return `/api/team/${slug}/messages/attachments/${attachmentId}`;
}

/** The dedicated ELF attachment viewer PAGE — a normal authenticated
 *  Next.js route, not the raw binary API route. Only ever used as the
 *  native anchor destination (see attachmentAnchorHref) — never as an
 *  <img>/<video>/<iframe> source, which always stays attachmentApiHref
 *  regardless of platform. */
export function attachmentViewerHref(slug: string, attachmentId: string): string {
  return `/team/${slug}/messages/attachments/${attachmentId}/view`;
}

/** Pure. The anchor's navigation destination for opening an attachment,
 *  given whether the app is running as a native Capacitor shell.
 *
 *  Desktop/mobile WEB: the raw authenticated API route, unchanged —
 *  target="_blank" (see attachmentAnchorProps) opens it in a new tab,
 *  where the browser's own inline image/video/PDF rendering (or download
 *  prompt for DOC/DOCX) already gives a reasonable experience.
 *
 *  Native Capacitor: the dedicated viewer page, for EVERY attachment
 *  kind — not just images/video. Navigating straight to the raw API
 *  route in-WebView leaves no ELF chrome/Back control for a renderable
 *  response (images), and outright fails for a forced-download response
 *  (video/PDF/DOC/DOCX all used "attachment" disposition), which
 *  WKWebView can't display as a top-level navigation and which Capacitor
 *  then surfaces as its generic offline/errorPath screen — a real
 *  production bug, not a hypothetical one. The viewer page is a normal
 *  authenticated ELF page, so it always renders successfully regardless
 *  of the underlying file's disposition, and gives every attachment kind
 *  a real Back control back to the originating thread. */
export function attachmentAnchorHref(slug: string, attachmentId: string, isNative: boolean): string {
  return isNative ? attachmentViewerHref(slug, attachmentId) : attachmentApiHref(slug, attachmentId);
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
