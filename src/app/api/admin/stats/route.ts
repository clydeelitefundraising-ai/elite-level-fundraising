import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

async function countRows(table: string, filter = ""): Promise<number> {
  const res = await fetch(
    `${BASE}/rest/v1/${table}?select=id${filter}&limit=1`,
    { headers: { ...h(), Prefer: "count=exact" }, cache: "no-store" },
  );
  const range = res.headers.get("content-range");
  if (!range) return 0;
  const total = range.split("/")[1];
  return total === "*" ? 0 : parseInt(total, 10) || 0;
}

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get("elf_admin")?.value);
}

export async function GET() {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [
    campaignRows,
    donationRows,
    totalAthletes,
    totalMembers,
    totalContacts,
    totalCoaches,
  ] = await Promise.all([
    fetch(`${BASE}/rest/v1/campaign_settings?select=campaign_slug,archived`, { headers: h(), cache: "no-store" })
      .then(r => r.ok ? r.json() as Promise<{ campaign_slug: string; archived: boolean }[]> : []),
    fetch(`${BASE}/rest/v1/donations?select=amount_cents`, { headers: h(), cache: "no-store" })
      .then(r => r.ok ? r.json() as Promise<{ amount_cents: number }[]> : []),
    countRows("athletes"),
    countRows("team_members"),
    countRows("fundraising_contacts"),
    countRows("team_coaches"),
  ]);

  const totalCampaigns = campaignRows.length;
  const activeCampaigns = campaignRows.filter(c => !c.archived).length;
  const totalDonations = donationRows.length;
  const totalRaisedCents = donationRows.reduce((sum, d) => sum + (d.amount_cents || 0), 0);

  return NextResponse.json({
    totalCampaigns,
    activeCampaigns,
    totalDonations,
    totalRaisedCents,
    totalAthletes,
    totalMembers,
    totalContacts,
    totalCoaches,
  });
}
