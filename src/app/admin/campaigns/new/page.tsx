import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { redirect } from "next/navigation";
import NewCampaignWizard from "./NewCampaignWizard";

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

export default async function NewCampaignPage() {
  const store = await cookies();
  if (!verifyToken(store.get("elf_admin")?.value)) redirect("/admin");

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

  return <NewCampaignWizard orgDefaults={orgDefaults} />;
}
