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

type RawDonation = {
  campaign_slug:    string | null;
  donor_name:       string | null;
  amount_cents:     number;
  athlete_name:     string | null;
  stripe_session_id: string | null;
  donation_message: string | null;
  created_at:       string;
};

type RawCampaign = {
  campaign_slug: string;
  school_name:   string;
  sport_name:    string;
  season:        string;
};

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
    action:        "export.donations",
    entity_type:   "export",
    campaign_slug: campaign !== "all" ? campaign : null,
    summary:       campaign === "all" ? "Exported donation report (all campaigns)" : `Exported donation report for ${campaign}`,
    ip_address:    ipOf(req),
    user_agent:    req.headers.get("user-agent"),
  });

  const [donationsRes, campaignsRes] = await Promise.all([
    fetch(
      `${BASE}/rest/v1/donations?${filter}select=campaign_slug,donor_name,amount_cents,athlete_name,stripe_session_id,donation_message,created_at&order=created_at.desc`,
      { headers: h(), cache: "no-store" },
    ),
    fetch(
      `${BASE}/rest/v1/campaign_settings?select=campaign_slug,school_name,sport_name,season`,
      { headers: h(), cache: "no-store" },
    ),
  ]);

  if (!donationsRes.ok) {
    return NextResponse.json({ error: "Failed to fetch donations." }, { status: 500 });
  }

  const donations: RawDonation[] = await donationsRes.json();
  const campaigns: RawCampaign[] = campaignsRes.ok ? await campaignsRes.json() : [];

  const campaignLabel: Record<string, string> = {};
  for (const c of campaigns) {
    campaignLabel[c.campaign_slug] = [c.school_name, c.sport_name, c.season]
      .filter(Boolean).join(" · ");
  }

  const csvHeaders = [
    "Campaign Slug",
    "Campaign",
    "Donor Name",
    "Amount (USD)",
    "Date",
    "Athlete Name",
    "Stripe Session ID",
    "Donation Message",
  ];

  const rows: string[][] = donations.map(d => [
    d.campaign_slug ?? "",
    campaignLabel[d.campaign_slug ?? ""] ?? d.campaign_slug ?? "",
    d.donor_name ?? "",
    d.amount_cents != null ? (d.amount_cents / 100).toFixed(2) : "0.00",
    d.created_at ? d.created_at.slice(0, 10) : "",
    d.athlete_name ?? "",
    d.stripe_session_id ?? "",
    d.donation_message ?? "",
  ]);

  const csv      = toCSV(csvHeaders, rows);
  const filename = campaign === "all"
    ? "elf-donations-all-campaigns.csv"
    : `elf-donations-${campaign}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
