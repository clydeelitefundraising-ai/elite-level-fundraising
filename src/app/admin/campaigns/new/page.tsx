import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { redirect } from "next/navigation";
import { getContact } from "@/lib/platform/crm";
import NewCampaignWizard, { type CrmSeed } from "./NewCampaignWizard";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function h() {
  return { apikey: KEY, Authorization: `Bearer ${KEY}` };
}

type OrgDefaults = {
  primary_color:                  string;
  secondary_color:                string;
  logo_url:                       string;
  default_layout:                 string;
  default_fundraising_goal_cents: number;
  default_athlete_goal_cents:     number;
  default_contact_goal:           number;
  default_show_leaderboard:       boolean;
  default_show_program_identity:  boolean;
  default_show_share_section:     boolean;
  default_show_fund_uses:         boolean;
  default_show_recent_donations:  boolean;
  default_show_sponsors:          boolean;
  default_show_donation_card:     boolean;
};

export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ crm_contact_id?: string }>;
}) {
  const store = await cookies();
  if (!verifyToken(store.get("elf_admin")?.value)) redirect("/admin");

  // Only an opaque id ever appears in the URL — never school/sport/coach name
  // or email. The wizard's seed values below come from an admin-authenticated
  // server-side lookup, not from anything the browser could have supplied.
  const { crm_contact_id } = await searchParams;
  let crmSeed: CrmSeed | null = null;
  if (crm_contact_id) {
    const contact = await getContact(crm_contact_id);
    if (contact) {
      crmSeed = {
        contactId:  contact.id,
        schoolName: contact.school_name ?? "",
        sportName:  contact.sport ?? "",
        coachName:  contact.name,
        coachEmail: contact.email ?? "",
      };
    }
  }

  // Fetch org defaults to pre-populate the wizard
  let orgDefaults: Partial<OrgDefaults> = {};
  try {
    const res = await fetch(
      `${BASE}/rest/v1/organizations?select=primary_color,secondary_color,logo_url,default_layout,default_fundraising_goal_cents,default_athlete_goal_cents,default_contact_goal,default_show_leaderboard,default_show_program_identity,default_show_share_section,default_show_fund_uses,default_show_recent_donations,default_show_sponsors,default_show_donation_card&limit=1`,
      { headers: h(), cache: "no-store" },
    );
    if (res.ok) {
      const rows = await res.json() as OrgDefaults[];
      if (rows[0]) orgDefaults = rows[0];
    }
  } catch {
    // Non-fatal — wizard will use its own defaults
  }

  return <NewCampaignWizard orgDefaults={orgDefaults} crmSeed={crmSeed} />;
}
