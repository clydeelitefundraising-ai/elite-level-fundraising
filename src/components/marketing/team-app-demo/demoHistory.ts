// The demo's virtual location: the current screen's query string and its
// history entries. The real App Router keeps useSearchParams in step with
// window.history.pushState, and the To-Do List relies on that to open a
// task or the completion views; in the demo, twins that touch
// window.history get this one instead (through demoGlobals.ts's window),
// and demoRouter.tsx's useSearchParams reads it — so the iframe's own URL
// and the visitor's browser history are never changed.

type Entry = { search: string; state: unknown };

let entries: Entry[] = [{ search: "", state: null }];
let index = 0;
const changeListeners = new Set<() => void>();
const popListeners = new Set<() => void>();

function emit() {
  for (const fn of changeListeners) fn();
}

function searchOf(url: string | URL | null | undefined): string {
  if (url == null) return entries[index].search;
  const current = `https://demo.invalid/team/demo/screen${entries[index].search ? `?${entries[index].search}` : ""}`;
  try { return new URL(String(url), current).search.replace(/^\?/, ""); } catch { return entries[index].search; }
}

/** A new screen: its query string starts a fresh history. */
export function resetDemoLocation(search: string) {
  entries = [{ search, state: null }];
  index = 0;
  emit();
}

/** The current screen's query string, without "?". */
export function demoSearch(): string {
  return entries[index].search;
}

/** Subscribe to location changes (useSyncExternalStore). */
export function subscribeDemoLocation(fn: () => void): () => void {
  changeListeners.add(fn);
  return () => { changeListeners.delete(fn); };
}

/** window.history, for the twins (via demoGlobals.ts). */
export const demoHistory = {
  get state(): unknown { return entries[index].state; },
  get length(): number { return entries.length; },
  pushState(state: unknown, _title: string, url?: string | URL | null) {
    entries = [...entries.slice(0, index + 1), { search: searchOf(url), state }];
    index = entries.length - 1;
    emit();
  },
  replaceState(state: unknown, _title: string, url?: string | URL | null) {
    entries = entries.map((e, i) => (i === index ? { search: searchOf(url), state } : e));
    emit();
  },
  back() {
    if (index === 0) return;
    index -= 1;
    emit();
    for (const fn of popListeners) fn();
  },
  forward() {
    if (index >= entries.length - 1) return;
    index += 1;
    emit();
    for (const fn of popListeners) fn();
  },
  go(delta = 0) {
    if (delta < 0) for (let i = 0; i < -delta; i++) this.back();
    else for (let i = 0; i < delta; i++) this.forward();
  },
  scrollRestoration: "auto" as ScrollRestoration,
};

/** popstate listeners registered through demoGlobals.ts's window. */
export function addDemoPopStateListener(fn: () => void) { popListeners.add(fn); }
export function removeDemoPopStateListener(fn: () => void) { popListeners.delete(fn); }
