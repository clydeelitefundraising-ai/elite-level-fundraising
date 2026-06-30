import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { logAuditEvent, ipOf } from "@/lib/auditLog";

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

type RawContact = {
  campaign_slug:      string;
  athlete_id:         string | null;
  first_name:         string | null;
  last_name:          string | null;
  phone:              string | null;
  email:              string | null;
  relationship:       string | null;
  relationship_other: string | null;
  created_at:         string;
};

type RawAthlete  = { id: string; name: string; campaign_slug: string };
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
    action:        "export.contacts",
    entity_type:   "export",
    campaign_slug: campaign !== "all" ? campaign : null,
    summary:       campaign === "all" ? "Exported contact report (all campaigns)" : `Exported contact report for ${campaign}`,
    ip_address:    ipOf(req),
    user_agent:    req.headers.get("user-agent"),
  });

  const [contactsRes, athletesRes, campaignsRes] = await Promise.all([
    fetch(
      `${BASE}/rest/v1/fundraising_contacts?${filter}select=campaign_slug,athlete_id,first_name,last_name,phone,email,relationship,relationship_other,created_at&order=created_at.desc`,
      { headers: h(), cache: "no-store" },
    ),
    fetch(
      `${BASE}/rest/v1/athletes?select=id,name,campaign_slug`,
      { headers: h(), cache: "no-store" },
    ),
    fetch(
      `${BASE}/rest/v1/campaign_settings?select=campaign_slug,school_name`,
      { headers: h(), cache: "no-store" },
    ),
  ]);

  if (!contactsRes.ok) {
    return NextResponse.json({ error: "Failed to fetch contacts." }, { status: 500 });
  }

  const contacts: RawContact[] = await contactsRes.json();
  const athletes: RawAthlete[] = athletesRes.ok ? await athletesRes.json() : [];
  const campaigns: RawCampaign[] = campaignsRes.ok ? await campaignsRes.json() : [];

  const athleteName: Record<string, string> = {};
  for (const a of athletes) athleteName[a.id] = a.name;

  const schoolName: Record<string, string> = {};
  for (const c of campaigns) schoolName[c.campaign_slug] = c.school_name ?? "";

  const csvHeaders = [
    "Campaign Slug",
    "School",
    "Athlete Name",
    "First Name",
    "Last Name",
    "Phone",
    "Email",
    "Relationship",
    "Date Added",
  ];

  const rows: string[][] = contacts.map(c => {
    const rel = c.relationship_other
      ? `${c.relationship ?? "Other"} (${c.relationship_other})`
      : c.relationship ?? "";
    return [
      c.campaign_slug,
      schoolName[c.campaign_slug] ?? c.campaign_slug,
      c.athlete_id ? (athleteName[c.athlete_id] ?? c.athlete_id) : "",
      c.first_name ?? "",
      c.last_name  ?? "",
      c.phone      ?? "",
      c.email      ?? "",
      rel,
      c.created_at ? c.created_at.slice(0, 10) : "",
    ];
  });

  const csv      = toCSV(csvHeaders, rows);
  const filename = campaign === "all"
    ? "elf-contacts-all-campaigns.csv"
    : `elf-contacts-${campaign}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
