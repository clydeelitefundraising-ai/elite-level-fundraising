"use client";

import type { ReactNode } from "react";

export default function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title:    string;
  onClose:  () => void;
  children: ReactNode;
  footer?:  ReactNode;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(5,15,35,.55)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left))",
        animation: "elf-backdropIn .18s ease both",
      } as React.CSSProperties}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#fff",
        borderRadius: 18,
        width: "100%",
        maxWidth: 480,
        // dvh (not vh) so this shrinks with the visual viewport when the
        // on-screen keyboard opens, instead of running under it.
        maxHeight: "min(90vh, 90dvh)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        boxShadow: "0 8px 40px rgba(0,0,0,.22), 0 0 0 1px rgba(0,0,0,.06)",
        animation: "elf-modalIn .24s cubic-bezier(.25,.46,.45,.94) both",
      }}>
        {/* Handle bar */}
        <div style={{
          display: "flex",
          justifyContent: "center",
          paddingTop: ".75rem",
          paddingBottom: ".25rem",
          flexShrink: 0,
        }}>
          <div style={{ width: 36, height: 4, background: "#e5e7eb", borderRadius: 100 }} />
        </div>

        {/* Header — always visible */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: ".5rem 1.25rem .875rem",
          borderBottom: "1px solid #f3f4f6",
          flexShrink: 0,
        }}>
          <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 800, color: "#0b1e3d", letterSpacing: "-.01em" }}>
            {title}
          </h3>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: "50%", background: "#f3f4f6",
              border: "none", cursor: "pointer", fontSize: ".8rem", color: "#6b7280",
              display: "flex", alignItems: "center", justifyContent: "center",
              lineHeight: 1, flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>

        {/* Scrollable content area */}
        <div style={{
          padding: "1.25rem",
          flex: 1,
          overflowY: "auto",
          minHeight: 0,
        }}>
          {children}
        </div>

        {/* Sticky footer — rendered only when provided */}
        {footer && (
          <div style={{
            padding: ".75rem 1.25rem 1.25rem",
            borderTop: "1px solid #f3f4f6",
            flexShrink: 0,
            background: "#fff",
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
