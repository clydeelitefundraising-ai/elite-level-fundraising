import { NextRequest } from "next/server";
import { getTeamActor, isStaff } from "@/lib/permissions.server";
import { getDonations, getCampaignSettings } from "@/lib/supabase";
import { getTeamAthletes, getContactCountsByAthlete, getOutreachMap } from "@/lib/teamData";
import { FOLLOW_UP_STATUS_LABEL } from "@/lib/followUps";
import { getCoachFundraisers, getCoachTotals, getCoachDonorCounts, getContactCountsByCoach, getOutreachMapByCoach } from "@/lib/platform/coachFundraising";

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

  const [athletes, donations, settings, contactCounts, outreachMap, coachFundraisers, coachTotals, coachDonorCounts, coachContactCounts, coachOutreachMap] = await Promise.all([
    getTeamAthletes(slug),
    getDonations(slug),
    getCampaignSettings(slug),
    getContactCountsByAthlete(slug),
    getOutreachMap(slug),
    // Every participation row this campaign has ever had, not just
    // currently-active ones — a deactivated coach's historical totals
    // must still appear in reports/exports (deactivation only blocks NEW
    // attribution and hides them from the live public leaderboard).
    getCoachFundraisers(slug),
    getCoachTotals(slug),
    getCoachDonorCounts(slug),
    getContactCountsByCoach(slug),
    getOutreachMapByCoach(slug),
  ]);
  const campaignDefaultGoal = settings?.default_athlete_goal_cents ?? null;

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

  type ExportRow = {
    rank: number; name: string; participantType: "Athlete" | "Coach";
    grade: string; event: string | null; jerseyNumber: number | null; gradYear: number | null;
    contacts: number; donorCount: number; raisedCents: number; goalCents: number | null;
  };

  const athleteRows: ExportRow[] = athletes.map(a => ({
    rank: 0, name: a.name, participantType: "Athlete",
    grade: a.class_year ?? (a.grad_year ? `Class of ${a.grad_year}` : ""),
    event: a.event, jerseyNumber: a.jersey_number, gradYear: a.grad_year,
    contacts: contactCounts[a.id] ?? 0, donorCount: donorCounts[a.id] ?? 0,
    raisedCents: totals[a.id] ?? 0, goalCents: a.goal_cents ?? campaignDefaultGoal,
  }));

  const coachRows: ExportRow[] = coachFundraisers.map(c => ({
    rank: 0, name: c.name, participantType: "Coach",
    grade: c.role === "head_coach" ? "Head Coach" : "Assistant Coach",
    event: null, jerseyNumber: null, gradYear: null,
    contacts: coachContactCounts[c.coach_id] ?? 0, donorCount: coachDonorCounts[c.coach_id] ?? 0,
    raisedCents: coachTotals[c.coach_id] ?? 0, goalCents: c.goal_cents,
  }));

  // Outreach lookups keyed by name after merge — athletes.id/coach_id both
  // fold into the same ExportRow shape, so re-key the two source maps by
  // the same identifier each row was built from.
  const outreachByName: Record<string, { status: string; created_at: string }> = {};
  for (const a of athletes) { const o = outreachMap[a.id]; if (o) outreachByName[a.name] = o; }
  for (const c of coachFundraisers) { const o = coachOutreachMap[c.coach_id]; if (o) outreachByName[c.name] = o; }

  const ranked = [...athleteRows, ...coachRows]
    .sort((a, b) => b.raisedCents - a.raisedCents)
    .map((a, i) => ({ ...a, rank: i + 1 }));

  const header = [
    "Rank", "Name", "Participant Type", "Role / Grade", "Event", "Jersey #", "Grad Year",
    "Fundraising Contacts", "Donor Count", "Amount Raised", "Goal", "% of Goal",
    "Follow-Up Status", "Last Outreach",
  ].join(",");

  const rows = ranked.map(a => {
    const effectiveGoal = a.goalCents;
    const pct = effectiveGoal && effectiveGoal > 0
      ? `${Math.min(100, Math.round((a.raisedCents / effectiveGoal) * 100))}%`
      : "";
    const outreach = outreachByName[a.name] ?? null;
    return [
      csvField(a.rank),
      csvField(a.name),
      csvField(a.participantType),
      csvField(a.grade),
      csvField(a.event),
      csvField(a.jerseyNumber),
      csvField(a.gradYear),
      csvField(a.contacts),
      csvField(a.donorCount),
      csvField(`$${(a.raisedCents / 100).toFixed(2)}`),
      csvField(effectiveGoal != null ? `$${(effectiveGoal / 100).toFixed(2)}` : ""),
      csvField(pct),
      csvField(outreach ? (FOLLOW_UP_STATUS_LABEL as Record<string, string>)[outreach.status] : ""),
      csvField(outreach?.created_at ? outreach.created_at.slice(0, 10) : ""),
    ].join(",");
  });

  // Leading UTF-8 BOM + CRLF endings so Excel opens this cleanly, matching
  // the convention already established in lib/followUps.ts's CSV builder.
  const BOM = "﻿";
  const csv = BOM + [header, ...rows].join("\r\n") + "\r\n";

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="athlete-report-${slug}-${today()}.csv"`,
    },
  });
}
