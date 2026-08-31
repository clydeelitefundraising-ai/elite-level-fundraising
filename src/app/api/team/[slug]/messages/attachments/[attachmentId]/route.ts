import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import {
  resolveAuthorizedAttachment,
  MESSAGE_ATTACHMENTS_BUCKET,
  buildAttachmentContentDisposition,
  attachmentDownloadDisposition,
  isForwardableRangeHeader,
  type ActorKey,
} from "@/lib/messages";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

type RouteCtx = { params: Promise<{ slug: string; attachmentId: string }> };

// Authorization chain (do not reorder or shortcut any step):
//   attachment id -> attachment row -> its linked message -> that
//   message's thread -> current actor's participation in that thread.
// The attachment id is the ONLY client-supplied locator; storage_path is
// never accepted from, or exposed to, the client at any point. Every
// failure mode below returns the same generic 404 — this route never
// distinguishes "doesn't exist" from "exists but you're not authorized"
// in its response, matching the existing team-files download route's
// convention of not leaking existence to an unauthorized caller. The
// chain itself lives in resolveAuthorizedAttachment (src/lib/messages.ts)
// so this route and the attachment viewer page can never drift on what
// counts as authorized.
export async function GET(
  req: NextRequest,
  { params }: RouteCtx,
) {
  const { slug, attachmentId } = await params;

  const actor = await getTeamActor(slug);
  if (actor.kind === "public") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const actorKey: ActorKey =
    actor.kind === "coach"          ? { kind: "coach",          id: actor.session.id } :
    actor.kind === "platform_admin" ? { kind: "platform_admin", id: actor.session.platformAdminId } :
    { kind: "member", id: actor.session.id };

  const resolved = await resolveAuthorizedAttachment(attachmentId, actorKey);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const attachment = resolved.attachment;

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  // Range support (native video playback needs this — WebKit's <video>
  // pipeline is unreliable without it). Authorization above has already
  // fully completed before this point, regardless of whether a Range
  // header is present — Range only affects HOW MUCH of the already-
  // authorized object is fetched, never whether it's fetched at all. An
  // unforwardable/absent Range simply falls back to a full 200 response,
  // same as before this change.
  const rangeHeader = req.headers.get("range");
  const forwardRange = isForwardableRangeHeader(rangeHeader) ? rangeHeader : null;

  // Only now — after every authorization check has passed — reach into
  // the private bucket, using the service-role key. The key itself never
  // leaves this server; only the file bytes and headers below do.
  const fileRes = await fetch(
    `${BASE}/storage/v1/object/${MESSAGE_ATTACHMENTS_BUCKET}/${attachment.storage_path}`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        ...(forwardRange ? { Range: forwardRange } : {}),
      },
    },
  );
  // fileRes.ok is true for both 200 (full object) and 206 (partial
  // content) — a 416 (unsatisfiable range) or any real failure falls
  // through here exactly as before, with Supabase's own status forwarded
  // verbatim rather than reinterpreted.
  if (!fileRes.ok) {
    return NextResponse.json({ error: "File not available." }, { status: fileRes.status });
  }

  // Images, video, and PDF render/play in place (needed for the
  // <img>/<video>/<iframe>-based viewer and inline thread previews);
  // DOC/DOCX still force a download, exactly as before. Still the same
  // authenticated, participant-gated route — no public or signed-
  // download URL is introduced by any of this.
  const disposition = attachmentDownloadDisposition(attachment.mime_type, attachment.attachment_kind);

  const headers: Record<string, string> = {
    "Content-Type":        attachment.mime_type || "application/octet-stream",
    "Content-Disposition": buildAttachmentContentDisposition(attachment.original_filename, disposition),
    "Cache-Control":       "private, max-age=1800",
    "Accept-Ranges":       "bytes",
  };
  const contentRange = fileRes.headers.get("content-range");
  if (contentRange) headers["Content-Range"] = contentRange;
  const contentLength = fileRes.headers.get("content-length");
  if (contentLength) headers["Content-Length"] = contentLength;

  return new NextResponse(fileRes.body, { status: fileRes.status, headers });
}
