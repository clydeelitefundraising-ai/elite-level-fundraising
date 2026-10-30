// Network guard for the isolated Team App demo (/preview/team-app).
//
// The demo renders real Team App presentation components with fictional,
// in-memory data. None of them should ever make a request on their own,
// but as defense in depth this guard is inlined as the first script of the
// demo page — it runs while the HTML is still parsing, before any app
// bundle executes — and replaces the page's request APIs:
//
//   allowed  same-origin GETs for static files (/_next/…, /marketing/…,
//            the ELF Team logo, the favicon) — the page's own bundles
//   blocked  everything else: /api/… and other app routes, any other
//            origin, any non-GET method, sendBeacon, WebSocket and
//            EventSource
//
// Blocked attempts are recorded on window.__ELF_DEMO_BLOCKED__ so the
// visual-validation run can assert that none happened.
//
// installDemoNetworkGuard is stringified into an inline <script>, so it
// must stay self-contained: no imports, no references to module scope.

export const DEMO_STATIC_PREFIXES = ["/_next/", "/marketing/", "/auth/ELF-team-logo-black.png", "/favicon"];

type GuardWindow = {
  location: { origin: string; href: string };
  fetch?: (input: unknown, init?: { method?: string }) => Promise<unknown>;
  XMLHttpRequest?: { prototype: { open: (...args: unknown[]) => unknown; send: (...args: unknown[]) => unknown } };
  navigator?: { sendBeacon?: (...args: unknown[]) => boolean };
  WebSocket?: unknown;
  EventSource?: unknown;
  console?: { warn: (...args: unknown[]) => void };
  __ELF_DEMO_BLOCKED__?: string[];
};

export function installDemoNetworkGuard(win: GuardWindow): void {
  const STATIC = ["/_next/", "/marketing/", "/auth/ELF-team-logo-black.png", "/favicon"];
  const blocked: string[] = (win.__ELF_DEMO_BLOCKED__ = win.__ELF_DEMO_BLOCKED__ || []);
  const allowed = (rawUrl: string, method: string): boolean => {
    let url: URL;
    try { url = new URL(rawUrl, win.location.href); } catch { return false; }
    if (url.origin !== win.location.origin) return false;
    if (method.toUpperCase() !== "GET") return false;
    return STATIC.some((p) => url.pathname.startsWith(p));
  };
  const deny = (what: string): void => {
    blocked.push(what);
    if (win.console) win.console.warn("[ELF demo] Blocked " + what + " — the demo never contacts the app or any server.");
  };

  if (win.fetch) {
    const realFetch = win.fetch;
    win.fetch = function (input: unknown, init?: { method?: string }) {
      const req = input as { url?: string; method?: string } | string;
      const url = typeof req === "string" ? req : req && typeof req.url === "string" ? req.url : String(req);
      const method = (init && init.method) || (typeof req === "object" && req && req.method) || "GET";
      if (!allowed(url, method)) {
        deny(method + " " + url);
        return Promise.reject(new TypeError("Network requests are disabled in the ELF demo."));
      }
      return realFetch.call(this, input, init);
    };
  }
  if (win.XMLHttpRequest) {
    const proto = win.XMLHttpRequest.prototype;
    const realOpen = proto.open;
    const realSend = proto.send;
    proto.open = function (this: { __elfDemoOk?: boolean; __elfDemoWhat?: string }, ...args: unknown[]) {
      const method = String(args[0] ?? "GET");
      const url = String(args[1] ?? "");
      this.__elfDemoOk = allowed(url, method);
      this.__elfDemoWhat = method + " " + url;
      return realOpen.apply(this, args);
    };
    proto.send = function (this: { __elfDemoOk?: boolean; __elfDemoWhat?: string }, ...args: unknown[]) {
      if (!this.__elfDemoOk) {
        deny("XHR " + (this.__elfDemoWhat ?? ""));
        throw new TypeError("Network requests are disabled in the ELF demo.");
      }
      return realSend.apply(this, args);
    };
  }
  if (win.navigator && win.navigator.sendBeacon) {
    win.navigator.sendBeacon = function (url: unknown) { deny("beacon " + String(url)); return false; };
  }
  for (const name of ["WebSocket", "EventSource"] as const) {
    if (win[name]) {
      win[name] = function (url: unknown) {
        deny(name + " " + String(url));
        throw new TypeError("Network connections are disabled in the ELF demo.");
      };
    }
  }
}

/** The inline script the demo page renders before anything else. */
export const DEMO_NETWORK_GUARD_SCRIPT = `(${installDemoNetworkGuard.toString()})(window);`;
