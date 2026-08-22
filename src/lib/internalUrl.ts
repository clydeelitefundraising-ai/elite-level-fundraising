// Phase 10: pure guard for push-notification tap routing (and anywhere
// else an app needs to navigate to a server-supplied path safely). Push
// payloads carry a `url` field built server-side from this app's own
// route structure (see src/lib/apns.ts), but a client should never trust
// that blindly as a navigation target — this enforces "same-origin
// relative path only", rejecting anything that could send the WebView
// off-app (an absolute URL, a scheme like javascript:/data:, or a
// protocol-relative //host trick).

export function isSafeInternalPath(url: unknown): url is string {
  if (typeof url !== "string" || !url) return false;
  if (!url.startsWith("/")) return false;   // must be relative to this app's own origin
  if (url.startsWith("//")) return false;   // protocol-relative URL trick (//evil.com)
  if (url.includes("\\")) return false;     // backslash can be browser-normalized to a scheme separator
  if (/^\/[a-z][a-z0-9+.-]*:/i.test(url)) return false; // e.g. "/javascript:alert(1)"
  return true;
}
