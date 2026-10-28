// Client-safe. No server-only imports.
//
// Phase T6 — Team -> Overview page: banner, Location card, About Our Team.
// Pure helpers shared by the Overview UI and the Head-Coach-only
// /api/team/[slug]/overview routes, so the browser and the server validate
// with exactly the same rules.

// ── Banner ───────────────────────────────────────────────────────────────

/** Upload size cap (input file). Phone photos are commonly 3–6MB. */
export const MAX_BANNER_BYTES = 8 * 1024 * 1024;

/** Same formats as the team logo (SVG excluded — see logoValidation.ts). */
export const ALLOWED_BANNER_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

/** Longest edge of the stored banner (fit inside, never upscaled) — sharp
 *  enough for a 2x desktop banner, small enough to load quickly. */
export const MAX_BANNER_WIDTH = 2400;

/** Smallest source we accept: anything narrower looks blurry stretched
 *  across a phone-width 16:9 banner. */
export const MIN_BANNER_WIDTH = 640;
export const MIN_BANNER_HEIGHT = 320;

export const BANNER_BUCKET = "team-branding-logos";

export function isAllowedBannerMimeType(type: string): boolean {
  return ALLOWED_BANNER_MIME_TYPES.has(type);
}

/** Storage prefix for one team's banners. Every banner object this
 *  feature writes or deletes lives under it. */
export function bannerPathPrefix(slug: string): string {
  return `${slug}/banner/`;
}

/** The storage object path of a stored banner URL — but only when that URL
 *  is a public URL in our bucket under THIS team's banner prefix. Anything
 *  else (another team's banner, a logo, an external URL) returns null, so a
 *  replace/remove can never delete an object it doesn't own. */
export function ownedBannerPath(url: string | null | undefined, supabaseUrl: string, slug: string): string | null {
  if (!url) return null;
  const publicBase = `${supabaseUrl}/storage/v1/object/public/${BANNER_BUCKET}/`;
  if (!url.startsWith(publicBase)) return null;
  const path = url.slice(publicBase.length);
  const prefix = bannerPathPrefix(slug);
  if (!path.startsWith(prefix)) return null;
  const file = path.slice(prefix.length);
  // One plain file name, no traversal or nesting.
  return /^[A-Za-z0-9._-]+$/.test(file) && !file.includes("..") ? path : null;
}

// ── About Our Team ───────────────────────────────────────────────────────

export const MAX_ABOUT_CHARS = 3000;

export type AboutResult = { ok: true; value: string | null } | { ok: false; error: string };

/** Normalizes line endings and trailing whitespace; keeps paragraphs and
 *  single line breaks exactly as typed. Empty -> null ("not written yet"). */
export function normalizeAbout(input: unknown): AboutResult {
  if (input === null) return { ok: true, value: null };
  if (typeof input !== "string") return { ok: false, error: "About text must be text." };
  const value = input
    .replace(/\r\n?/g, "\n")
    .split("\n").map(l => l.replace(/[ \t]+$/, "")).join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (value.length > MAX_ABOUT_CHARS) {
    return { ok: false, error: `About Our Team can be at most ${MAX_ABOUT_CHARS.toLocaleString("en-US")} characters.` };
  }
  return { ok: true, value: value || null };
}

/** Paragraphs for display — split on blank lines; single line breaks stay
 *  inside a paragraph (rendered with white-space: pre-line). Rendered as
 *  React text, never as HTML. */
export function aboutParagraphs(text: string | null | undefined): string[] {
  if (!text) return [];
  return text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
}

// ── Location ─────────────────────────────────────────────────────────────

export const MAX_STREET_CHARS = 120;
export const MAX_CITY_STATE_CHARS = 80;
export const MAX_ZIP_CHARS = 10;

export type LocationInput = { street: string; city_state: string; zip: string };
export type LocationPatch = { location_street: string | null; location: string; location_zip: string | null };
export type LocationResult = { ok: true; value: LocationPatch } | { ok: false; error: string };

const clean = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : null);

/** Validates the Location editor's three fields. `location` (city, state)
 *  is the existing team column — "" is allowed (it is NOT NULL today), the
 *  two new columns store null when blank. */
export function validateLocation(input: unknown): LocationResult {
  if (!input || typeof input !== "object") return { ok: false, error: "Location is required." };
  const o = input as Record<string, unknown>;
  const street = clean(o.street), cityState = clean(o.city_state), zip = clean(o.zip);
  if (street === null || cityState === null || zip === null) {
    return { ok: false, error: "Street, city/state and ZIP must be text." };
  }
  if (street.length > MAX_STREET_CHARS) return { ok: false, error: `Street address can be at most ${MAX_STREET_CHARS} characters.` };
  if (cityState.length > MAX_CITY_STATE_CHARS) return { ok: false, error: `City and state can be at most ${MAX_CITY_STATE_CHARS} characters.` };
  if (zip.length > MAX_ZIP_CHARS) return { ok: false, error: `ZIP code can be at most ${MAX_ZIP_CHARS} characters.` };
  if (zip && !/^[A-Za-z0-9][A-Za-z0-9 -]*$/.test(zip)) return { ok: false, error: "ZIP code can contain only letters, numbers, spaces and hyphens." };
  if (street && !cityState) return { ok: false, error: "Add the city and state for this address." };
  return { ok: true, value: { location_street: street || null, location: cityState, location_zip: zip || null } };
}

export type TeamLocationFields = {
  school_name?: string | null;
  location?: string | null;
  location_street?: string | null;
  location_zip?: string | null;
};
export type OrganizationAddress = { address?: string | null; city?: string | null; state?: string | null; zip?: string | null };

export type DisplayLocation = {
  lines: string[];
  source: "team" | "school" | "none";
  /** What the "Open in Maps" link searches for. */
  query: string;
};

const s = (v: string | null | undefined) => (v ?? "").trim();

/** Which address the Location card shows. The team's own address wins as
 *  soon as the Head Coach has added a street or ZIP; otherwise the school's
 *  organization address if it has a street; otherwise the team's existing
 *  city/state; otherwise the school's city/state. Never invents anything. */
export function resolveDisplayLocation(team: TeamLocationFields, org?: OrganizationAddress | null): DisplayLocation {
  const tStreet = s(team.location_street), tCity = s(team.location), tZip = s(team.location_zip);
  const oStreet = s(org?.address), oCityState = [s(org?.city), s(org?.state)].filter(Boolean).join(", "), oZip = s(org?.zip);
  const school = s(team.school_name);

  const build = (street: string, cityState: string, zip: string, source: "team" | "school"): DisplayLocation => {
    const line2 = [cityState, zip].filter(Boolean).join(" ");
    const lines = [street, line2].filter(Boolean);
    // City-only searches land on the city centre; leading with the school
    // name finds the campus instead.
    const query = [street ? "" : school, street, line2].filter(Boolean).join(", ");
    return { lines, source, query };
  };

  if (tStreet || tZip) return build(tStreet, tCity, tZip, "team");
  if (oStreet) return build(oStreet, oCityState, oZip, "school");
  if (tCity) return build("", tCity, "", "team");
  if (oCityState || oZip) return build("", oCityState, oZip, "school");
  return { lines: [], source: "none", query: "" };
}

/** Map-app link for an address, no API key or map service involved —
 *  Apple Maps on Apple devices, Google Maps everywhere else. */
export function mapsHref(query: string, apple: boolean): string {
  const q = encodeURIComponent(query);
  return apple ? `https://maps.apple.com/?q=${q}` : `https://www.google.com/maps/search/?api=1&query=${q}`;
}

// ── Banner text ──────────────────────────────────────────────────────────

/** "2027 Season" -> "2027 Season"; "Fall" -> "Fall Season"; "" -> "". */
export function seasonLabel(season: string | null | undefined): string {
  const v = s(season);
  if (!v) return "";
  return /\bseason\b/i.test(v) ? v : `${v} Season`;
}

export function initials(name: string | null | undefined): string {
  return s(name).split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]!.toUpperCase()).join("");
}

// ── Shell data ───────────────────────────────────────────────────────────

/** The team layout renders before the page's own membership check and hands
 *  `settings` to client components (TeamChrome, TeamHeader), so whatever is
 *  in it reaches the browser of anyone who opens the team URL. The Overview
 *  fields are only for the team's own members — the Overview page reads them
 *  itself — so the layout strips them first. */
export function withoutOverviewFields<T extends object>(settings: T): Omit<T, "team_banner_url" | "team_about" | "location_street" | "location_zip"> {
  const rest = { ...settings } as Record<string, unknown>;
  delete rest.team_banner_url;
  delete rest.team_about;
  delete rest.location_street;
  delete rest.location_zip;
  return rest as Omit<T, "team_banner_url" | "team_about" | "location_street" | "location_zip">;
}
