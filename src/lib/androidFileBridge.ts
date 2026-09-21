import { Capacitor } from "@capacitor/core";

// Android-only bridge to MainActivity's AndroidFileBridge (window.ElfAndroidFiles).
// The Android WebView has no download manager, no Web Share API and no PDF
// renderer, so exports/attachments are handed to native code, which writes
// them to the app cache and launches the system share sheet / a viewer app.
// Everything here is inert on iOS and in browsers (isAndroidNativeApp() is
// false), which keep their existing paths.

export type AndroidBridgeErrorCode =
  | "bridge_unavailable"
  | "no_handler"
  | "forbidden_origin"
  | "empty_data"
  | "too_large"
  | "bad_mime"
  | "bad_data"
  | "io_error"
  | "launch_failed";

export class AndroidFileBridgeError extends Error {
  code: AndroidBridgeErrorCode | string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "AndroidFileBridgeError";
    this.code = code;
  }
}

type BridgeResult = { ok: true; fileName?: string } | { ok: false; error: string };

type ElfAndroidFiles = {
  saveAndShare(base64: string, fileName: string, mimeType: string): string;
  openWithViewer(base64: string, fileName: string, mimeType: string): string;
};

declare global {
  interface Window {
    ElfAndroidFiles?: ElfAndroidFiles;
  }
}

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "application/pdf",
  "text/csv",
  "text/calendar",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/octet-stream",
]);
const EXTENSION_FOR_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "text/csv": "csv",
  "text/calendar": "ics",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

const USER_MESSAGES: Record<string, string> = {
  bridge_unavailable: "File sharing isn't available in this version of the app. Please update the app.",
  no_handler: "No app is installed that can open this file. Try saving or sharing it instead.",
  forbidden_origin: "This page isn't allowed to share files.",
  empty_data: "The file is empty.",
  too_large: "This file is too large to share from the app.",
  bad_mime: "This file type isn't supported.",
  bad_data: "The file couldn't be read.",
  io_error: "The file couldn't be prepared. Please try again.",
  launch_failed: "Couldn't open the share sheet. Please try again.",
};

/** True only inside the installed Android app (never iOS, never a browser). */
export function isAndroidNativeApp(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

/** Mirrors AndroidFileBridge.sanitizeFileName so callers can predict the name. */
export function sanitizeFileName(raw: string | null | undefined, mimeType?: string): string {
  let name = (raw ?? "").toString();
  const slash = Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\"));
  if (slash >= 0) name = name.slice(slash + 1);
  name = name.replace(/[^A-Za-z0-9._ -]/g, "_");
  name = name.replace(/\.{2,}/g, ".");
  name = name.replace(/^[. ]+/, "").trim();
  if (name.length > 100) {
    const dot = name.lastIndexOf(".");
    const ext = dot > 0 && name.length - dot <= 10 ? name.slice(dot) : "";
    name = name.slice(0, 100 - ext.length) + ext;
  }
  if (!name) name = "file";
  if (!name.includes(".")) {
    const ext = mimeType ? EXTENSION_FOR_MIME[normalizeMimeType(mimeType) ?? ""] : undefined;
    if (ext) name = `${name}.${ext}`;
  }
  return name;
}

/**
 * Lower-cases, strips parameters ("; charset=utf-8") and validates the type.
 * Returns null for malformed input; well-formed types outside the allowlist
 * collapse to application/octet-stream (never trust an arbitrary type).
 */
export function normalizeMimeType(raw: string | null | undefined): string | null {
  const base = (raw ?? "").toString().split(";")[0].trim().toLowerCase();
  if (base === "") return "application/octet-stream";
  if (!/^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/.test(base)) return null;
  return ALLOWED_MIME.has(base) ? base : "application/octet-stream";
}

export function isPdf(mimeType: string | null | undefined, fileName?: string | null): boolean {
  if (normalizeMimeType(mimeType) === "application/pdf") return true;
  return /\.pdf$/i.test(fileName ?? "");
}

/** Parses the bridge's JSON reply; anything unparseable is a failure, never a silent success. */
export function resultFromJson(json: unknown): BridgeResult {
  if (typeof json !== "string") return { ok: false, error: "io_error" };
  try {
    const parsed = JSON.parse(json) as { ok?: unknown; error?: unknown; fileName?: unknown };
    if (parsed && parsed.ok === true) {
      return typeof parsed.fileName === "string" ? { ok: true, fileName: parsed.fileName } : { ok: true };
    }
    return { ok: false, error: typeof parsed?.error === "string" && parsed.error ? parsed.error : "io_error" };
  } catch {
    return { ok: false, error: "io_error" };
  }
}

export function userMessageForError(code: string): string {
  return USER_MESSAGES[code] ?? "The file couldn't be shared. Please try again.";
}

/** Chunked so large files don't overflow the argument limit of String.fromCharCode. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(binary);
}

async function callBridge(
  method: "saveAndShare" | "openWithViewer",
  blob: Blob,
  fileName: string,
  mimeType: string | undefined,
): Promise<void> {
  const bridge = typeof window !== "undefined" ? window.ElfAndroidFiles : undefined;
  if (!bridge || typeof bridge[method] !== "function") {
    throw new AndroidFileBridgeError("bridge_unavailable", userMessageForError("bridge_unavailable"));
  }
  if (blob.size === 0) throw new AndroidFileBridgeError("empty_data", userMessageForError("empty_data"));
  if (blob.size > MAX_BYTES) throw new AndroidFileBridgeError("too_large", userMessageForError("too_large"));

  const mime = normalizeMimeType(mimeType || blob.type);
  if (mime === null) throw new AndroidFileBridgeError("bad_mime", userMessageForError("bad_mime"));

  const base64 = await blobToBase64(blob);
  const result = resultFromJson(bridge[method](base64, sanitizeFileName(fileName, mime), mime));
  if (!result.ok) throw new AndroidFileBridgeError(result.error, userMessageForError(result.error));
}

/** Opens the Android share sheet (which also offers Save to Files/Drive). */
export function saveAndShareOnAndroid(blob: Blob, fileName: string, mimeType?: string): Promise<void> {
  return callBridge("saveAndShare", blob, fileName, mimeType);
}

/** Opens the file in an installed viewer (PDF reader, gallery, ...). */
export function openWithViewerOnAndroid(blob: Blob, fileName: string, mimeType?: string): Promise<void> {
  return callBridge("openWithViewer", blob, fileName, mimeType);
}

/** Message to show for any error thrown while sharing/opening on Android. */
export function androidErrorMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : "The file couldn't be shared. Please try again.";
}
