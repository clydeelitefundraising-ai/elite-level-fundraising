// Phase 2.2A — ELF Community Partners data layer. Platform-wide advertising
// partners, managed exclusively by ELF Platform Admin. A separate system
// from BOTH `sponsors` (per-team, coach-managed) and the legacy
// `sponsor_businesses`/`sponsor_activities`/`sponsor_relationships` CRM —
// see phase_2_2a_community_partners.sql's own header comment for the full
// rationale. Every function here is server-only (service-role key via
// _client.ts) and is meant to be called only from
// /platform-admin/community-partners/* pages and
// /api/platform-admin/community-partners/* routes, both of which
// independently re-verify getPlatformAdminSession() before calling in.
import { restList, restInsert, restUpdate } from "./_client";

export type CommunityPartnerRow = {
  id:                string;
  business_name:     string;
  short_description: string | null;
  website_url:       string | null;
  logo_url:          string | null;
  is_active:         boolean;
  is_featured:       boolean;
  display_order:     number;
  // Phase 2.2D-1: one of the 20 numbered Home Screen advertising grid
  // positions this partner is permanently reserved for, or null when
  // unlocked (participates in Phase 2.2D-2's rotation pool instead — not
  // built yet). Independent of is_active: deactivating a partner does
  // NOT free its locked position (approved requirement — "do not
  // automatically reassign another partner's reserved position"); only
  // an explicit unlock (set to null) does.
  locked_position:   number | null;
  created_at:        string;
  updated_at:        string;
};

/** Pure — a well-formed, non-empty https:// URL. Deliberately stricter than
 *  the existing `sponsors.url` field (which accepts any non-blank string,
 *  a pre-existing gap this phase does not carry forward). http:// and every
 *  other scheme are rejected outright — a business website link must be
 *  secure. */
export function isValidHttpsUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    return new URL(trimmed).protocol === "https:";
  } catch {
    return false;
  }
}

export type CommunityPartnerFieldErrors = Partial<Record<"business_name" | "website_url" | "locked_position", string>>;

export type ValidatedCommunityPartnerFields = {
  business_name?:     string;
  short_description?: string | null;
  website_url?:       string | null;
  logo_url?:          string | null;
  is_active?:         boolean;
  is_featured?:        boolean;
  display_order?:      number;
  locked_position?:    number | null;
};

export type CommunityPartnerValidationResult =
  | { ok: true;  value: ValidatedCommunityPartnerFields }
  | { ok: false; errors: CommunityPartnerFieldErrors };

/** Single validator for both create (requireName: true — every field not
 *  present defaults sensibly) and update (requireName: false — only
 *  fields actually present in `input` are validated/returned, so a partial
 *  PATCH body never clobbers fields the caller didn't send). Every field
 *  is independently type-checked — a wrong-typed value is treated as
 *  absent, never coerced or trusted. */
export function validateCommunityPartnerFields(
  input: Record<string, unknown>,
  opts: { requireName: boolean },
): CommunityPartnerValidationResult {
  const errors: CommunityPartnerFieldErrors = {};
  const value: ValidatedCommunityPartnerFields = {};

  if (opts.requireName || "business_name" in input) {
    const name = typeof input.business_name === "string" ? input.business_name.trim() : "";
    if (!name) errors.business_name = "Business name is required.";
    else value.business_name = name;
  }

  if ("short_description" in input) {
    const raw = typeof input.short_description === "string" ? input.short_description.trim() : "";
    value.short_description = raw || null;
  }

  // Required only when present/non-blank — an absent or blank website_url
  // is valid (field is optional), but a non-blank value that isn't a
  // well-formed https:// URL is always rejected.
  if ("website_url" in input) {
    const raw = typeof input.website_url === "string" ? input.website_url.trim() : "";
    if (!raw) {
      value.website_url = null;
    } else if (!isValidHttpsUrl(raw)) {
      errors.website_url = "Website URL must be a valid https:// address.";
    } else {
      value.website_url = raw;
    }
  }

  // logo_url is never typed by a caller — it only ever arrives as the
  // trusted response of the logo-upload endpoint (our own bucket URL) —
  // so this only trims/nullifies, no format validation needed.
  if ("logo_url" in input) {
    const raw = typeof input.logo_url === "string" ? input.logo_url.trim() : "";
    value.logo_url = raw || null;
  }

  if ("is_active" in input && typeof input.is_active === "boolean") {
    value.is_active = input.is_active;
  }
  if ("is_featured" in input && typeof input.is_featured === "boolean") {
    value.is_featured = input.is_featured;
  }
  if ("display_order" in input && typeof input.display_order === "number" && Number.isFinite(input.display_order)) {
    value.display_order = Math.trunc(input.display_order);
  }

  // Phase 2.2D-1 — null explicitly unlocks (returns the partner to the
  // future rotation pool); 1-20 locks it to that grid position. Anything
  // else (wrong type, out of range, a fraction) is a validation error,
  // not silently ignored like the other optional numeric field above —
  // a position lock is a deliberate admin action with real consequences
  // (it blocks that slot for every other partner), so a malformed value
  // must never be quietly dropped and misread as "no change requested."
  if ("locked_position" in input) {
    const raw = input.locked_position;
    if (raw === null) {
      value.locked_position = null;
    } else if (typeof raw === "number" && Number.isInteger(raw) && raw >= 1 && raw <= 20) {
      value.locked_position = raw;
    } else {
      errors.locked_position = "Position must be a whole number from 1 to 20, or null to unlock.";
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value };
}

export async function listCommunityPartners(): Promise<CommunityPartnerRow[]> {
  return restList<CommunityPartnerRow>("community_partners?select=*&order=display_order.asc,created_at.asc");
}

export type ActiveCommunityPartner = Pick<
  CommunityPartnerRow,
  "id" | "business_name" | "short_description" | "website_url" | "logo_url" | "is_featured"
>;

// Phase 2.2C — the Team App's ONLY read of this table. Deliberately a
// separate query from listCommunityPartners() (the admin management list,
// which intentionally includes inactive/draft partners so an admin can
// manage them): `is_active=eq.true` is the actual security/business-rule
// boundary here, enforced in the query itself, not by filtering an
// over-fetched list after the fact. The selected columns are exactly the
// public-safe subset — no created_at/updated_at/display_order (admin-only
// management metadata) ever reaches a team member's browser.
export async function listActiveCommunityPartners(): Promise<ActiveCommunityPartner[]> {
  return restList<ActiveCommunityPartner>(
    "community_partners?is_active=eq.true&select=id,business_name,short_description,website_url,logo_url,is_featured&order=display_order.asc,created_at.asc",
  );
}

// Phase 2.2D-2 — a SEPARATE query from listActiveCommunityPartners()
// (deliberately — see communityPartnerRotation.ts's module header and
// the Phase 2.2D-2 architecture audit's "Data Access" decision). The Home
// Screen advertising grid needs locked_position (to honor reservations)
// and created_at (as the rotation algorithm's stable sort key for the
// unlocked pool) — neither of which the Partners tab's read selects or
// needs. created_at never reaches a client component: it's consumed
// entirely server-side by resolveGridSlots(), whose output type omits it.
// NOT ordered by display_order — the rotation algorithm derives its own
// order from created_at, per the explicit requirement that display_order
// must never influence Home Screen advertising placement.
export type GridCommunityPartner = Pick<
  CommunityPartnerRow,
  "id" | "business_name" | "short_description" | "website_url" | "logo_url" | "locked_position" | "created_at"
>;

// Phase 2.2D-3 — the Featured Partner banner's ONLY read. Deliberately a
// separate query from BOTH listActiveCommunityPartners() (the Partners
// tab) and listActiveCommunityPartnersForGrid() (the 20-position grid) —
// same "one function, one clear caller contract" convention this file
// already follows. Filters is_active AND is_featured at the query level
// (the actual eligibility boundary, not an app-layer filter over an
// over-fetched list). Selects created_at purely as pickFeaturedPartner()'s
// stable sort key — never forwarded to a client component, same pattern
// as GridCommunityPartner above. A featured partner may also appear in
// the 20-position grid (approved decision: these are independent
// placements) — this query neither knows nor cares about locked_position
// or the grid's rotation state.
export type FeaturedCommunityPartner = Pick<
  CommunityPartnerRow,
  "id" | "business_name" | "short_description" | "website_url" | "logo_url" | "created_at"
>;

export async function listFeaturedCommunityPartners(): Promise<FeaturedCommunityPartner[]> {
  return restList<FeaturedCommunityPartner>(
    "community_partners?is_active=eq.true&is_featured=eq.true&select=id,business_name,short_description,website_url,logo_url,created_at",
  );
}

export async function listActiveCommunityPartnersForGrid(): Promise<GridCommunityPartner[]> {
  return restList<GridCommunityPartner>(
    "community_partners?is_active=eq.true&select=id,business_name,short_description,website_url,logo_url,locked_position,created_at",
  );
}

/** Phase 2.2D-2 — EVERY currently-locked position, across ALL partners
 *  regardless of is_active. Deliberately not filtered to active-only:
 *  an inactive partner keeps its reservation (approved decision — never
 *  give a reserved position to another partner), so resolveGridSlots()
 *  needs to know that position is spoken for even though the partner
 *  holding it will never be rendered. Paired with
 *  listActiveCommunityPartnersForGrid() by the caller — see
 *  home/page.tsx and communityPartnerRotation.ts's resolveGridSlots()
 *  for how the two lists are used together. */
export async function listAllLockedPositions(): Promise<number[]> {
  const rows = await restList<{ locked_position: number }>(
    "community_partners?locked_position=not.is.null&select=locked_position",
  );
  return rows.map(r => r.locked_position);
}

export async function getCommunityPartner(id: string): Promise<CommunityPartnerRow | null> {
  const rows = await restList<CommunityPartnerRow>(
    `community_partners?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
  );
  return rows[0] ?? null;
}

/** Phase 2.2D-1 — a friendly pre-check before attempting a lock write, so
 *  the route can name the conflicting partner in its error (e.g. "Position
 *  7 is already locked to Riverside Hardware") instead of a generic
 *  failure. This is a courtesy only, never the safety boundary — the
 *  database's partial unique index is, and remains the final guard
 *  against a genuine race between two concurrent lock attempts (see
 *  updateCommunityPartner's caller, which still must handle a 23505 from
 *  the actual write even when this check found nothing). */
export async function findPartnerByLockedPosition(position: number): Promise<CommunityPartnerRow | null> {
  const rows = await restList<CommunityPartnerRow>(
    `community_partners?locked_position=eq.${encodeURIComponent(String(position))}&select=*&limit=1`,
  );
  return rows[0] ?? null;
}

/** New partners are always created inactive/not-featured/order-0,
 *  regardless of anything the caller's validated fields happened to
 *  include for those keys — Phase 2.2A's explicit "default new partners to
 *  inactive" requirement is enforced here, not left to the caller to
 *  remember. An admin activates/features/reorders a partner afterward via
 *  updateCommunityPartner, a separate, explicit action. */
export async function createCommunityPartner(
  fields: Pick<ValidatedCommunityPartnerFields, "business_name" | "short_description" | "website_url" | "logo_url">,
): Promise<CommunityPartnerRow> {
  const rows = await restInsert<CommunityPartnerRow>("community_partners", {
    business_name:      fields.business_name,
    short_description:  fields.short_description ?? null,
    website_url:        fields.website_url ?? null,
    logo_url:           fields.logo_url ?? null,
    is_active:          false,
    is_featured:        false,
    display_order:      0,
  });
  return rows[0];
}

export async function updateCommunityPartner(
  id: string,
  patch: ValidatedCommunityPartnerFields,
): Promise<CommunityPartnerRow> {
  const rows = await restUpdate<CommunityPartnerRow>(`community_partners?id=eq.${encodeURIComponent(id)}`, {
    ...patch,
    updated_at: new Date().toISOString(),
  });
  return rows[0];
}
