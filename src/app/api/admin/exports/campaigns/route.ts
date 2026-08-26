import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { logAuditEvent, ADMIN_TOOL_ACTOR, ipOf } from "@/lib/auditLog";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}` };
}

function toCSV(headers: string[], rows: string[][]): string {
  const esc = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [headers, ...rows].map(row => row.map(esc).join(",")).join("\r\n");
}

type RawCampaign = {
  campaign_slug: string;
  school_name:   string;
  sport_name:    string;
  season:        string;
  location:      string;
  goal_cents:    number;
  deadline:      string | null;
  archived:      boolean;
};
type RawDonation = { campaign_slug: string | null; amount_cents: number };
type RawAthlete  = { campaign_slug: string };
type RawMember   = { campaign_slug: string };
type RawContact  = { campaign_slug: string };

export async function GET(req: NextRequest) {
  const store = await cookies();
  if (!verifyToken(store.get("elf_admin")?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const campaign = req.nextUrl.searchParams.get("campaign") ?? "all";
  const filter   = campaign !== "all"
    ? `campaign_slug=eq.${encodeURIComponent(campaign)}&`
    : "";

  logAuditEvent({
    actor: ADMIN_TOOL_ACTOR,
    action:        "export.campaigns",
    entity_type:   "export",
    campaign_slug: campaign !== "all" ? campaign : null,
    summary:       campaign === "all" ? "Exported campaign summary report (all campaigns)" : `Exported campaign summary report for ${campaign}`,
    ip_address:    ipOf(req),
    user_agent:    req.headers.get("user-agent"),
  });

  const [campaignsRes, donationsRes, athletesRes, membersRes, contactsRes] =
    await Promise.all([
      fetch(`${BASE}/rest/v1/campaign_settings?${filter}select=campaign_slug,school_name,sport_name,season,location,goal_cents,deadline,archived&order=campaign_slug.asc`, { headers: h(), cache: "no-store" }),
      fetch(`${BASE}/rest/v1/donations?${filter}select=campaign_slug,amount_cents`,   { headers: h(), cache: "no-store" }),
      fetch(`${BASE}/rest/v1/athletes?${filter}select=campaign_slug`,                 { headers: h(), cache: "no-store" }),
      fetch(`${BASE}/rest/v1/team_members?${filter}select=campaign_slug`,             { headers: h(), cache: "no-store" }),
      fetch(`${BASE}/rest/v1/fundraising_contacts?${filter}select=campaign_slug`,     { headers: h(), cache: "no-store" }),
    ]);

  if (!campaignsRes.ok) {
    return NextResponse.json({ error: "Failed to fetch campaigns." }, { status: 500 });
  }

  const campaigns: RawCampaign[] = await campaignsRes.json();
  const donations: RawDonation[] = donationsRes.ok ? await donationsRes.json() : [];
  const athletes:  RawAthlete[]  = athletesRes.ok  ? await athletesRes.json()  : [];
  const members:   RawMember[]   = membersRes.ok   ? await membersRes.json()   : [];
  const contacts:  RawContact[]  = contactsRes.ok  ? await contactsRes.json()  : [];

  // Build per-campaign aggregates
  const raisedMap:   Record<string, number> = {};
  const donorMap:    Record<string, number> = {};
  const athleteMap:  Record<string, number> = {};
  const memberMap:   Record<string, number> = {};
  const contactMap:  Record<string, number> = {};

  for (const d of donations) {
    const s = d.campaign_slug ?? "";
    raisedMap[s] = (raisedMap[s] ?? 0) + (d.amount_cents ?? 0);
    donorMap[s]  = (donorMap[s]  ?? 0) + 1;
  }
  for (const a of athletes) athleteMap[a.campaign_slug]  = (athleteMap[a.campaign_slug]  ?? 0) + 1;
  for (const m of members)  memberMap[m.campaign_slug]   = (memberMap[m.campaign_slug]   ?? 0) + 1;
  for (const c of contacts) contactMap[c.campaign_slug]  = (contactMap[c.campaign_slug]  ?? 0) + 1;

  const csvHeaders = [
    "Campaign Slug",
    "School Name",
    "Sport",
    "Season",
    "Location",
    "Goal ($)",
    "Raised ($)",
    "% To Goal",
    "Donation Count",
    "Athlete Count",
    "Member Count",
    "Contact Count",
    "Deadline",
    "Status",
  ];

  const rows: string[][] = campaigns.map(c => {
    const raised   = raisedMap[c.campaign_slug]  ?? 0;
    const goal     = c.goal_cents ?? 0;
    const pct      = goal > 0 ? ((raised / goal) * 100).toFixed(1) : "—";
    return [
      c.campaign_slug,
      c.school_name   ?? "",
      c.sport_name    ?? "",
      c.season        ?? "",
      c.location      ?? "",
      (goal / 100).toFixed(2),
      (raised / 100).toFixed(2),
      pct,
      String(donorMap[c.campaign_slug]   ?? 0),
      String(athleteMap[c.campaign_slug] ?? 0),
      String(memberMap[c.campaign_slug]  ?? 0),
      String(contactMap[c.campaign_slug] ?? 0),
      c.deadline ?? "",
      c.archived ? "Archived" : "Active",
    ];
  });

  const csv      = toCSV(csvHeaders, rows);
  const filename = campaign === "all"
    ? "elf-campaign-summary-all.csv"
    : `elf-campaign-summary-${campaign}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
