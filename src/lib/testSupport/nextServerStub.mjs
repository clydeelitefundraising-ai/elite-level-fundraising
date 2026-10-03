// Test-only stand-in for "next/server", used solely by nextStubLoader.mjs's
// module resolution hook. Never imported by production code.
//
// The real NextRequest/NextResponse are thin wrappers around the standard
// Fetch API Request/Response, and the route handlers tested via this stub
// only ever call standard Request methods (json/formData/headers/nextUrl)
// and NextResponse.json — so plain global Request/Response, plus a tiny
// nextUrl shim, cover everything actually exercised here.
function parseCookieHeader(header) {
  const map = new Map();
  if (!header) return map;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    map.set(part.slice(0, idx).trim(), part.slice(idx + 1).trim());
  }
  return map;
}

function serializeCookie(name, value, opts = {}) {
  const parts = [`${name}=${value}`];
  if (opts.path) parts.push(`Path=${opts.path}`);
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}

export class NextRequest extends Request {
  get nextUrl() {
    return new URL(this.url);
  }
  // Only .get() is exercised by routes tested via this stub (resolving the
  // caller's elf_session / team_member / team_coach cookie) — not the full
  // RequestCookies interface.
  get cookies() {
    const map = parseCookieHeader(this.headers.get("cookie"));
    return {
      get: name => (map.has(name) ? { name, value: map.get(name) } : undefined),
    };
  }
}

export class NextResponse extends Response {
  static json(data, init) {
    const res = new NextResponse(JSON.stringify(data), init);
    res.headers.set("content-type", "application/json");
    return res;
  }
  // Only .set() is exercised — appends a real Set-Cookie header so a test
  // can read it back via res.headers.get("set-cookie") the same way a
  // browser would, to simulate session continuity across calls.
  get cookies() {
    return {
      set: (name, value, opts) => {
        this.headers.append("set-cookie", serializeCookie(name, value, opts));
      },
    };
  }
}

// Test-only stand-in for next/server's after(): the real one defers a
// callback until the response has been sent, without the caller awaiting
// it. Tests have no "response already sent" moment to hook, so this just
// runs the callback immediately — close enough for routes (like
// /api/auth/join) that only use it for best-effort notification/push side
// effects already wrapped in their own try/catch.
export function after(fn) {
  void fn();
}
