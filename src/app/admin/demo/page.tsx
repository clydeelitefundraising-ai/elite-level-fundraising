import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/lib/adminAuth";
import DemoView from "./DemoView";
import { DEMO_SLUG, DEMO_COACH_EMAIL, DEMO_ATHLETE_EMAIL, DEMO_PARENT_EMAIL } from "@/lib/demoPersonas";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function h() {
  return { apikey: KEY, Authorization: `Bearer ${KEY}` };
}

export type DemoStatus = {
  campaignExists:   boolean;
  coachExists:      boolean;
  athleteExists:    boolean;
  parentExists:     boolean;
  school_name:      string;
  sport_name:       string;
  primary_color:    string;
  secondary_color:  string;
};

export default async function DemoPage() {
  const store = await cookies();
  if (!verifyToken(store.get("elf_admin")?.value)) redirect("/admin");

  let status: DemoStatus = {
    campaignExists:  false,
    coachExists:     false,
    athleteExists:   false,
    parentExists:    false,
    school_name:     "",
    sport_name:      "",
    primary_color:   "#0b1e3d",
    secondary_color: "#c4a35a",
  };

  try {
    const [campaignRes, coachRes, athleteRes, parentRes] = await Promise.all([
      fetch(
        `${BASE}/rest/v1/campaign_settings?campaign_slug=eq.${encodeURIComponent(DEMO_SLUG)}&select=campaign_slug,school_name,sport_name,primary_color,secondary_color&limit=1`,
        { headers: h(), cache: "no-store" },
      ),
      fetch(
        `${BASE}/rest/v1/team_coaches?email=eq.${encodeURIComponent(DEMO_COACH_EMAIL)}&campaign_slug=eq.${encodeURIComponent(DEMO_SLUG)}&select=id&limit=1`,
        { headers: h(), cache: "no-store" },
      ),
      fetch(
        `${BASE}/rest/v1/elf_accounts?email=eq.${encodeURIComponent(DEMO_ATHLETE_EMAIL)}&select=id&limit=1`,
        { headers: h(), cache: "no-store" },
      ),
      fetch(
        `${BASE}/rest/v1/elf_accounts?email=eq.${encodeURIComponent(DEMO_PARENT_EMAIL)}&select=id&limit=1`,
        { headers: h(), cache: "no-store" },
      ),
    ]);

    const campaigns: { campaign_slug: string; school_name: string; sport_name: string; primary_color: string; secondary_color: string }[] =
      campaignRes.ok ? await campaignRes.json() : [];
    const coaches:  unknown[] = coachRes.ok   ? await coachRes.json()   : [];
    const athletes: unknown[] = athleteRes.ok ? await athleteRes.json() : [];
    const parents:  unknown[] = parentRes.ok  ? await parentRes.json()  : [];

    const c = campaigns[0];
    status = {
      campaignExists:  !!c,
      coachExists:     coaches.length > 0,
      athleteExists:   athletes.length > 0,
      parentExists:    parents.length > 0,
      school_name:     c?.school_name  ?? "",
      sport_name:      c?.sport_name   ?? "",
      primary_color:   c?.primary_color  ?? "#0b1e3d",
      secondary_color: c?.secondary_color ?? "#c4a35a",
    };
  } catch {
    // Non-fatal — DemoView shows "not initialized" state
  }

  return <DemoView status={status} />;
}
