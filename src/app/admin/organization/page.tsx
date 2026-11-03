import { redirect } from "next/navigation";
import { getAdminAccess } from "@/lib/adminAccess";
import { organizationIdParam, sortOrganizations, type OrgPickerRow } from "@/lib/organizationCenter";
import OrganizationView from "./OrganizationView";
import OrganizationPicker from "./OrganizationPicker";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function h() {
  return { apikey: KEY, Authorization: `Bearer ${KEY}` };
}

export type OrgRow = {
  id:                             string;
  slug:                           string;
  school_name:                    string;
  nickname:                       string;
  logo_url:                       string;
  primary_color:                  string;
  secondary_color:                string;
  default_team_photo_url:         string;
  default_layout:                 string;
  address:                        string;
  city:                           string;
  state:                          string;
  zip:                            string;
  website:                        string;
  short_description:              string;
  athletic_director:              string;
  athletic_director_email:        string;
  athletic_director_phone:        string;
  default_show_leaderboard:       boolean;
  default_show_program_identity:  boolean;
  default_show_share_section:     boolean;
  default_show_fund_uses:         boolean;
  default_show_recent_donations:  boolean;
  default_show_sponsors:          boolean;
  default_show_donation_card:     boolean;
  default_fundraising_goal_cents: number;
  default_athlete_goal_cents:     number;
  default_contact_goal:           number;
  default_campaign_length_days:   number;
};

export type CommunicationTemplate = {
  id:              string;
  organization_id: string;
  type:            string;
  subject:         string;
  body_text:       string;
};

export type SponsorPackage = {
  id:              string;
  organization_id: string;
  name:            string;
  tier:            string;
  description:     string;
  amount_cents:    number;
  sort_order:      number;
};

// Organization Center — ONE explicit school at a time:
//   /admin/organization                 choose a school (name, city, state)
//   /admin/organization?school=<uuid>   edit that school
// It never falls back to "the first organizations row" (the old limit=1
// lookup picked an arbitrary school once ELF had more than one).
export default async function OrganizationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await getAdminAccess())) redirect("/admin");

  const { school } = await searchParams;
  const orgId = organizationIdParam(typeof school === "string" ? school : null);

  if (!orgId) {
    const [orgRes, linkRes] = await Promise.all([
      fetch(`${BASE}/rest/v1/organizations?select=id,slug,school_name,city,state`, { headers: h(), cache: "no-store" }),
      fetch(`${BASE}/rest/v1/campaign_settings?organization_id=not.is.null&select=organization_id`, { headers: h(), cache: "no-store" }),
    ]);
    const orgs: Omit<OrgPickerRow, "team_count">[] = orgRes.ok ? await orgRes.json() : [];
    const links: { organization_id: string }[] = linkRes.ok ? await linkRes.json() : [];
    const counts = new Map<string, number>();
    for (const l of links) counts.set(l.organization_id, (counts.get(l.organization_id) ?? 0) + 1);
    const rows: OrgPickerRow[] = sortOrganizations(orgs.map(o => ({
      id: o.id, slug: o.slug, school_name: o.school_name ?? "", city: o.city ?? "", state: o.state ?? "",
      team_count: counts.get(o.id) ?? 0,
    })));
    return <OrganizationPicker schools={rows} loadFailed={!orgRes.ok} />;
  }

  const orgRes = await fetch(
    `${BASE}/rest/v1/organizations?id=eq.${orgId}&select=*&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  const orgs: OrgRow[] = orgRes.ok ? await orgRes.json() : [];
  const org = orgs[0] ?? null;
  if (!org) return <OrganizationPicker schools={[]} notFound />;

  const [tRes, pRes, cRes] = await Promise.all([
    fetch(
      `${BASE}/rest/v1/communication_templates?organization_id=eq.${org.id}&select=*&order=type.asc`,
      { headers: h(), cache: "no-store" },
    ),
    fetch(
      `${BASE}/rest/v1/sponsor_packages?organization_id=eq.${org.id}&select=*&order=sort_order.asc,created_at.asc`,
      { headers: h(), cache: "no-store" },
    ),
    fetch(
      `${BASE}/rest/v1/campaign_settings?organization_id=eq.${org.id}&select=campaign_slug`,
      { headers: h(), cache: "no-store" },
    ),
  ]);
  const templates: CommunicationTemplate[] = tRes.ok ? await tRes.json() : [];
  const packages:  SponsorPackage[]        = pRes.ok ? await pRes.json()  : [];
  const linkedTeams = cRes.ok ? (await cRes.json() as unknown[]).length : null;

  return <OrganizationView org={org} templates={templates} packages={packages} linkedTeamCount={linkedTeams} />;
}
