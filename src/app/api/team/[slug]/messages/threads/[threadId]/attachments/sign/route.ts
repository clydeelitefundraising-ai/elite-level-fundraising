import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import {
  isParticipant,
  validateAttachmentFile,
  parseSignRequestBody,
  sweepStalePendingAttachments,
  createPendingAttachment,
  createSignedAttachmentUploadUrl,
  deletePendingAttachment,
  type ActorKey,
} from "@/lib/messages";

type RouteCtx = { params: Promise<{ slug: string; threadId: string }> };

// Client input is trusted ONLY for file metadata the server must validate
// anyway (name/type/size) — never storage_path, never an attachment id,
// never anything that would let a client claim ownership of, or move,
// an attachment. storage_path and the attachment id are both generated
// here, server-side, by createPendingAttachment.
export async function POST(
  req: NextRequest,
  { params }: RouteCtx,
) {
  const { slug, threadId } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind === "public") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorKey: ActorKey =
    actor.kind === "coach"          ? { kind: "coach",          id: actor.session.id } :
    actor.kind === "platform_admin" ? { kind: "platform_admin", id: actor.session.platformAdminId } :
    { kind: "member", id: actor.session.id };

  // Must already be a participant of THIS thread before anything else —
  // matches the same authorization this thread's reply endpoint requires.
  const ok = await isParticipant(threadId, actorKey);
  if (!ok) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = parseSignRequestBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { originalFilename, mimeType, byteSize } = parsed;

  const validation = validateAttachmentFile({ mimeType, byteSize });
  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.error.message, code: validation.error.code },
      { status: 400 },
    );
  }

  // Opportunistic, bounded cleanup of THIS thread's own abandoned pending
  // uploads (>24h old) — not a background job, never blocks/fails this
  // request if it errors (sweepStalePendingAttachments already swallows
  // its own DB-delete/storage-delete failures; the .catch here only
  // guards the unlikely case its own initial fetch throws outright).
  await sweepStalePendingAttachments(threadId).catch(() => {});

  const pending = await createPendingAttachment({
    threadId,
    actor: actorKey,
    originalFilename,
    mimeType,
    byteSize,
  });
  if (!pending.ok) {
    return NextResponse.json(
      { error: pending.error.message, code: pending.error.code },
      { status: 400 },
    );
  }

  const signed = await createSignedAttachmentUploadUrl(pending.storagePath);
  if (!signed.ok) {
    // A pending row now exists with no way to ever be uploaded to or
    // claimed — clean it up immediately rather than leaving a known
    // orphan for the 24h sweep to eventually catch.
    await deletePendingAttachment({
      attachmentId: pending.attachmentId,
      storagePath:  pending.storagePath,
    }).catch(() => {});
    return NextResponse.json({ error: "Failed to prepare upload. Please try again." }, { status: 500 });
  }

  // storage_path is deliberately NOT returned. The client needs only:
  // (a) the signed URL to PUT bytes to (it already encodes the target
  // path), and (b) the attachment id to later reference in the send
  // request's attachmentIds array — the pending row already exists
  // server-side keyed by that id, so the client never needs to tell the
  // server the path again (unlike the older team-files signed-upload
  // pattern, where the metadata row is created client-side AFTER upload
  // and so genuinely needs the path echoed back).
  return NextResponse.json({
    attachment_id:      pending.attachmentId,
    signed_upload_url:  signed.signedUploadUrl,
    mime_type:          mimeType,
    original_filename:  originalFilename,
    byte_size:          byteSize,
    attachment_kind:    pending.kind,
  });
}
