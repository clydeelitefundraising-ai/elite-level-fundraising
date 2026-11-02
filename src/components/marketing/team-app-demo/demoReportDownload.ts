// The demo's stand-in for team/reportDownload.ts, for the generated
// ReportDownloadButton twin. The real module also imports the installed
// app's native bridges (Capacitor, push registration), which the demo must
// never load — so the parts the button uses are copied here VERBATIM
// (teamAppDemoTeam.test.ts compares them with the real file): the messages,
// the error class and fetchCsvReport, which reads the report through the
// demo's in-memory API (built with the app's own buildCompletionCsv) and
// checks it exactly as in the app. Only delivery differs: instead of a
// browser download or the phone's share sheet, a "Preview only" notice
// names the file.

import { demoNotify, fetch } from "./demoGlobals";

export type DeliveryResult = "saved" | "shared" | "cancelled" | "downloaded" | "needs_tap";

// ── Copied from reportDownload.ts ───────────────────────────────────────────

export class ReportDownloadError extends Error {}

export const REPORT_MESSAGES = {
  forbidden:   "You don't have permission to download this report.",
  notFound:    "This task isn't on the To-Do List anymore.",
  archived:    "This task was archived, so it can't be exported.",
  tooLarge:    "This report is too large to download. Please contact ELF support.",
  unverified:  "The report couldn't be created because the data couldn't be fully verified. Please try again.",
  network:     "Couldn't reach ELF. Check your connection and try again.",
  unexpected:  "The report couldn't be downloaded. Please try again.",
  shareFailed: "Couldn't open the Save/Share options on this device. Please try again.",
  stillNeedsTap: "Your device didn't open the Save/Share options. Tap Save CSV to try again.",
} as const;

/** A failed export response (always JSON from the server) -> a plain message. */
export function reportErrorMessage(status: number): string {
  if (status === 401 || status === 403) return REPORT_MESSAGES.forbidden;
  if (status === 404) return REPORT_MESSAGES.notFound;
  if (status === 409) return REPORT_MESSAGES.archived;
  if (status === 413) return REPORT_MESSAGES.tooLarge;
  return REPORT_MESSAGES.unverified;
}

/** The server's Content-Disposition filename (filename* preferred), kept
 *  only if it is a plain .csv name; otherwise the fallback. */
export function reportFilename(contentDisposition: string | null, fallback: string): string {
  let name: string | null = null;
  const star = contentDisposition?.match(/filename\*=UTF-8''([^;]+)/i);
  if (star) {
    try { name = decodeURIComponent(star[1].trim()); } catch { name = null; }
  }
  if (!name) name = contentDisposition?.match(/filename="?([^";]+)"?/i)?.[1]?.trim() ?? null;
  return name && /^[A-Za-z0-9._-]{1,200}\.csv$/.test(name) ? name : fallback;
}

const BOM = [0xef, 0xbb, 0xbf];

/** Fetches the report. Resolves to the CSV file (exact bytes, BOM kept);
 *  throws ReportDownloadError with a plain message otherwise — never a
 *  file made from an error response. */
export async function fetchCsvReport(url: string, fallbackName: string, fetchImpl: typeof fetch = fetch): Promise<File> {
  let res: Response;
  try {
    res = await fetchImpl(url, { cache: "no-store", credentials: "same-origin" });
  } catch {
    throw new ReportDownloadError(REPORT_MESSAGES.network);
  }
  if (!res.ok) throw new ReportDownloadError(reportErrorMessage(res.status));
  if (!/^text\/csv\b/i.test(res.headers.get("content-type") ?? "")) throw new ReportDownloadError(REPORT_MESSAGES.unexpected);
  let bytes: ArrayBuffer;
  try {
    bytes = await res.arrayBuffer();
  } catch {
    throw new ReportDownloadError(REPORT_MESSAGES.network);
  }
  const head = new Uint8Array(bytes, 0, Math.min(3, bytes.byteLength));
  if (head.length < 3 || BOM.some((b, i) => head[i] !== b)) throw new ReportDownloadError(REPORT_MESSAGES.unexpected);
  return new File([bytes], reportFilename(res.headers.get("content-disposition"), fallbackName), { type: "text/csv;charset=utf-8" });
}

// ── The demo's delivery ─────────────────────────────────────────────────────

/** In place of the browser download / share sheet: a notice. */
export async function deliverReport(file: File): Promise<DeliveryResult> {
  demoNotify(`Preview only — in the app this saves “${file.name}”. Nothing is downloaded in this demo.`);
  return "downloaded";
}
