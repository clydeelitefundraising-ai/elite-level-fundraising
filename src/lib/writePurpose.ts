// Complete Season Phase 2 — the purpose header for writes that must still
// reach a completed (read-only) season: personal-data removal during
// account deletion, and moderation removals. The database guard
// (phase_s2_completed_season_read_only.sql) reads it from PostgREST's
// request.headers and accepts only removal-shaped changes with it. Never
// sent for ordinary edits. Only the server holds the service-role key, so
// only the server can send it.
export const WRITE_PURPOSE_HEADER = "x-elf-write-purpose";
export type WritePurpose = "account_deletion" | "moderation";

export function writePurposeHeaders(purpose: WritePurpose): Record<string, string> {
  return { [WRITE_PURPOSE_HEADER]: purpose };
}
