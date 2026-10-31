// The demo's stand-in for the app's file helpers — _components/fileDownload.ts
// (fetchFileBlob, downloadViaFetch) and _components/nativeFileShare.ts
// (shareFileOrFallback) — with the same signatures, for the generated twins
// that import them. Nothing is downloaded, shared or saved:
//
//   fetchFileBlob       reads through the demo's in-memory API (e.g. the
//                       Athlete Report the coach can View), exactly like the
//                       real helper reads the app's API;
//   downloadViaFetch    shows a "Preview only" notice naming the file;
//   shareFileOrFallback shows a "Preview only" notice naming the file —
//                       neither the share sheet nor a download runs.

import { demoNotify, fetch } from "./demoGlobals";

/** fileDownload.ts fetchFileBlob — same errors, from the demo's API. */
export async function fetchFileBlob(url: string): Promise<{ blob: Blob; filename: string | null }> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Download failed (${res.status}).`);
  }
  return { blob: await res.blob(), filename: null };
}

/** fileDownload.ts downloadViaFetch — a notice instead of a download. */
export async function downloadViaFetch(url: string, filenameHint?: string): Promise<void> {
  const name = filenameHint ?? (/\/analytics\/export\/donations/.test(url) ? "the donations report" : /\/analytics\/export\/athletes/.test(url) ? "the athlete report" : "this file");
  demoNotify(`Preview only — in the app this downloads ${name.startsWith("the ") || name === "this file" ? name : `“${name}”`}. Nothing is downloaded in this demo.`);
}

/** nativeFileShare.ts shareFileOrFallback — a notice; neither the share
 *  sheet nor the fallback download runs. */
export async function shareFileOrFallback(file: File, fallback: () => void): Promise<void> {
  void fallback;
  demoNotify(`Preview only — in the app this saves or shares “${file.name}”. Nothing is downloaded in this demo.`);
}
