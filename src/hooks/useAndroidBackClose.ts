"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    __elfHasOpenOverlay?: () => boolean;
  }
}

// Shared overlay stack backing MainActivity.java's Android back-button
// contract (see AccountMenu.tsx, the original — and until now, only —
// caller of this contract): the native shell asks window.__elfHasOpenOverlay()
// before deciding what system Back should do, and if it's true, dispatches
// "elfAndroidBackButton" instead of navigating/backgrounding the app.
//
// A stack (not a single flag) because some surfaces CAN legitimately have
// more than one of these overlay components mounted at once — e.g.
// ThreadView.tsx tracks reportingUser/reportingMessageId/reportingAttachmentId
// and blockingUser as independent state, so more than one ReportModal/
// BlockUserModal instance's effect could in principle be registered
// concurrently. Back must close only the topmost (most recently opened)
// overlay, matching standard back-stack behavior, not an arbitrary one.
const overlayStack: Array<() => void> = [];
let listenerAttached = false;

function handleAndroidBack() {
  const top = overlayStack[overlayStack.length - 1];
  top?.();
}

function ensureListener() {
  if (listenerAttached) return;
  window.addEventListener("elfAndroidBackButton", handleAndroidBack);
  listenerAttached = true;
}

/**
 * Pure registration primitive behind useAndroidBackClose, exported
 * separately so its stack/ordering semantics can be unit-tested directly
 * (this repo has no jsdom/React Testing Library harness to render the
 * hook through an actual component). Not meant to be called from
 * components directly — use the hook below.
 *
 * Pushes `onClose` onto the overlay stack and returns an unregister
 * function that pops it back off. Safe to call unregister more than once
 * or out of order — it removes this exact callback wherever it sits.
 */
export function registerAndroidBackOverlay(onClose: () => void): () => void {
  ensureListener();
  overlayStack.push(onClose);
  window.__elfHasOpenOverlay = () => overlayStack.length > 0;

  return () => {
    const idx = overlayStack.lastIndexOf(onClose);
    if (idx !== -1) overlayStack.splice(idx, 1);
    window.__elfHasOpenOverlay = () => overlayStack.length > 0;
  };
}

/**
 * Registers `onClose` as the handler for Android's hardware/system Back
 * button for as long as `enabled` is true. Most callers (Modal.tsx and the
 * standalone confirmation modals) mount their overlay component only while
 * open, so the default `enabled=true` makes mount/unmount double as
 * open/close — no separate flag needed there, mirroring Modal.tsx's own
 * lifecycle assumption. A component that stays mounted and toggles its own
 * open state instead (e.g. AccountMenu's dropdown) passes that state in as
 * `enabled` directly, matching its previous inline effect's `[open]` guard.
 *
 * No-op on iOS/web/PWA: window.__elfHasOpenOverlay and "elfAndroidBackButton"
 * are read/dispatched only by the Android-native MainActivity.java bridge —
 * nothing elsewhere ever calls or listens for them, so registering here is
 * inert everywhere except inside the Android Capacitor WebView.
 */
export function useAndroidBackClose(onClose: () => void, enabled: boolean = true) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!enabled) return;
    return registerAndroidBackOverlay(() => onCloseRef.current());
  }, [enabled]);
}
