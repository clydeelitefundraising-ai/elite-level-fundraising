// Shared client-side download helper for authenticated file/export
// endpoints (Team Files, Analytics CSV exports, Contacts CSV export).
//
// Root cause this replaces: a plain <a href="/api/..."> (with or without
// target="_blank") to an authenticated API route. Inside the installed
// Capacitor iOS/Android app, that either hands the request to a separate
// browsing context that doesn't carry the app's session cookie (401), or
// — even when it does work — navigates the WebView itself in-place to the
// raw response with no back/close affordance. `fetch()` from inside the
// app is a normal same-origin request and always carries cookies; the fix
// is to fetch the bytes in JS and hand them to the user via
// shareFileOrFallback (Web Share API with files, already proven for QR/
// signup-sheet/calendar-print sharing — see nativeFileShare.ts), which
// opens the native "Save to Files / Share" sheet on iOS/Android and falls
// back to a normal <a download> blob click on desktop/browser.
import { shareFileOrFallback } from "./nativeFileShare";

function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  const starMatch = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (starMatch) {
    try { return decodeURIComponent(starMatch[1]); } catch { /* fall through */ }
  }
  const plainMatch = header.match(/filename="?([^";]+)"?/i);
  return plainMatch ? plainMatch[1] : null;
}

export async function fetchFileBlob(url: string): Promise<{ blob: Blob; filename: string | null }> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Download failed (${res.status}).`);
  }
  const blob = await res.blob();
  return { blob, filename: filenameFromContentDisposition(res.headers.get("Content-Disposition")) };
}

function fallbackAnchorDownload(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
}

// Fetches `url` (an authenticated same-origin API route) and hands the
// result to the user via the native share sheet, falling back to a
// standard browser download. Throws with a user-presentable message on
// failure — callers should catch and surface `err.message`.
export async function downloadViaFetch(url: string, filenameHint?: string): Promise<void> {
  const { blob, filename } = await fetchFileBlob(url);
  const finalName = filenameHint ?? filename ?? "download";
  const file = new File([blob], finalName, { type: blob.type || "application/octet-stream" });
  await shareFileOrFallback(file, () => fallbackAnchorDownload(blob, finalName));
}
