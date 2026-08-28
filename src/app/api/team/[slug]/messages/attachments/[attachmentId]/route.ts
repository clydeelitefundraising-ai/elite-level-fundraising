import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import {
  getAttachmentByIdServer,
  isParticipant,
  MESSAGE_ATTACHMENTS_BUCKET,
  buildAttachmentContentDisposition,
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
// convention of not leaking existence to an unauthorized caller.
export async function GET(
  _req: NextRequest,
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

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const attachment = await getAttachmentByIdServer(attachmentId);
  // A pending (unclaimed) attachment is never downloadable — only a
  // fully attached one, with a real message_id, can be.
  if (!attachment || attachment.status !== "attached" || !attachment.message_id) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  // Defense-in-depth: the send_message_with_attachments RPC guarantees
  // attachment.thread_id always equals its linked message's thread_id by
  // construction, but this route re-verifies it directly against the
  // live messages row rather than trusting that invariant blindly.
  const msgRes = await fetch(
    `${BASE}/rest/v1/messages?id=eq.${encodeURIComponent(attachment.message_id)}&select=thread_id&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" },
  );
  const msgRows: { thread_id: string }[] = msgRes.ok ? await msgRes.json() : [];
  const messageThreadId = msgRows[0]?.thread_id ?? null;
  if (!messageThreadId || messageThreadId !== attachment.thread_id) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  // The one real authorization gate — identical predicate to every other
  // message read/write in this app, including for a platform admin: no
  // global bypass exists here or anywhere else. A platform admin who
  // isn't actually a participant of this thread is refused exactly like
  // any other non-participant.
  const ok = await isParticipant(attachment.thread_id, actorKey);
  if (!ok) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  // Only now — after every authorization check has passed — reach into
  // the private bucket, using the service-role key. The key itself never
  // leaves this server; only the file bytes and headers below do.
  const fileRes = await fetch(
    `${BASE}/storage/v1/object/${MESSAGE_ATTACHMENTS_BUCKET}/${attachment.storage_path}`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  if (!fileRes.ok) {
    return NextResponse.json({ error: "File not available." }, { status: fileRes.status });
  }

  return new NextResponse(fileRes.body, {
    headers: {
      "Content-Type":        attachment.mime_type || "application/octet-stream",
      "Content-Disposition": buildAttachmentContentDisposition(attachment.original_filename),
      "Cache-Control":       "private, max-age=1800",
    },
  });
}
