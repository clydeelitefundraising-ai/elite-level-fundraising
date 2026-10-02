import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { campaignExists } from "@/lib/platform/campaigns";
import { parseCsv } from "@/lib/platform/import/csvParse";
import { parseXlsx } from "@/lib/platform/import/xlsxParse";
import { mapHeaders, buildCandidates, annotateDuplicates, NoNameColumnError } from "@/lib/platform/import/rosterCandidates";
import { getExistingAthleteInfo } from "@/lib/platform/import/existingAthletes";

export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — same ceiling as logo-upload
const MAX_DATA_ROWS = 1000;        // expected workload is 100–300; this leaves generous headroom without risking a serverless timeout

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get("elf_admin")?.value);
}

export async function POST(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  const campaignSlug = form.get("campaign_slug");

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "A roster file is required." }, { status: 400 });
  }
  if (typeof campaignSlug !== "string" || !campaignSlug.trim()) {
    return NextResponse.json({ error: "campaign_slug is required." }, { status: 400 });
  }
  if (!await campaignExists(campaignSlug.trim())) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (ext === "xls") {
    return NextResponse.json(
      { error: "Legacy .xls files aren't supported. Please re-save as .xlsx or .csv." },
      { status: 415 },
    );
  }
  if (ext !== "csv" && ext !== "xlsx") {
    return NextResponse.json({ error: "Unsupported file type. Please upload a .csv or .xlsx file." }, { status: 415 });
  }

  const mime = file.type.toLowerCase();
  const CSV_MIMES  = ["text/csv", "application/vnd.ms-excel", "application/csv", "text/plain", "application/octet-stream", ""];
  const XLSX_MIMES = ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream", "application/zip", ""];
  if (ext === "csv" && mime && !CSV_MIMES.includes(mime)) {
    return NextResponse.json({ error: `File content type "${file.type}" doesn't match a .csv file.` }, { status: 415 });
  }
  if (ext === "xlsx" && mime && !XLSX_MIMES.includes(mime)) {
    return NextResponse.json({ error: `File content type "${file.type}" doesn't match a .xlsx file.` }, { status: 415 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 5MB)." }, { status: 413 });
  }
  if (buf.byteLength === 0) {
    return NextResponse.json({ error: "The uploaded file is empty." }, { status: 400 });
  }

  let rows: string[][];
  let worksheetName: string | null = null;

  try {
    if (ext === "csv") {
      rows = parseCsv(buf.toString("utf-8"));
    } else {
      const parsed = await parseXlsx(buf);
      rows = parsed.rows;
      worksheetName = parsed.worksheetName;
    }
  } catch {
    return NextResponse.json({ error: "Failed to read the uploaded file. It may be corrupted or in an unsupported format." }, { status: 422 });
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "No data found in the uploaded file." }, { status: 400 });
  }

  const [headerRow, ...dataRows] = rows;

  if (dataRows.length === 0) {
    return NextResponse.json({ error: "The file has a header row but no athlete rows." }, { status: 400 });
  }
  if (dataRows.length > MAX_DATA_ROWS) {
    return NextResponse.json(
      { error: `This file has ${dataRows.length} rows, which exceeds the ${MAX_DATA_ROWS}-row import limit. Please split it into smaller files.` },
      { status: 400 },
    );
  }

  let mapping;
  try {
    mapping = mapHeaders(headerRow);
  } catch (err) {
    if (err instanceof NoNameColumnError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    throw err;
  }

  const rawCandidates = buildCandidates(dataRows, mapping);
  const existing = await getExistingAthleteInfo(campaignSlug.trim());
  const candidates = annotateDuplicates(rawCandidates, existing);

  const counts = {
    total:             candidates.length,
    ready:             candidates.filter(c => c.status === "ready").length,
    possibleDuplicate: candidates.filter(c => c.status === "possible_duplicate").length,
    needsReview:       candidates.filter(c => c.status === "needs_review").length,
    invalid:           candidates.filter(c => c.status === "invalid").length,
  };

  return NextResponse.json({ worksheetName, candidates, counts });
}
