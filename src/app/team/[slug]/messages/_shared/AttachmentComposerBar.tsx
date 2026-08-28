"use client";

import { readableFileSize } from "./attachmentClient";
import type { SelectedAttachment } from "./useSelectedAttachments";

function kindIcon(kind: SelectedAttachment["kind"]): string {
  if (kind === "video") return "🎥";
  if (kind === "image") return "📷";
  return "📎";
}

/** The selected-but-not-yet-sent attachment chip strip, shared by the
 *  thread reply composer and the new-conversation composer. Chips wrap
 *  onto additional rows on narrow screens rather than scrolling
 *  horizontally (no horizontal-scroll pattern exists elsewhere in this
 *  app's mobile UI, and this keeps every chip fully visible without a
 *  hidden edge). Long filenames are truncated with an ellipsis + a
 *  native title tooltip rather than being allowed to break the chip's
 *  fixed width. */
export default function AttachmentComposerBar({
  selected,
  onRemove,
  disabled,
  selectionError,
}: {
  selected: SelectedAttachment[];
  onRemove: (localId: string) => void;
  disabled?: boolean;
  selectionError: string | null;
}) {
  if (selected.length === 0 && !selectionError) return null;

  return (
    <div style={{ marginBottom: ".5rem" }}>
      {selected.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: ".45rem", marginBottom: selectionError ? ".35rem" : 0 }}>
          {selected.map(item => (
            <div
              key={item.localId}
              style={{
                display:      "flex",
                alignItems:   "center",
                gap:          ".45rem",
                background:   "#fff",
                border:       `1.5px solid ${item.status === "error" ? "#fecaca" : "#e5e7eb"}`,
                borderRadius: 10,
                padding:      ".3rem .4rem",
                maxWidth:     220,
                boxSizing:    "border-box",
              }}
            >
              {item.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- local blob preview, not a remote/optimizable image
                <img
                  src={item.previewUrl}
                  alt=""
                  style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 6, flexShrink: 0 }}
                />
              ) : (
                <span aria-hidden="true" style={{ fontSize: "1.1rem", flexShrink: 0 }}>{kindIcon(item.kind)}</span>
              )}

              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  title={item.file.name}
                  style={{
                    fontSize: ".72rem", fontWeight: 600, color: "#374151",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}
                >
                  {item.file.name}
                </div>
                <div style={{ fontSize: ".62rem", color: item.status === "error" ? "#dc2626" : "#9ca3af" }}>
                  {item.status === "uploading" && "Uploading…"}
                  {item.status === "uploaded" && "Ready"}
                  {item.status === "error" && (item.error ?? "Upload failed")}
                  {item.status === "pending" && readableFileSize(item.file.size)}
                </div>
              </div>

              <button
                type="button"
                onClick={() => onRemove(item.localId)}
                disabled={disabled}
                aria-label={`Remove ${item.file.name}`}
                style={{
                  background: "none", border: "none", color: "#9ca3af",
                  fontSize: ".95rem", lineHeight: 1, cursor: disabled ? "default" : "pointer",
                  padding: ".15rem", flexShrink: 0,
                }}
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {selectionError && (
        <div role="alert" style={{ fontSize: ".72rem", color: "#dc2626" }}>
          {selectionError}
        </div>
      )}
    </div>
  );
}
