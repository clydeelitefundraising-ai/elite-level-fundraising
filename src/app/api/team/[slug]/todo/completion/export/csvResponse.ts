// Shared response helpers for the Phase 4 CSV export routes (not a route
// itself — Next only treats route.ts files as endpoints).
import { NextResponse } from "next/server";
import { getCampaignSettings } from "@/lib/supabase";
import {
  CompletionCsvError,
  buildCompletionCsv,
  buildCompletionCsvRows,
  completionCsvFilename,
  exportDate,
  type CompletionCsvInput,
} from "@/lib/teamTaskCompletionCsv";

export const REPORT_UNVERIFIED = "The report couldn't be created because the data couldn't be fully verified. Please try again.";
export const REPORT_TOO_LARGE = "This report is too large to download. Please contact ELF support.";

function jsonError(status: number, error: string, reason: string) {
  return NextResponse.json({ error, reason }, { status, headers: { "Cache-Control": "no-store" } });
}

/** Builds the CSV from verified inputs, or a JSON error — never a partial
 *  or unverified file. `taskTitle` (single-task report) goes in the
 *  filename; omit it for the all-tasks report. */
export async function completionCsvResponse(slug: string, inputs: CompletionCsvInput[], taskTitle?: string) {
  let csv: string;
  try {
    csv = buildCompletionCsv(buildCompletionCsvRows(inputs));
  } catch (err) {
    if (err instanceof CompletionCsvError && err.reason === "too_large") {
      return jsonError(413, REPORT_TOO_LARGE, "too_large");
    }
    console.error("[todo/completion/export] report refused:", err);
    return jsonError(503, REPORT_UNVERIFIED, "error");
  }
  // School and sport names are only used for the filename; the slug stands
  // in if they can't be read.
  const settings = await getCampaignSettings(slug).catch(() => null);
  const filename = completionCsvFilename({
    schoolName: settings?.school_name,
    sportName: settings?.sport_name,
    slug,
    taskTitle: taskTitle ?? null,
    date: exportDate(),
  });
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** A loader failure (unavailable, error, not found, archived) as JSON. */
export function exportFailure(reason: "unavailable" | "error" | "not_found" | "inactive") {
  if (reason === "not_found") return jsonError(404, "Not found.", reason);
  if (reason === "inactive") return jsonError(409, "This task is archived, so it isn't a current requirement.", reason);
  return jsonError(503, REPORT_UNVERIFIED, reason);
}
