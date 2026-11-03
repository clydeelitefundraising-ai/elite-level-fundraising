// Organization Center (/admin/organization) — the rules shared by the page
// and its API routes. Pure (no I/O) so routes and tests use one definition.
//
// The Center used to edit "the" school: every read and write resolved
// organizations?select=…&limit=1, a leftover from when ELF had a single
// school. With many schools that picked an arbitrary row. Every request
// now names the school explicitly (organizationId), and the profile save
// accepts only the fields this page edits — never id/slug/created_at,
// never the platform-controlled advertising flag, never anything else a
// client might send.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A well-formed organizations.id, or null. */
export function organizationIdParam(value: unknown): string | null {
  return typeof value === "string" && UUID_RE.test(value) ? value.toLowerCase() : null;
}

const MAX_TEXT = 2000;

/** Exactly the columns the Organization Center's Profile and Defaults
 *  sections save, with their types. */
export const ORG_TEXT_FIELDS = [
  "school_name", "nickname", "logo_url", "primary_color", "secondary_color", "default_team_photo_url",
  "address", "city", "state", "zip", "website", "short_description",
  "athletic_director", "athletic_director_email", "athletic_director_phone", "default_layout",
] as const;
export const ORG_INT_FIELDS = [
  "default_fundraising_goal_cents", "default_athlete_goal_cents", "default_contact_goal", "default_campaign_length_days",
] as const;
export const ORG_BOOL_FIELDS = [
  "default_show_leaderboard", "default_show_program_identity", "default_show_share_section", "default_show_fund_uses",
  "default_show_recent_donations", "default_show_sponsors", "default_show_donation_card",
] as const;

export type OrgPatchResult =
  | { ok: true; patch: Record<string, string | number | boolean>; fields: string[] }
  | { ok: false; error: string };

/** The allowed, type-checked subset of a profile/defaults save. Unknown
 *  keys are ignored (the client sends its whole section); a known key
 *  with the wrong type refuses the save. */
export function pickEditableOrgFields(body: unknown): OrgPatchResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "Invalid request." };
  const src = body as Record<string, unknown>;
  const patch: Record<string, string | number | boolean> = {};
  for (const k of ORG_TEXT_FIELDS) {
    if (!(k in src)) continue;
    const v = src[k];
    if (typeof v !== "string" || v.length > MAX_TEXT) return { ok: false, error: `Invalid value for ${k}.` };
    patch[k] = k === "school_name" ? v.trim() : v;
  }
  for (const k of ORG_INT_FIELDS) {
    if (!(k in src)) continue;
    const v = src[k];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 1_000_000_000) return { ok: false, error: `Invalid value for ${k}.` };
    patch[k] = v;
  }
  for (const k of ORG_BOOL_FIELDS) {
    if (!(k in src)) continue;
    const v = src[k];
    if (typeof v !== "boolean") return { ok: false, error: `Invalid value for ${k}.` };
    patch[k] = v;
  }
  if ("school_name" in patch && patch.school_name === "") return { ok: false, error: "School name can't be empty." };
  const fields = Object.keys(patch);
  if (fields.length === 0) return { ok: false, error: "Nothing to save." };
  return { ok: true, patch, fields };
}

export type OrgPickerRow = {
  id: string;
  slug: string;
  school_name: string;
  city: string;
  state: string;
  team_count: number;
};

/** "Monroe Valley High School — Phoenix, AZ"; the legacy unnamed row is
 *  labelled rather than shown blank. */
export function organizationLabel(o: { school_name: string; city?: string | null; state?: string | null; slug: string }): string {
  const name = o.school_name.trim() || `Unnamed record (${o.slug})`;
  const place = [o.city?.trim(), o.state?.trim()].filter(Boolean).join(", ");
  return place ? `${name} — ${place}` : name;
}

/** Name, city or state contains the query (case-insensitive). */
export function filterOrganizations<T extends { school_name: string; city: string; state: string; slug: string }>(rows: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...rows];
  return rows.filter(o => [o.school_name, o.city, o.state, o.slug].some(v => (v ?? "").toLowerCase().includes(q)));
}

/** Named schools A→Z, then unnamed legacy rows. */
export function sortOrganizations<T extends { school_name: string; slug: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const an = a.school_name.trim(), bn = b.school_name.trim();
    if (!an !== !bn) return an ? -1 : 1;
    return an.localeCompare(bn, "en", { sensitivity: "base" }) || a.slug.localeCompare(b.slug);
  });
}
