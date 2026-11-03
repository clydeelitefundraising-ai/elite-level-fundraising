// New Campaign wizard — which of the selected school's Organization Center
// defaults a new campaign starts with. Pure (client-safe, no I/O), unit
// tested.
//
// Rules (Phase 1, approved):
//   - Only the fields below are inherited — the school's identity (name,
//     city, state, nickname as mascot) and its Organization Center campaign
//     defaults the wizard already offered (branding, goals, layout, page
//     sections). Address, website, athletic-director contact, description,
//     team photo and campaign length are school facts or unused by the
//     wizard, so they are not copied. Community Partner advertising stays on
//     the school and is only displayed (partnerVisibility).
//   - A field the administrator edited is never overwritten — not on the
//     first selection and not when the school changes.
//   - Every untouched field is recomputed from the NEWLY selected school, or
//     from the neutral ELF value when that school has nothing configured, so
//     nothing is ever carried over from a previously selected school.

export type SchoolDefaultsRow = {
  school_name?: string | null;
  city?: string | null;
  state?: string | null;
  nickname?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  logo_url?: string | null;
  default_layout?: string | null;
  default_fundraising_goal_cents?: number | null;
  default_athlete_goal_cents?: number | null;
  default_contact_goal?: number | null;
  default_show_leaderboard?: boolean | null;
  default_show_program_identity?: boolean | null;
  default_show_share_section?: boolean | null;
  default_show_fund_uses?: boolean | null;
  default_show_recent_donations?: boolean | null;
  default_show_sponsors?: boolean | null;
  default_show_donation_card?: boolean | null;
  show_community_partners?: boolean | null;
  show_community_partners_public?: boolean | null;
};

/** The wizard fields a school can supply, with their wizard value types. */
export type InheritableValues = {
  school_name: string;
  city: string;
  state: string;
  mascot: string;
  primary_color: string;
  secondary_color: string;
  logo_url: string;
  goal_dollars: string;
  default_athlete_goal_dollars: string;
  contact_goal: string;
  layout_variant: "classic" | "premium";
  show_donation_card: boolean;
  show_leaderboard: boolean;
  show_program_identity: boolean;
  show_share_section: boolean;
  show_fund_uses: boolean;
  show_recent_donations: boolean;
  show_sponsors: boolean;
};
export type InheritableField = keyof InheritableValues;

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const text = (v: string | null | undefined) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const dollars = (cents: number | null | undefined) => (typeof cents === "number" && cents > 0 ? String(cents / 100) : undefined);
const bool = (v: boolean | null | undefined) => (typeof v === "boolean" ? v : undefined);

/** What the school itself configures — a field is absent when the school
 *  has no usable value for it (then the neutral ELF value applies). */
export function schoolProvided(org: SchoolDefaultsRow): Partial<InheritableValues> {
  const out: Partial<InheritableValues> = {
    school_name:                  text(org.school_name),
    city:                         text(org.city),
    state:                        text(org.state)?.toUpperCase().slice(0, 2),
    mascot:                       text(org.nickname),
    primary_color:                HEX_RE.test(org.primary_color ?? "") ? org.primary_color! : undefined,
    secondary_color:              HEX_RE.test(org.secondary_color ?? "") ? org.secondary_color! : undefined,
    logo_url:                     text(org.logo_url),
    goal_dollars:                 dollars(org.default_fundraising_goal_cents),
    default_athlete_goal_dollars: dollars(org.default_athlete_goal_cents),
    contact_goal:                 typeof org.default_contact_goal === "number" && org.default_contact_goal > 0 ? String(org.default_contact_goal) : undefined,
    layout_variant:               org.default_layout === "premium" || org.default_layout === "classic" ? org.default_layout : undefined,
    show_donation_card:           bool(org.default_show_donation_card),
    show_leaderboard:             bool(org.default_show_leaderboard),
    show_program_identity:        bool(org.default_show_program_identity),
    show_share_section:           bool(org.default_show_share_section),
    show_fund_uses:               bool(org.default_show_fund_uses),
    show_recent_donations:        bool(org.default_show_recent_donations),
    show_sponsors:                bool(org.default_show_sponsors),
  };
  for (const k of Object.keys(out) as InheritableField[]) if (out[k] === undefined) delete out[k];
  return out;
}

export const INHERITABLE_FIELDS: readonly InheritableField[] = [
  "school_name", "city", "state", "mascot",
  "primary_color", "secondary_color", "logo_url",
  "goal_dollars", "default_athlete_goal_dollars", "contact_goal",
  "layout_variant", "show_donation_card", "show_leaderboard", "show_program_identity",
  "show_share_section", "show_fund_uses", "show_recent_donations", "show_sponsors",
];

/** Apply a school's defaults to the untouched fields. `org === null` means
 *  "no school selected": untouched fields go back to the neutral values.
 *  `seeded` values (e.g. a CRM contact's school name) count as untouched —
 *  they are suggestions, not administrator edits. Returns the new values
 *  and which fields now carry the school's own value. */
export function applySchoolDefaults<T extends InheritableValues>(
  current: T,
  touched: ReadonlySet<string>,
  org: SchoolDefaultsRow | null,
  neutral: InheritableValues,
): { values: T; inherited: Set<InheritableField> } {
  const provided = org ? schoolProvided(org) : {};
  const values = { ...current };
  const inherited = new Set<InheritableField>();
  for (const f of INHERITABLE_FIELDS) {
    if (touched.has(f)) continue;
    if (f in provided) {
      (values as Record<string, unknown>)[f] = provided[f];
      inherited.add(f);
    } else {
      (values as Record<string, unknown>)[f] = neutral[f];
    }
  }
  return { values, inherited };
}

/** Untouched fields an earlier choice would change if the school changed —
 *  used to tell the admin what a switch did (edits are always kept). */
export function keptEdits(touched: ReadonlySet<string>): InheritableField[] {
  return INHERITABLE_FIELDS.filter(f => touched.has(f));
}

/** Community Partner visibility a campaign linked to this school gets — the
 *  school's own advertising settings, unchanged by campaign creation. */
export function partnerVisibility(org: SchoolDefaultsRow | null): { teamApp: boolean; publicPage: boolean } {
  return { teamApp: org?.show_community_partners === true, publicPage: org?.show_community_partners_public === true };
}

export function partnerVisibilityText(org: SchoolDefaultsRow | null): string {
  const v = partnerVisibility(org);
  return `Team App ${v.teamApp ? "shown" : "hidden"} · Public page ${v.publicPage ? "shown" : "hidden"}`;
}
