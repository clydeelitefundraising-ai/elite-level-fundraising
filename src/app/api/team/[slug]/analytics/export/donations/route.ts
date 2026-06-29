import { NextRequest } from "next/server";
import { getTeamActor, isStaff } from "@/lib/permissions.server";
import { getDonations, getAthletes } from "@/lib/supabase";

function csvField(val: string | number | null | undefined): string {
  if (val == null) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (!isStaff(actor)) return new Response("Unauthorized", { status: 401 });

  const [donations, athletes] = await Promise.all([
    getDonations(slug),
    getAthletes(slug),
  ]);

  const idToName: Record<string, string> = {};
  for (const a of athletes) idToName[a.id] = a.name;

  const header = ["Date", "Time", "Donor Name", "Amount", "Athlete Credited", "Message", "Stripe Session ID"].join(",");

  const rows = donations.map(d => {
    const dt   = new Date(d.created_at);
    const date = dt.toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" });
    const time = dt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
    const athleteName = d.athlete_id ? (idToName[d.athlete_id] ?? d.athlete_name ?? "") : (d.athlete_name ?? "");
    const amount = `$${(d.amount_cents / 100).toFixed(2)}`;
    return [
      csvField(date),
      csvField(time),
      csvField(d.donor_name ?? "Anonymous"),
      csvField(amount),
      csvField(athleteName),
      csvField(d.donation_message),
      csvField(d.stripe_session_id),
    ].join(",");
  });

  const csv = [header, ...rows].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="donations-${slug}-${today()}.csv"`,
    },
  });
}
