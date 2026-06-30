import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/lib/adminAuth";
import OrganizationView from "./OrganizationView";

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

export default async function OrganizationPage() {
  const store = await cookies();
  if (!verifyToken(store.get("elf_admin")?.value)) redirect("/admin");

  const orgRes = await fetch(
    `${BASE}/rest/v1/organizations?select=*&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  const orgs: OrgRow[] = orgRes.ok ? await orgRes.json() : [];
  const org = orgs[0] ?? null;

  let templates: CommunicationTemplate[] = [];
  let packages:  SponsorPackage[]        = [];

  if (org) {
    const [tRes, pRes] = await Promise.all([
      fetch(
        `${BASE}/rest/v1/communication_templates?organization_id=eq.${org.id}&select=*&order=type.asc`,
        { headers: h(), cache: "no-store" },
      ),
      fetch(
        `${BASE}/rest/v1/sponsor_packages?organization_id=eq.${org.id}&select=*&order=sort_order.asc,created_at.asc`,
        { headers: h(), cache: "no-store" },
      ),
    ]);
    templates = tRes.ok ? await tRes.json() : [];
    packages  = pRes.ok ? await pRes.json()  : [];
  }

  return <OrganizationView org={org} templates={templates} packages={packages} />;
}
