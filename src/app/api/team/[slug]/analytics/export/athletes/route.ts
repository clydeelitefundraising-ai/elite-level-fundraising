import { NextRequest } from "next/server";
import { getCoachSession } from "@/lib/teamSession";
import { getDonations } from "@/lib/supabase";
import { getTeamAthletes } from "@/lib/teamData";

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
  const coach = await getCoachSession(slug);
  if (!coach) return new Response("Unauthorized", { status: 401 });

  const [athletes, donations] = await Promise.all([
    getTeamAthletes(slug),
    getDonations(slug),
  ]);

  const nameToId: Record<string, string> = {};
  for (const a of athletes) nameToId[a.name] = a.id;

  const totals:      Record<string, number> = Object.fromEntries(athletes.map(a => [a.id, 0]));
  const donorCounts: Record<string, number> = Object.fromEntries(athletes.map(a => [a.id, 0]));

  for (const d of donations) {
    let aid: string | undefined;
    if (d.athlete_id && totals[d.athlete_id] !== undefined) {
      aid = d.athlete_id;
    } else if (!d.athlete_id && d.athlete_name) {
      aid = nameToId[d.athlete_name];
    }
    if (aid) {
      totals[aid]      = (totals[aid]      ?? 0) + d.amount_cents;
      donorCounts[aid] = (donorCounts[aid] ?? 0) + 1;
    }
  }

  const ranked = athletes
    .map(a => ({
      ...a,
      raisedCents: totals[a.id] ?? 0,
      donorCount:  donorCounts[a.id] ?? 0,
    }))
    .sort((a, b) => b.raisedCents - a.raisedCents)
    .map((a, i) => ({ ...a, rank: i + 1 }));

  const header = [
    "Rank", "Name", "Event", "Jersey #", "Grad Year",
    "Amount Raised", "Goal", "% of Goal", "Donor Count",
  ].join(",");

  const rows = ranked.map(a => {
    const pct = a.goal_cents && a.goal_cents > 0
      ? `${Math.min(100, Math.round((a.raisedCents / a.goal_cents) * 100))}%`
      : "";
    return [
      csvField(a.rank),
      csvField(a.name),
      csvField(a.event),
      csvField(a.jersey_number),
      csvField(a.grad_year),
      csvField(`$${(a.raisedCents / 100).toFixed(2)}`),
      csvField(a.goal_cents != null ? `$${(a.goal_cents / 100).toFixed(2)}` : ""),
      csvField(pct),
      csvField(a.donorCount),
    ].join(",");
  });

  const csv = [header, ...rows].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="athletes-${slug}-${today()}.csv"`,
    },
  });
}
