import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { campaignExists } from "@/lib/platform/campaigns";
import { bulkImportAthletes, type BulkImportRowInput } from "@/lib/platform/import/bulkImportAthletes";
import { logAuditEvent, ADMIN_TOOL_ACTOR, ipOf } from "@/lib/auditLog";

export const dynamic = "force-dynamic";

const MAX_ROWS = 1000;

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get("elf_admin")?.value);
}

type IncomingRow = {
  rowNumber?:         unknown;
  name?:              unknown;
  class_year?:        unknown;
  event?:             unknown;
  overrideCollision?: unknown;
};

// The server re-validates every field from scratch — the client payload
// (even though it originated from our own parse/review step) is never
// trusted as already-correct. This mirrors the same required-field rule
// createAthlete() and POST /api/admin/athletes already enforce.
function toValidatedRow(input: IncomingRow, fallbackRowNumber: number): BulkImportRowInput | { error: string; rowNumber: number } {
  const rowNumber = typeof input.rowNumber === "number" ? input.rowNumber : fallbackRowNumber;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const classYear = typeof input.class_year === "string" ? input.class_year.trim() : "";
  const event = typeof input.event === "string" ? input.event.trim() : "";

  if (!name || !classYear) {
    return { error: "name and class are required", rowNumber };
  }

  return {
    rowNumber,
    name,
    class_year: classYear,
    event: event || null,
    overrideCollision: input.overrideCollision === true,
  };
}

export async function POST(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { campaign_slug, rows } = body as { campaign_slug?: unknown; rows?: unknown };

  if (typeof campaign_slug !== "string" || !campaign_slug.trim()) {
    return NextResponse.json({ error: "campaign_slug is required." }, { status: 400 });
  }
  const slug = campaign_slug.trim();
  if (!await campaignExists(slug)) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "No rows to import." }, { status: 400 });
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `Too many rows (max ${MAX_ROWS} per import).` }, { status: 400 });
  }

  const validRows: BulkImportRowInput[] = [];
  const rejected: { rowNumber: number; reason: string }[] = [];

  rows.forEach((raw, idx) => {
    const result = toValidatedRow((raw ?? {}) as IncomingRow, idx + 1);
    if ("error" in result) rejected.push({ rowNumber: result.rowNumber, reason: result.error });
    else validRows.push(result);
  });

  const outcome = validRows.length > 0
    ? await bulkImportAthletes(slug, validRows)
    : { created: 0, skipped: 0, failed: 0, results: [] };

  // Rows that failed server-side re-validation (missing name/class) count as
  // failures in the summary, even though they never reached createAthlete().
  const combinedResults = [
    ...outcome.results,
    ...rejected.map(r => ({ status: "failed" as const, rowNumber: r.rowNumber, reason: r.reason })),
  ].sort((a, b) => a.rowNumber - b.rowNumber);

  const created = outcome.created;
  const skipped = outcome.skipped;
  const failed  = outcome.failed + rejected.length;

  // Summary only — never the roster contents (names/classes/events) or any
  // donor/contact data.
  logAuditEvent({
    actor: ADMIN_TOOL_ACTOR,
    action:        "athletes.roster_imported",
    entity_type:   "campaign",
    campaign_slug: slug,
    summary:       `Roster import for ${slug}: ${created} created, ${skipped} skipped (duplicates), ${failed} failed, out of ${rows.length} submitted rows.`,
    new_value:     { created, skipped, failed, submitted: rows.length },
    ip_address:    ipOf(req),
    user_agent:    req.headers.get("user-agent"),
  });

  return NextResponse.json({ created, skipped, failed, results: combinedResults });
}
