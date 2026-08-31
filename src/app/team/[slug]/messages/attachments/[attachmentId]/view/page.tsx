import { notFound } from "next/navigation";
import Link from "next/link";
import { getCampaignSettings } from "@/lib/supabase";
import { getTeamActor } from "@/lib/permissions.server";
import { resolveAuthorizedAttachment, type ActorKey } from "@/lib/messages";
import { attachmentApiHref, readableFileSize } from "../../../_shared/attachmentClient";

export const dynamic = "force-dynamic";

// Dedicated ELF attachment viewer — the safe landing page for opening an
// attachment from the NATIVE Capacitor app (see AttachmentCard's
// attachmentAnchorHref). Unlike navigating straight to the raw
// authenticated API route, this is always a real, renderable ELF page
// regardless of the underlying file's disposition — a forced-download
// response (video/PDF/DOC/DOCX) is something WKWebView can't display as
// a top-level navigation, which is what produced the "Can't reach Elite
// Level Fundraising" errorPath screen this page exists to fix.
//
// Authorization is IDENTICAL to the raw download route — both go through
// resolveAuthorizedAttachment (src/lib/messages.ts), so this page can
// never grant access the download route itself wouldn't. No storage_path
// is ever read or rendered here; only public-safe metadata fields off
// the resolved attachment row are used.
export default async function AttachmentViewerPage({
  params,
}: {
  params: Promise<{ slug: string; attachmentId: string }>;
}) {
  const { slug, attachmentId } = await params;

  const [settings, actor] = await Promise.all([
    getCampaignSettings(slug),
    getTeamActor(slug),
  ]);
  if (!settings) notFound();
  if (actor.kind === "public") notFound();

  const actorKey: ActorKey =
    actor.kind === "coach"          ? { kind: "coach",          id: actor.session.id } :
    actor.kind === "platform_admin" ? { kind: "platform_admin", id: actor.session.platformAdminId } :
    { kind: "member", id: actor.session.id };

  const resolved = await resolveAuthorizedAttachment(attachmentId, actorKey);
  if (!resolved.ok) notFound();
  const attachment = resolved.attachment;

  // The canonical return path — a Link to the thread's real URL, not
  // router.back(). A directly-refreshed or deep-linked viewer page has no
  // browser-history entry to go "back" to, so this must always work on
  // its own, not only when arrived at via normal in-app navigation.
  const backHref = `/team/${slug}/messages/${attachment.thread_id}`;
  const apiHref = attachmentApiHref(slug, attachmentId);
  const isPdf = attachment.mime_type === "application/pdf";

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "1rem" }}>
      <Link
        href={backHref}
        style={{
          display: "inline-flex", alignItems: "center", gap: ".4rem",
          color: "#0b1e3d", fontWeight: 700, fontSize: ".95rem",
          textDecoration: "none", marginBottom: "1rem",
        }}
      >
        <span aria-hidden="true">←</span> Back to conversation
      </Link>

      <div style={{ background: "#fff", border: "1.5px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
        {attachment.attachment_kind === "image" && (
          // eslint-disable-next-line @next/next/no-img-element -- authenticated app route, not a remote/optimizable asset
          <img
            src={apiHref}
            alt={attachment.original_filename}
            style={{ display: "block", width: "100%", height: "auto" }}
          />
        )}

        {attachment.attachment_kind === "video" && (
          // Range support on the download route (see
          // isForwardableRangeHeader/attachmentDownloadDisposition) is
          // what makes this reliably playable — inline disposition alone
          // isn't sufficient for WebKit's <video> pipeline.
          <video controls preload="metadata" style={{ display: "block", width: "100%", background: "#000" }}>
            <source src={apiHref} type={attachment.mime_type} />
          </video>
        )}

        {attachment.attachment_kind === "file" && isPdf && (
          <iframe
            src={apiHref}
            title={attachment.original_filename}
            style={{ display: "block", width: "100%", height: "80vh", border: "none" }}
          />
        )}

        {attachment.attachment_kind === "file" && !isPdf && (
          // DOC/DOCX: no in-app preview or open action — WKWebView can't
          // render these, and nothing here should re-navigate to the raw
          // download route (that reproduces the exact "attachment"-
          // disposition top-level-navigation failure this page exists to
          // avoid). This is a deliberately honest, capability-limited
          // landing state, not a broken/dead-end one — Files/Share-based
          // native open support is a tracked follow-up, not attempted
          // here (see the approved investigation report).
          <div style={{ padding: "2rem 1.25rem", textAlign: "center" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: ".5rem" }} aria-hidden="true">📎</div>
            <div style={{ fontWeight: 700, color: "#0b1e3d", marginBottom: ".25rem", wordBreak: "break-word" }}>
              {attachment.original_filename}
            </div>
            <div style={{ fontSize: ".85rem", color: "#6b7280", marginBottom: "1rem" }}>
              {readableFileSize(attachment.byte_size)}
            </div>
            <p style={{ fontSize: ".85rem", color: "#6b7280", maxWidth: 360, margin: "0 auto" }}>
              Opening this file type isn&apos;t supported in the app yet.
              Open this conversation in a web browser to view or download it.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
