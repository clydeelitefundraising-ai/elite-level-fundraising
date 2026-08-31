"use client";

// Type-only import — erased entirely at compile time, zero runtime code
// pulled from the server-only src/lib/messages.ts module into the client
// bundle. This is the same pattern ThreadView.tsx already uses for
// MessageThread/ResolvedParticipant/ResolvedMessage.
import { Capacitor } from "@capacitor/core";
import type { MessageAttachmentPublic } from "@/lib/messages";
import { attachmentAnchorProps, attachmentApiHref, attachmentAnchorHref } from "./attachmentClient";

function readableFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Renders one ALREADY-SENT attachment inside a message bubble, using
 *  only the client-safe MessageAttachmentPublic fields the server ever
 *  returns (id/original_filename/mime_type/byte_size/attachment_kind/
 *  created_at) — storage_path never exists on this type at all, so there
 *  is nothing to accidentally expose here. Every open/download goes
 *  through the authenticated download route, keyed only by attachment
 *  id; no public Storage URL is ever constructed or used. */
export default function AttachmentCard({
  slug,
  attachment,
}: {
  slug: string;
  attachment: MessageAttachmentPublic;
}) {
  const isNative = Capacitor.isNativePlatform();
  // The inline thumbnail's <img> SOURCE is always the raw authenticated
  // route, on every platform — only the anchor's NAVIGATION destination
  // differs (see attachmentAnchorHref: native goes to the dedicated
  // viewer page for every kind; web keeps going straight to the raw
  // route, unchanged). See attachmentAnchorProps for why native must
  // never use target="_blank" (it hands the navigation off to a
  // separate, unauthenticated browser).
  const apiHref = attachmentApiHref(slug, attachment.id);
  const anchorHref = attachmentAnchorHref(slug, attachment.id, isNative);
  const anchorProps = attachmentAnchorProps(isNative);

  if (attachment.attachment_kind === "image") {
    return (
      <a
        href={anchorHref}
        {...anchorProps}
        aria-label={`Open photo ${attachment.original_filename}`}
        style={{ display: "block", maxWidth: 240, borderRadius: 10, overflow: "hidden", lineHeight: 0 }}
      >
        {/* Same-origin request — the browser sends the session cookie
            automatically, so this authenticates exactly like any other
            fetch to this app's own API. Content-Disposition: attachment
            on the response does not prevent inline <img> rendering; it
            only affects a top-level navigation (the click-through above). */}
        {/* eslint-disable-next-line @next/next/no-img-element -- authenticated app route, not a remote/optimizable asset */}
        <img
          src={apiHref}
          alt={attachment.original_filename}
          loading="lazy"
          style={{ display: "block", width: "100%", maxHeight: 220, objectFit: "cover" }}
        />
      </a>
    );
  }

  // Video and generic files both render as a plain file/download card in
  // the thread itself — the actual video/document EXPERIENCE (playback,
  // PDF preview, etc.) lives in the attachment viewer page on native, and
  // in whatever the browser does with the raw route on web.
  const icon = attachment.attachment_kind === "video" ? "🎥" : "📎";
  return (
    <a
      href={anchorHref}
      {...anchorProps}
      aria-label={`Open ${attachment.attachment_kind === "video" ? "video" : "file"} ${attachment.original_filename}`}
      style={{
        display: "flex", alignItems: "center", gap: ".6rem",
        background: "#fff", border: "1.5px solid #e5e7eb", borderRadius: 10,
        padding: ".55rem .7rem", maxWidth: 240, boxSizing: "border-box",
        textDecoration: "none",
      }}
    >
      <span aria-hidden="true" style={{ fontSize: "1.3rem", flexShrink: 0 }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <div
          title={attachment.original_filename}
          style={{
            fontSize: ".82rem", fontWeight: 600, color: "#0b1e3d",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}
        >
          {attachment.original_filename}
        </div>
        <div style={{ fontSize: ".68rem", color: "#9ca3af" }}>
          {readableFileSize(attachment.byte_size)}
        </div>
      </div>
    </a>
  );
}
