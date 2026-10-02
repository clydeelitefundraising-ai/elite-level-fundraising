// Authoritative bulk-write step for roster import. Deliberately does NOT do
// a single raw array POST to the athletes table (that's the onboarding
// starter_athletes pattern, which bypasses collision checking entirely — see
// the Roster Import audit). Instead this calls the same canonical
// createAthlete() used by the single-add admin UI, once per row, in
// sequence.
//
// Sequential + createAthlete's own fresh restList() read before each insert
// means intra-batch duplicates are caught for free: row 2 of a batch with
// the same normalized name as row 1 collides against row 1's just-inserted
// record, exactly as if an admin had added them one at a time. No separate
// "already-imported-earlier-in-this-batch" bookkeeping is needed.
import { createAthlete } from "../athletes.ts";

export type BulkImportRowInput = {
  rowNumber:         number; // echoed back in results for the UI to correlate
  name:              string;
  class_year:        string;
  event?:            string | null;
  overrideCollision?: boolean; // the admin's explicit "Import Anyway" choice for this row
};

export type BulkImportRowResult =
  | { status: "created"; rowNumber: number; athleteId: string; name: string; class_year: string | null; event: string | null }
  | { status: "skipped"; rowNumber: number; reason: string }
  | { status: "failed";  rowNumber: number; reason: string };

export type BulkImportResult = {
  created: number;
  skipped: number;
  failed:  number;
  results: BulkImportRowResult[];
};

export async function bulkImportAthletes(
  campaignSlug: string,
  rows: BulkImportRowInput[],
): Promise<BulkImportResult> {
  const results: BulkImportRowResult[] = [];

  for (const row of rows) {
    try {
      const outcome = await createAthlete(
        { campaignSlug, name: row.name, classYear: row.class_year, event: row.event ?? null },
        { overrideCollision: row.overrideCollision === true },
      );

      if (outcome.ok) {
        results.push({
          status:     "created",
          rowNumber:  row.rowNumber,
          athleteId:  outcome.athlete.id,
          name:       outcome.athlete.name,
          class_year: outcome.athlete.class_year,
          event:      outcome.athlete.event,
        });
      } else if (outcome.reason === "collision") {
        results.push({
          status: "skipped",
          rowNumber: row.rowNumber,
          reason: `Already exists as "${outcome.collision.existing.name}" — not imported.`,
        });
      } else {
        results.push({ status: "failed", rowNumber: row.rowNumber, reason: outcome.message });
      }
    } catch (err) {
      results.push({
        status: "failed",
        rowNumber: row.rowNumber,
        reason: err instanceof Error ? err.message : "Failed to create athlete.",
      });
    }
  }

  return {
    created: results.filter(r => r.status === "created").length,
    skipped: results.filter(r => r.status === "skipped").length,
    failed:  results.filter(r => r.status === "failed").length,
    results,
  };
}
