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

export type CommunityPartnerFieldErrors = Partial<Record<"business_name" | "website_url", string>>;

export type ValidatedCommunityPartnerFields = {
  business_name?:     string;
  short_description?: string | null;
  website_url?:       string | null;
  logo_url?:          string | null;
  is_active?:         boolean;
  is_featured?:        boolean;
  display_order?:      number;
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

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value };
}

export async function listCommunityPartners(): Promise<CommunityPartnerRow[]> {
  return restList<CommunityPartnerRow>("community_partners?select=*&order=display_order.asc,created_at.asc");
}

export async function getCommunityPartner(id: string): Promise<CommunityPartnerRow | null> {
  const rows = await restList<CommunityPartnerRow>(
    `community_partners?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
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
