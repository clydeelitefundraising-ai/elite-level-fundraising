// People on ELF — internal test records left out of the statistics.
//
// The ONE place these exclusions live. Exact IDs only: never match school or
// team names, and never exclude a new school automatically because its name
// contains "QA" or "Test". Adding to this list needs evidence and approval.
//
// School IDs differ between databases, so the list is chosen by the Supabase
// project this deployment reads (NEXT_PUBLIC_SUPABASE_URL). Any other
// database (local development) excludes nothing and the page says so.
//
// Demo campaigns (campaign_settings.is_demo) are always excluded separately.
import { PRODUCTION_SUPABASE_REF, QA_SUPABASE_REF } from "@/lib/deploymentGuard";
import type { Exclusions } from "./peopleStatsLogic";

export type ExclusionSet = Exclusions & { environment: "production" | "qa" | "none" };

// Production — approved 2026-11-03 after a read-only check of production:
//   ELF Production QA   fbe60df4-…  no team-seasons linked at the time
//   ELF QA Test School  9f9a250f-…  elf-season-test-2027 (the current test season)
//   QA Test Panthers    ce5078fc-…  no team-seasons linked at the time
//   elf-season-test-2026            completed Complete Season test team; not
//                                   linked to any school, so listed by slug
export const PRODUCTION_PEOPLE_EXCLUSIONS: Exclusions = {
  organizationIds: [
    "fbe60df4-ca01-4ae8-9182-b6696bf9a94f", // ELF Production QA
    "9f9a250f-1151-4b18-86d1-1304b4c83706", // ELF QA Test School
    "ce5078fc-fc3e-462a-9cb5-04a4afaa4ea0", // QA Test Panthers
  ],
  campaignSlugs: ["elf-season-test-2026"],
};

// QA — the QA database's own records, chosen to exercise the same rules:
//   ELF Production QA (QA copy)  7e21b85e-…  no team-seasons (like production)
//   QA Test Panthers (QA copy)   1f8262aa-…  no team-seasons (like production)
//   Chino Valley High School     c1069b69-…  stands in for ELF QA Test School:
//                                hawks-track-2027 (archived, completed) and
//                                hawks-track-2028 (current)
//   qa-e2e-falcons-2027          stands in for elf-season-test-2026: a
//                                completed season linked to no school
export const QA_PEOPLE_EXCLUSIONS: Exclusions = {
  organizationIds: [
    "7e21b85e-c3a1-4adf-86ae-bc0db6cd93a1", // ELF Production QA (QA copy)
    "1f8262aa-2254-4215-9705-00faca72b72e", // QA Test Panthers (QA copy)
    "c1069b69-4cf0-43bb-a463-f7fa8eb4ddef", // Chino Valley High School (QA)
  ],
  campaignSlugs: ["qa-e2e-falcons-2027"],
};

/** The Supabase project ref in a NEXT_PUBLIC_SUPABASE_URL, or null. */
export function supabaseRef(url: string | undefined): string | null {
  let host: string;
  try {
    const u = new URL((url ?? "").trim());
    if (u.protocol !== "https:") return null;
    host = u.hostname.toLowerCase();
  } catch {
    return null;
  }
  const m = /^([a-z0-9]+)\.supabase\.co$/.exec(host);
  return m ? m[1] : null;
}

export function peopleExclusionsFor(url: string | undefined): ExclusionSet {
  const ref = supabaseRef(url);
  if (ref === PRODUCTION_SUPABASE_REF) return { environment: "production", ...PRODUCTION_PEOPLE_EXCLUSIONS };
  if (ref === QA_SUPABASE_REF) return { environment: "qa", ...QA_PEOPLE_EXCLUSIONS };
  return { environment: "none", organizationIds: [], campaignSlugs: [] };
}
