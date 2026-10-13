// Phase 2.2B — School-Wide ELF Community Partners Advertising Toggle.
//
// One boolean per school (organizations.show_community_partners), read and
// written only by /api/platform-admin/schools/[id]/advertising, which
// independently re-verifies getPlatformAdminSession() before calling in —
// same contract as communityPartners.ts. Deliberately its own file rather
// than added to schools.ts: schools.ts is a read-only aggregate/directory
// layer (counts, head coaches, donation totals) with no write path; this
// file is a narrow, single-setting read+write, kept separate so neither
// grows unrelated surface area.
import { restList, restUpdate } from "./_client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pure — same shape as calendarSubscription.ts's UUID check. Guards every
 *  lookup below against a malformed id ever reaching a PostgREST filter. */
export function isValidOrganizationId(id: unknown): id is string {
  return typeof id === "string" && UUID_RE.test(id);
}

export type SchoolAdvertisingSetting = {
  id:                      string;
  school_name:             string;
  show_community_partners: boolean;
  // Phase 2.2E-2 — a SEPARATE, independent toggle from
  // show_community_partners above. That one governs the authenticated
  // Team App (Home Screen grid + Partners tab); this one governs the
  // UNAUTHENTICATED public fundraising campaign page. Deliberately two
  // columns, not one shared boolean — ELF can enable advertising in one
  // surface without the other, for any given school. Must NEVER be read
  // as a gate for a team's own permanent presenting sponsor (a future
  // phase, not built yet) — only for ELF-controlled platform advertising.
  show_community_partners_public: boolean;
};

/** Null for a malformed id, a well-formed id with no matching row, or (pre-
 *  migration) a missing show_community_partners/show_community_partners_public
 *  column — restList() never throws on a PostgREST "column does not exist"
 *  error, it returns [], which this treats identically to "not found"
 *  rather than crashing the caller. The route layer is responsible for
 *  telling those cases apart for its own error message if it needs to. */
export async function getSchoolAdvertisingSetting(id: string): Promise<SchoolAdvertisingSetting | null> {
  if (!isValidOrganizationId(id)) return null;
  const rows = await restList<SchoolAdvertisingSetting>(
    `organizations?id=eq.${encodeURIComponent(id)}&select=id,school_name,show_community_partners,show_community_partners_public&limit=1`,
  );
  return rows[0] ?? null;
}

export type SchoolAdvertisingPatch = {
  show_community_partners?:        boolean;
  show_community_partners_public?: boolean;
};

/** Writes ONLY the fields present in `patch` (+ updated_at) — every other
 *  organizations column (branding, address, AD contact, etc.) is untouched
 *  no matter what a caller passes in, unlike the legacy
 *  /api/admin/organization route this deliberately does not reuse. Either
 *  field may be updated independently of the other — they are
 *  intentionally unrelated settings that happen to live on the same row.
 *  Throws RestError on failure (same contract as every other
 *  platform/_client.ts write) — the route layer decides the HTTP response. */
export async function setSchoolAdvertisingSetting(
  id: string,
  patch: SchoolAdvertisingPatch,
): Promise<SchoolAdvertisingSetting> {
  const rows = await restUpdate<SchoolAdvertisingSetting>(`organizations?id=eq.${encodeURIComponent(id)}`, {
    ...patch,
    updated_at: new Date().toISOString(),
  });
  return rows[0];
}
