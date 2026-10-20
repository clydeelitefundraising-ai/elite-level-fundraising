"use client";

// Team Management Phase 5-4 — protects unsaved attendance while the coach
// is on the attendance screen. Only active while there are unsaved
// changes; otherwise it does nothing at all.
//
//   Links inside ELF   A capture-phase click listener stops same-origin
//                      link navigations (Next <Link> and plain <a>) and
//                      asks Stay / Discard; Discard then navigates with the
//                      app router. Modified clicks (new tab), downloads and
//                      other origins are left alone.
//   Back / swipe-back  One extra history entry for the SAME url is added
//                      while guarding (Next.js's pushState patch copies its
//                      router state onto it). Going back lands on the
//                      page's own entry — nothing changes on screen — and
//                      asks Stay / Discard. Discard goes back past both.
//                      The extra entry is removed again when the changes
//                      are saved or discarded on this screen.
//   Reload / close     The browser's own beforeunload prompt, where the
//                      browser supports one.
// No new navigation mechanism: ELF's links and router are untouched. The
// extra entry is tracked here (not in history.state, which Next.js may
// rewrite on refresh).
import { useEffect, useRef } from "react";

export type LinkClick = {
  href: string | null;
  target: string | null;
  download: boolean;
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
};

/** The in-app URL a click would navigate to (to confirm first), or null
 *  when the click should be left to the browser. */
export function guardedNavigationTarget(click: LinkClick, currentHref: string): string | null {
  if (click.defaultPrevented || click.button !== 0) return null;
  if (click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return null;
  if (click.download || (click.target && click.target !== "_self")) return null;
  if (!click.href) return null;
  let dest: URL, here: URL;
  try {
    here = new URL(currentHref);
    dest = new URL(click.href, here);
  } catch {
    return null;
  }
  if (dest.origin !== here.origin) return null;
  if (dest.protocol !== "http:" && dest.protocol !== "https:") return null;
  // Same page, only the #fragment differs: not leaving.
  if (dest.pathname === here.pathname && dest.search === here.search) return null;
  return dest.pathname + dest.search + dest.hash;
}

export type GuardRequest = { kind: "href"; href: string } | { kind: "back" };

/** The minimal history/window surface the guard uses (tests pass a fake). */
export type GuardHost = {
  pushSameUrl(): void;
  go(delta: number): void;
  onPopState(fn: () => void): () => void;
};

/** The guard's history bookkeeping, separate from React so it can be tested. */
export function createHistoryGuard(host: GuardHost) {
  let extraEntry = false;
  let bypass = false;
  let active = false;
  let onRequest: (req: GuardRequest) => void = () => {};
  let unlisten: (() => void) | null = null;

  const listen = () => {
    unlisten ??= host.onPopState(() => {
      if (bypass || !active) return;
      // Back moved off the extra entry onto this same page: put it back
      // (the coach is still here) and ask.
      extraEntry = false;
      host.pushSameUrl();
      extraEntry = true;
      onRequest({ kind: "back" });
    });
  };

  return {
    setOnRequest(fn: (req: GuardRequest) => void) { onRequest = fn; },
    activate() {
      active = true;
      bypass = false;
      listen();
      if (!extraEntry) { host.pushSameUrl(); extraEntry = true; }
    },
    /** Changes saved or discarded while staying: remove the extra entry. */
    release() {
      active = false;
      if (extraEntry && !bypass) {
        extraEntry = false;
        bypass = true;
        // The resulting popstate is ours; stop ignoring after it.
        const stop = host.onPopState(() => { bypass = false; stop(); });
        host.go(-1);
      }
    },
    /** After Discard on Back: leave past the extra entry and this page. */
    leaveBack() {
      active = false;
      bypass = true;
      host.go(extraEntry ? -2 : -1);
      extraEntry = false;
    },
    /** After Discard on a link. Returns "replace" when the extra entry is
     *  the current one: navigating with replace puts the new page in its
     *  place, so Back from there returns here exactly once. */
    leaveTo(): "push" | "replace" {
      active = false;
      bypass = true;
      const mode = extraEntry ? "replace" : "push";
      extraEntry = false;
      return mode;
    },
    dispose() {
      active = false;
      unlisten?.();
      unlisten = null;
    },
    get state() { return { extraEntry, bypass, active }; },
  };
}

function browserHost(): GuardHost {
  return {
    pushSameUrl: () => window.history.pushState({ elfAttendanceGuard: true }, "", window.location.href),
    go: delta => window.history.go(delta),
    onPopState: fn => {
      window.addEventListener("popstate", fn);
      return () => window.removeEventListener("popstate", fn);
    },
  };
}

/** Install the guard while `active`. onRequest is called instead of
 *  leaving; the caller shows Stay / Discard and, on Discard, calls the
 *  returned leave(). */
export function useUnsavedChangesGuard(active: boolean, onRequest: (req: GuardRequest) => void) {
  const guardRef = useRef<ReturnType<typeof createHistoryGuard> | null>(null);
  const onRequestRef = useRef(onRequest);
  useEffect(() => { onRequestRef.current = onRequest; }, [onRequest]);

  useEffect(() => {
    const guard = createHistoryGuard(browserHost());
    guard.setOnRequest(req => onRequestRef.current(req));
    guardRef.current = guard;
    return () => { guard.dispose(); guardRef.current = null; };
  }, []);

  useEffect(() => {
    const guard = guardRef.current;
    if (!guard) return;
    if (!active) { guard.release(); return; }
    guard.activate();

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Some browsers still require returnValue to be set.
      e.returnValue = "";
    };

    const onClick = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!(el instanceof HTMLAnchorElement)) return;
      const href = guardedNavigationTarget({
        href: el.getAttribute("href"),
        target: el.getAttribute("target"),
        download: el.hasAttribute("download"),
        button: e.button,
        metaKey: e.metaKey, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey,
        defaultPrevented: e.defaultPrevented,
      }, window.location.href);
      if (!href) return;
      // Capture phase on document: runs before React's handlers (and
      // Next <Link>'s), so the navigation never starts.
      e.preventDefault();
      e.stopPropagation();
      onRequestRef.current({ kind: "href", href });
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [active]);

  /** After Discard: go where the coach asked. */
  return function leave(req: GuardRequest, navigate: (href: string, mode: "push" | "replace") => void) {
    const guard = guardRef.current;
    if (req.kind === "back") {
      if (guard) guard.leaveBack();
      else window.history.back();
    } else {
      navigate(req.href, guard ? guard.leaveTo() : "push");
    }
  };
}
