"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";

// iOS-safe body scroll lock. Plain `overflow:hidden` on body still allows
// rubber-band scroll-through on iOS Safari/WKWebView, so this pins body in
// place with position:fixed instead and restores the exact scroll offset
// on close. Modal is only ever rendered by its callers while open (every
// call site conditionally renders it from state, e.g. `{showAdd && <Modal
// .../>}`), so this component's mount/unmount cycle IS the open/close
// lifecycle — no separate `open` prop is needed, and the cleanup function
// below covers every close path (Cancel, backdrop tap, Escape, and a
// successful submit, since every call site closes via the same state
// update that unmounts this component).
function useBodyScrollLock() {
  useEffect(() => {
    const scrollY = window.scrollY;
    const body = document.body;
    const prev = {
      position: body.style.position,
      top:      body.style.top,
      left:     body.style.left,
      right:    body.style.right,
      width:    body.style.width,
    };

    body.style.position = "fixed";
    body.style.top      = `-${scrollY}px`;
    body.style.left     = "0";
    body.style.right    = "0";
    body.style.width    = "100%";

    return () => {
      body.style.position = prev.position;
      body.style.top      = prev.top;
      body.style.left     = prev.left;
      body.style.right    = prev.right;
      body.style.width    = prev.width;
      window.scrollTo(0, scrollY);
    };
  }, []);
}

// Blurs whatever input/textarea/select still has focus when the modal
// unmounts. A focused element yanked out of the DOM with no blur first is
// a known way to leave an iOS WKWebView's visual viewport stuck zoomed in
// after the on-screen keyboard's auto-zoom. Deliberately centralized here
// (not added to every feature's submit/cancel handler) since this effect's
// cleanup fires on every close path uniformly.
function useBlurOnUnmount() {
  useEffect(() => {
    return () => {
      (document.activeElement as HTMLElement | null)?.blur?.();
    };
  }, []);
}

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
  useBodyScrollLock();
  useBlurOnUnmount();

  // Desktop affordance — mirrors the existing backdrop-tap-to-close and X
  // button, which already call the same onClose. No focus trap here (out
  // of scope for this phase); this only adds a keyboard escape hatch.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Modal is only ever rendered client-side (every call site conditionally
  // renders it from state that starts closed), so document is always
  // available here — this guard is defensive only, not an SSR mount gate.
  if (typeof document === "undefined") return null;

  return createPortal(
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
    </div>,
    document.body,
  );
}
