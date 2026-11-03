// The school a new or duplicated campaign is linked to — validated on the
// server before the campaign is written (Platform Admin New Campaign, CRM
// Launch and Duplicate). Server-only. A read failure is reported as such
// (503), never as "no school".
import { organizationIdParam, isLegacyPlaceholderOrganization } from "@/lib/organizationCenter";
import { restHeaders, restUrl } from "./_client";

export type CampaignSchool = {
  id: string;
  slug: string;
  school_name: string;
  city: string | null;
  state: string | null;
  show_community_partners: boolean | null;
  show_community_partners_public: boolean | null;
};

export type CampaignSchoolResult =
  | { ok: true; school: CampaignSchool }
  | { ok: false; status: 400 | 503; error: string };

export const CHOOSE_SCHOOL = "Choose the school this campaign belongs to (or create it) before launching.";

export async function resolveCampaignSchool(raw: unknown): Promise<CampaignSchoolResult> {
  if (raw === undefined || raw === null || raw === "") return { ok: false, status: 400, error: CHOOSE_SCHOOL };
  const id = organizationIdParam(raw);
  if (!id) return { ok: false, status: 400, error: "That school isn't valid. Choose a school from the directory." };
  let rows: CampaignSchool[];
  try {
    const res = await fetch(
      restUrl(`organizations?id=eq.${id}&select=id,slug,school_name,city,state,show_community_partners,show_community_partners_public&limit=1`),
      { headers: restHeaders(), cache: "no-store" },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!Array.isArray(json)) throw new Error("unexpected response");
    rows = json as CampaignSchool[];
  } catch {
    return { ok: false, status: 503, error: "The school couldn't be checked. Nothing was created — try again." };
  }
  const school = rows[0];
  if (!school || isLegacyPlaceholderOrganization(school)) {
    return { ok: false, status: 400, error: "That school doesn't exist. Choose a school from the directory." };
  }
  return { ok: true, school };
}
