// "Create new school" from School Links — the pure rules (no I/O), unit
// tested: input validation, duplicate detection and the slug that makes a
// concurrent duplicate impossible.
//
// Duplicate policy (no fuzzy matching):
//   - names compare by their normalized key (slugifyOrganizationName: case,
//     spacing and punctuation ignored) — against every school's name AND its
//     slug, so hand-written slugs from the original backfill count too;
//   - same key + same city + same state  -> duplicate, never created;
//   - same key, different place           -> allowed only after the admin
//     confirms it's a different school (two "Lincoln High School"s are real).
// Concurrency: the slug is derived only from (name[, city, state]), so two
// simultaneous creates of the same school produce the same slug and the
// existing UNIQUE(slug) constraint lets exactly one through. No random
// suffixes here (unlike team onboarding), so a lost race is reported as a
// duplicate instead of silently creating a second record.
import { slugifyOrganizationName } from "@/lib/teamProvisioning/organization";
import { US_STATES } from "./usStates";
import { LEGACY_PLACEHOLDER_ORG_SLUG } from "@/lib/organizationCenter";

export { US_STATES };

/** The original single-school seed row — never a real school (same rule
 *  as the Organization Center picker). */
export const DEFAULT_ORG_SLUG = LEGACY_PLACEHOLDER_ORG_SLUG;

export type NewSchoolInput = { school_name: string; city: string; state: string };
export type ExistingSchool = { id: string; slug: string; school_name: string; city: string | null; state: string | null };

const clean = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max + 1) : "";

export type ValidationResult =
  | { ok: true; value: NewSchoolInput; acknowledgeSimilar: boolean }
  | { ok: false; field: "school_name" | "city" | "state"; error: string };

export function validateNewSchool(body: unknown): ValidationResult {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const school_name = clean(b.school_name, 120);
  const city = clean(b.city, 80);
  const state = clean(b.state, 2).toUpperCase();
  if (school_name.length < 2) return { ok: false, field: "school_name", error: "Enter the school's name." };
  if (school_name.length > 120) return { ok: false, field: "school_name", error: "School name is too long (120 characters max)." };
  if (!/[a-z0-9]/i.test(school_name)) return { ok: false, field: "school_name", error: "Enter the school's name." };
  if (!city) return { ok: false, field: "city", error: "Enter the city." };
  if (city.length > 80) return { ok: false, field: "city", error: "City is too long (80 characters max)." };
  if (!(US_STATES as readonly string[]).includes(state)) return { ok: false, field: "state", error: "Choose a state." };
  return { ok: true, value: { school_name, city, state }, acknowledgeSimilar: b.acknowledgeSimilar === true };
}

/** Comparison key: case, spacing and punctuation ignored ("Apollo H.S." =
 *  "apollo hs"). Used only to compare; new slugs keep the onboarding
 *  convention (slugifyOrganizationName). */
export const schoolKey = (name: string) => slugifyOrganizationName(name.replace(/[.'’`]/g, ""));
const placeKey = (city: string | null | undefined, state: string | null | undefined) =>
  `${(city ?? "").trim().toLowerCase().replace(/\s+/g, " ")}|${(state ?? "").trim().toUpperCase()}`;

export type DuplicateCheck =
  | { kind: "none" }
  | { kind: "duplicate"; existing: ExistingSchool }
  | { kind: "similar"; similar: ExistingSchool[] };

export function checkDuplicates(input: NewSchoolInput, schools: ExistingSchool[]): DuplicateCheck {
  const key = schoolKey(input.school_name);
  const slugKey = slugifyOrganizationName(input.school_name);
  const sameName = schools.filter(s =>
    s.slug !== DEFAULT_ORG_SLUG && (schoolKey(s.school_name) === key || s.slug === key || s.slug === slugKey));
  const exact = sameName.find(s => placeKey(s.city, s.state) === placeKey(input.city, input.state));
  if (exact) return { kind: "duplicate", existing: exact };
  if (sameName.length > 0) return { kind: "similar", similar: sameName };
  return { kind: "none" };
}

/** The slug to insert: the name alone when no school shares the name (and
 *  it isn't the reserved seed slug); otherwise name + city + state. */
export function slugForNewSchool(input: NewSchoolInput, sameNameExists: boolean): string {
  const name = slugifyOrganizationName(input.school_name) || "school";
  const withPlace = slugifyOrganizationName(`${input.school_name} ${input.city} ${input.state}`).slice(0, 80) || name;
  return sameNameExists || name === DEFAULT_ORG_SLUG ? withPlace : name;
}
