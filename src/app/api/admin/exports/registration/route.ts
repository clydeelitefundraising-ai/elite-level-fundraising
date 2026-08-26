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

function bool(v: boolean) { return v ? "Yes" : "No"; }

type RawAthlete  = { id: string; name: string; event: string; profile_photo: string | null; campaign_slug: string };
type RawMember   = { role: string; athlete_id: string | null; account_id: string | null; campaign_slug: string };
type RawContact  = { athlete_id: string | null; campaign_slug: string };
type RawGoal     = { athlete_id: string | null; goal: number; campaign_slug: string };
type RawDonation = { athlete_id: string | null; amount_cents: number; campaign_slug: string };
type RawCampaign = { campaign_slug: string; school_name: string };

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
    action:        "export.registration",
    entity_type:   "export",
    campaign_slug: campaign !== "all" ? campaign : null,
    summary:       campaign === "all" ? "Exported registration status report (all campaigns)" : `Exported registration status report for ${campaign}`,
    ip_address:    ipOf(req),
    user_agent:    req.headers.get("user-agent"),
  });

  const [athletesRes, membersRes, contactsRes, goalsRes, donationsRes, campaignsRes] =
    await Promise.all([
      fetch(`${BASE}/rest/v1/athletes?${filter}select=id,name,event,profile_photo,campaign_slug&order=campaign_slug.asc,name.asc`, { headers: h(), cache: "no-store" }),
      fetch(`${BASE}/rest/v1/team_members?${filter}select=role,athlete_id,account_id,campaign_slug`,  { headers: h(), cache: "no-store" }),
      fetch(`${BASE}/rest/v1/fundraising_contacts?${filter}select=athlete_id,campaign_slug`,          { headers: h(), cache: "no-store" }),
      fetch(`${BASE}/rest/v1/fundraising_contact_goals?${filter}select=athlete_id,goal,campaign_slug`,{ headers: h(), cache: "no-store" }),
      fetch(`${BASE}/rest/v1/donations?${filter}select=athlete_id,amount_cents,campaign_slug`,        { headers: h(), cache: "no-store" }),
      fetch(`${BASE}/rest/v1/campaign_settings?select=campaign_slug,school_name`,                     { headers: h(), cache: "no-store" }),
    ]);

  if (!athletesRes.ok) {
    return NextResponse.json({ error: "Failed to fetch athletes." }, { status: 500 });
  }

  const athletes:  RawAthlete[]  = await athletesRes.json();
  const members:   RawMember[]   = membersRes.ok   ? await membersRes.json()   : [];
  const contacts:  RawContact[]  = contactsRes.ok  ? await contactsRes.json()  : [];
  const goals:     RawGoal[]     = goalsRes.ok     ? await goalsRes.json()     : [];
  const donations: RawDonation[] = donationsRes.ok ? await donationsRes.json() : [];
  const campaigns: RawCampaign[] = campaignsRes.ok ? await campaignsRes.json() : [];

  const schoolName: Record<string, string> = {};
  for (const c of campaigns) schoolName[c.campaign_slug] = c.school_name ?? "";

  // Per-athlete lookup maps
  const athleteAccountMap: Record<string, boolean> = {};
  const parentLinkedMap:   Record<string, boolean> = {};
  for (const m of members) {
    if (!m.athlete_id) continue;
    if (m.role === "athlete" && m.account_id) athleteAccountMap[m.athlete_id] = true;
    if (m.role === "parent")                  parentLinkedMap[m.athlete_id]   = true;
  }

  const contactCount: Record<string, number> = {};
  for (const c of contacts) {
    if (c.athlete_id) contactCount[c.athlete_id] = (contactCount[c.athlete_id] ?? 0) + 1;
  }

  const teamDefault: Record<string, number> = {};
  const perAthlete:  Record<string, number> = {};
  for (const g of goals) {
    if (g.athlete_id === null) teamDefault[g.campaign_slug] = g.goal;
    else                       perAthlete[g.athlete_id]     = g.goal;
  }

  const donationTotal: Record<string, number> = {};
  for (const d of donations) {
    if (d.athlete_id) donationTotal[d.athlete_id] = (donationTotal[d.athlete_id] ?? 0) + (d.amount_cents ?? 0);
  }

  const csvHeaders = [
    "Campaign Slug",
    "School",
    "Athlete Name",
    "Event / Position",
    "Athlete Account Created",
    "Parent Linked",
    "Profile Photo Uploaded",
    "Contacts Entered",
    "Contact Goal",
    "Contact Goal Met",
    "Total Raised ($)",
    "Registration Status",
  ];

  const rows: string[][] = athletes.map(a => {
    const accountCreated = !!(athleteAccountMap[a.id]);
    const parentLinked   = !!(parentLinkedMap[a.id]);
    const photoUploaded  = !!(a.profile_photo);
    const contacts       = contactCount[a.id] ?? 0;
    const goal           = perAthlete[a.id] ?? teamDefault[a.campaign_slug] ?? 10;
    const goalMet        = contacts >= goal;
    const raised         = donationTotal[a.id] ?? 0;

    const checks = [accountCreated, parentLinked, photoUploaded, goalMet];
    const done   = checks.filter(Boolean).length;
    const status = done === checks.length ? "Complete"
      : done > 0 ? "In Progress"
      : "Not Started";

    return [
      a.campaign_slug,
      schoolName[a.campaign_slug] ?? a.campaign_slug,
      a.name,
      a.event ?? "",
      bool(accountCreated),
      bool(parentLinked),
      bool(photoUploaded),
      String(contacts),
      String(goal),
      bool(goalMet),
      (raised / 100).toFixed(2),
      status,
    ];
  });

  const csv      = toCSV(csvHeaders, rows);
  const filename = campaign === "all"
    ? "elf-registration-all-campaigns.csv"
    : `elf-registration-${campaign}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
