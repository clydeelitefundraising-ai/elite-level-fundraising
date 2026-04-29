import { NextResponse } from "next/server";
import { getDonations } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const donations = await getDonations();
    console.log(`[campaign-stats] fetched ${donations.length} donations`);

    const raised = donations.reduce((sum, d) => sum + d.amount_cents, 0) / 100;
    const donors = donations.length;

    const athleteTotals: Record<string, number> = {};
    for (const d of donations) {
      if (d.athlete_name) {
        athleteTotals[d.athlete_name] =
          (athleteTotals[d.athlete_name] ?? 0) + d.amount_cents / 100;
      }
    }

    const recentDonations = donations.slice(0, 5).map((d) => ({
      name:    d.donor_name ?? "Anonymous",
      amount:  d.amount_cents / 100,
      message: d.donation_message ?? "",
      time:    timeAgo(d.created_at),
    }));

    return NextResponse.json({ raised, donors, athleteTotals, recentDonations });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load stats";
    console.error("[campaign-stats]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function timeAgo(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60)    return "just now";
  if (sec < 3600)  return `${Math.floor(sec / 60)} minutes ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} hours ago`;
  return `${Math.floor(sec / 86400)} days ago`;
}
