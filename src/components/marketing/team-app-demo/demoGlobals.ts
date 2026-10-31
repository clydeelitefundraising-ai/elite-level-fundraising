// The browser globals a generated twin may touch, answered inside the demo.
//
// A twin is the real Team App component with only its import lines
// rewritten (scripts/marketing/generate-team-app-demo-twins.mjs). When the
// real component calls the app's API, shares, copies, confirms or prints,
// the generator adds ONE import line from this module — e.g.
//
//   import { fetch, navigator } from "./demoGlobals";
//
// — so those names inside the (unchanged) component body refer to these
// stand-ins instead of the browser's:
//
//   fetch      answered by the demo's in-memory API (demoApi.ts) — never the
//              network. Anything it doesn't handle gets a "Preview only"
//              error response, exactly as an unavailable API would.
//   navigator  share/clipboard show a "Preview only" notice; nothing is
//              shared or copied. Everything else reads the real navigator.
//   confirm    always "OK" (no browser dialog over the marketing page).
//   alert      shown as the demo's notice instead of a browser dialog.
//   window     history/location are the demo's virtual location
//              (demoHistory.ts); print/open show a notice; the rest is the
//              real window.

import {
  addDemoPopStateListener, demoHistory, demoSearch, removeDemoPopStateListener,
} from "./demoHistory.ts";

export type DemoRequest = {
  method: string;
  /** e.g. /api/team/<slug>/contacts */
  path: string;
  query: URLSearchParams;
  /** Parsed JSON body, a FormData, or null. */
  body: unknown;
};

export type DemoResponse = {
  status?: number;
  json?: unknown;
  text?: string;
  headers?: Record<string, string>;
};

export type DemoServer = {
  /** null = not something the demo answers. */
  handle: (req: DemoRequest) => DemoResponse | null;
  notify: (message: string) => void;
};

export const PREVIEW_NOT_AVAILABLE = "Preview only — this isn't available in the demo.";

let server: DemoServer | null = null;

/** Installs the demo's API for this run of the demo; returns the uninstaller. */
export function installDemoServer(next: DemoServer): () => void {
  server = next;
  return () => { if (server === next) server = null; };
}

export function demoNotify(message: string) {
  server?.notify(message);
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function toRequest(input: unknown, init?: { method?: string; body?: unknown }): DemoRequest {
  const raw = typeof input === "string" ? input
    : input instanceof URL ? input.href
    : input && typeof (input as { url?: unknown }).url === "string" ? (input as { url: string }).url
    : String(input);
  const url = new URL(raw, "https://demo.invalid");
  const method = (init?.method ?? "GET").toUpperCase();
  let body: unknown = null;
  if (typeof init?.body === "string") {
    try { body = JSON.parse(init.body); } catch { body = init.body; }
  } else if (init?.body != null) {
    body = init.body;
  }
  return { method, path: url.pathname, query: url.searchParams, body };
}

/** fetch, answered by the demo — never the network. */
export async function fetch(input: unknown, init?: { method?: string; body?: unknown; [key: string]: unknown }): Promise<Response> {
  const req = toRequest(input, init);
  await sleep(req.method === "GET" ? 60 : 220);
  const res = server?.handle(req) ?? null;
  if (!res) {
    demoNotify(PREVIEW_NOT_AVAILABLE);
    return new Response(JSON.stringify({ error: PREVIEW_NOT_AVAILABLE }), { status: 503, headers: { "Content-Type": "application/json" } });
  }
  const status = res.status ?? 200;
  if (res.text !== undefined) {
    return new Response(res.text, { status, headers: { "Content-Type": "text/plain; charset=utf-8", ...res.headers } });
  }
  return new Response(JSON.stringify(res.json ?? {}), { status, headers: { "Content-Type": "application/json", ...res.headers } });
}

const realNavigator = (): Navigator | undefined => (typeof globalThis.navigator === "undefined" ? undefined : globalThis.navigator);

/** navigator: sharing and copying are previews; everything else is real. */
export const navigator = {
  async share(): Promise<void> {
    demoNotify("Preview only — in the app this opens your phone's share sheet. Nothing was shared.");
  },
  canShare(): boolean {
    return true;
  },
  clipboard: {
    // Rejects, like a browser that refuses the copy: the real components
    // then leave their button as it was (never "Copied"), and the notice
    // says what happened.
    async writeText(): Promise<void> {
      demoNotify("Preview only — in the app this copies the link. Nothing was copied.");
      throw new DOMException("Copying is disabled in the ELF demo.", "NotAllowedError");
    },
  },
  get userAgent(): string { return realNavigator()?.userAgent ?? ""; },
  get language(): string { return realNavigator()?.language ?? "en-US"; },
} as unknown as Navigator;

/** confirm: always OK — the demo never opens a browser dialog. */
export function confirm(message?: string): boolean {
  void message;
  return true;
}

/** alert: shown as the demo's notice. */
export function alert(message?: unknown): void {
  demoNotify(String(message ?? ""));
}

const realWindow = (): (Window & typeof globalThis) | undefined =>
  (typeof globalThis.window === "undefined" ? undefined : globalThis.window);

const demoLocation = {
  get search(): string { const s = demoSearch(); return s ? `?${s}` : ""; },
  get pathname(): string { return "/team/demo/screen"; },
  get origin(): string { return realWindow()?.location.origin ?? ""; },
  get href(): string { return `${this.origin}${this.pathname}${this.search}`; },
  set href(value: string) { void value; demoNotify(PREVIEW_NOT_AVAILABLE); },
  assign() { demoNotify(PREVIEW_NOT_AVAILABLE); },
  replace() { demoNotify(PREVIEW_NOT_AVAILABLE); },
  reload() {},
};

const WINDOW_OVERRIDES: Record<string, unknown> = {
  history: demoHistory,
  location: demoLocation,
  print: () => demoNotify("Preview only — in the app this prints the report."),
  open: () => { demoNotify(PREVIEW_NOT_AVAILABLE); return null; },
  alert,
  confirm,
  fetch,
  navigator,
  addEventListener: (type: string, fn: EventListenerOrEventListenerObject, opts?: boolean | AddEventListenerOptions) => {
    if (type === "popstate") { addDemoPopStateListener(fn as () => void); return; }
    realWindow()?.addEventListener(type, fn, opts);
  },
  removeEventListener: (type: string, fn: EventListenerOrEventListenerObject, opts?: boolean | EventListenerOptions) => {
    if (type === "popstate") { removeDemoPopStateListener(fn as () => void); return; }
    realWindow()?.removeEventListener(type, fn, opts);
  },
};

/** window: the demo's history/location; print and open are previews. */
export const window = new Proxy({} as Window & typeof globalThis, {
  get(_target, prop) {
    if (typeof prop === "string" && prop in WINDOW_OVERRIDES) return WINDOW_OVERRIDES[prop];
    const w = realWindow();
    if (!w) return undefined;
    const value = Reflect.get(w, prop);
    return typeof value === "function" ? value.bind(w) : value;
  },
  set(_target, prop, value) {
    if (prop === "location") { demoNotify(PREVIEW_NOT_AVAILABLE); return true; }
    const w = realWindow();
    if (w) Reflect.set(w, prop, value);
    return true;
  },
  has(_target, prop) {
    const w = realWindow();
    return (typeof prop === "string" && prop in WINDOW_OVERRIDES) || (!!w && prop in w);
  },
});
