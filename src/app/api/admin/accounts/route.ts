import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

export async function GET() {
  const store = await cookies();
  if (!verifyToken(store.get("elf_admin")?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [coachesRes, membersRes, campaignsRes] = await Promise.all([
    fetch(`${BASE}/rest/v1/team_coaches?select=id,campaign_slug,name,email,role,account_id,created_at&order=created_at.desc`, { headers: h(), cache: "no-store" }),
    fetch(`${BASE}/rest/v1/team_members?select=id,campaign_slug,name,email,phone,role,athlete_id,account_id,created_at&order=created_at.desc`, { headers: h(), cache: "no-store" }),
    fetch(`${BASE}/rest/v1/campaign_settings?select=campaign_slug,school_name,sport_name,season`, { headers: h(), cache: "no-store" }),
  ]);

  const coaches:   RawCoach[]    = coachesRes.ok   ? await coachesRes.json()   : [];
  const members:   RawMember[]   = membersRes.ok   ? await membersRes.json()   : [];
  const campaigns: RawCampaign[] = campaignsRes.ok ? await campaignsRes.json() : [];

  const campaignLabel: Record<string, string> = {};
  for (const c of campaigns) {
    campaignLabel[c.campaign_slug] = [c.school_name, c.sport_name, c.season].filter(Boolean).join(" · ");
  }

  const coachRows: AccountRow[] = coaches.map(c => ({
    id:              c.id,
    source:          "coach",
    campaign_slug:   c.campaign_slug,
    campaign_label:  campaignLabel[c.campaign_slug] ?? c.campaign_slug,
    name:            c.name,
    email:           c.email ?? null,
    phone:           null,
    role:            c.role,
    athlete_id:      null,
    account_created: c.account_id !== null,
    account_id:      c.account_id ?? null,
    created_at:      c.created_at,
  }));

  const memberRows: AccountRow[] = members.map(m => ({
    id:              m.id,
    source:          "member",
    campaign_slug:   m.campaign_slug,
    campaign_label:  campaignLabel[m.campaign_slug] ?? m.campaign_slug,
    name:            m.name,
    email:           m.email ?? null,
    phone:           m.phone ?? null,
    role:            m.role,
    athlete_id:      m.athlete_id ?? null,
    account_created: m.account_id !== null,
    account_id:      m.account_id ?? null,
    created_at:      m.created_at,
  }));

  return NextResponse.json([...coachRows, ...memberRows]);
}

type RawCoach = {
  id: string; campaign_slug: string; name: string; email: string | null;
  role: string; account_id: string | null; created_at: string;
};
type RawMember = {
  id: string; campaign_slug: string; name: string; email: string | null; phone: string | null;
  role: string; athlete_id: string | null; account_id: string | null; created_at: string;
};
type RawCampaign = { campaign_slug: string; school_name: string; sport_name: string; season: string };

export type AccountRow = {
  id:              string;
  source:          "coach" | "member";
  campaign_slug:   string;
  campaign_label:  string;
  name:            string;
  email:           string | null;
  phone:           string | null;
  role:            string;
  athlete_id:      string | null;
  account_created: boolean;
  account_id:      string | null;
  created_at:      string;
};
