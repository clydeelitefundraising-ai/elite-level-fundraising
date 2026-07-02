import { cookies }  from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/lib/adminAuth";
import TeamHealthView from "./TeamHealthView";
import type { TeamHealth, HealthData, HealthSummary, HealthLabel } from "./types";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function h() {
  return { apikey: KEY, Authorization: `Bearer ${KEY}` };
}

async function safeFetch<T>(url: string): Promise<T[]> {
  try {
    const res = await fetch(url, { headers: h(), cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json) ? json : [];
  } catch {
    return [];
  }
}

type RawCampaign = {
  campaign_slug: string;
  school_name:   string;
  sport_name:    string;
  season:        string;
  goal_cents:    number;
  deadline:      string;
  archived:      boolean;
  created_at:    string;
  logo_url:      string | null;
  team_photo:    string | null;
  is_demo?:      boolean;
};
type RawDonation = { campaign_slug: string; amount_cents: number; created_at: string };
type RawAthlete  = { id: string; campaign_slug: string };
type RawMember   = { campaign_slug: string; role: string };
type RawCoach    = { id: string; campaign_slug: string; account_id: string | null };
type RawThread   = { campaign_slug: string; last_message_at: string };
type RawAuditLog = { campaign_slug: string | null; action: string; created_at: string };
type RawInvite   = { coach_id: string; created_at: string };

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function daysBetween(a: number, b: number) {
  return Math.floor((a - b) / 86400000);
}

export default async function TeamHealthPage() {
  const store = await cookies();
  if (!verifyToken(store.get("elf_admin")?.value)) redirect("/admin");

  const [
    campaigns, donations, athletes, members, coaches, threads, auditLogs, invites,
  ] = await Promise.all([
    safeFetch<RawCampaign>(
      `${BASE}/rest/v1/campaign_settings?is_demo=eq.false&select=campaign_slug,school_name,sport_name,season,goal_cents,deadline,archived,created_at,logo_url,team_photo&order=school_name.asc&limit=500`,
    ),
    safeFetch<RawDonation>(
      `${BASE}/rest/v1/donations?select=campaign_slug,amount_cents,created_at&order=created_at.desc&limit=5000`,
    ),
    safeFetch<RawAthlete>(`${BASE}/rest/v1/athletes?select=id,campaign_slug&limit=5000`),
    safeFetch<RawMember>(`${BASE}/rest/v1/team_members?select=campaign_slug,role&limit=5000`),
    safeFetch<RawCoach>(`${BASE}/rest/v1/team_coaches?select=id,campaign_slug,account_id&limit=2000`),
    safeFetch<RawThread>(`${BASE}/rest/v1/message_threads?select=campaign_slug,last_message_at&order=last_message_at.desc&limit=2000`),
    safeFetch<RawAuditLog>(`${BASE}/rest/v1/audit_logs?select=campaign_slug,action,created_at&order=created_at.desc&limit=1000`),
    safeFetch<RawInvite>(`${BASE}/rest/v1/coach_invite_tokens?used_at=is.null&select=coach_id,created_at&limit=500`),
  ]);

  const now = Date.now();

  // ── Per-campaign lookup maps (built defensively; any source table may be empty) ──

  const donationsByCamp: Record<string, RawDonation[]> = {};
  for (const d of donations) (donationsByCamp[d.campaign_slug] ??= []).push(d);

  const athletesByCamp: Record<string, number> = {};
  for (const a of athletes) athletesByCamp[a.campaign_slug] = (athletesByCamp[a.campaign_slug] ?? 0) + 1;

  const membersByCamp: Record<string, number> = {};
  for (const m of members) membersByCamp[m.campaign_slug] = (membersByCamp[m.campaign_slug] ?? 0) + 1;

  const coachesByCamp: Record<string, RawCoach[]> = {};
  for (const c of coaches) (coachesByCamp[c.campaign_slug] ??= []).push(c);

  const lastThreadByCamp: Record<string, string> = {};
  for (const t of threads) {
    if (!lastThreadByCamp[t.campaign_slug] || t.last_message_at > lastThreadByCamp[t.campaign_slug]) {
      lastThreadByCamp[t.campaign_slug] = t.last_message_at;
    }
  }

  const recentAuditByCamp: Record<string, RawAuditLog[]> = {};
  for (const e of auditLogs) {
    if (!e.campaign_slug) continue;
    (recentAuditByCamp[e.campaign_slug] ??= []).push(e);
  }

  const pendingInviteCoachIds = new Set(
    invites.filter(i => daysBetween(now, new Date(i.created_at).getTime()) >= 7).map(i => i.coach_id),
  );

  // ── Score each team ─────────────────────────────────────────────────────────

  const teams: TeamHealth[] = campaigns.map(c => {
    const slug     = c.campaign_slug;
    const campDons = donationsByCamp[slug] ?? [];
    const raisedCents = campDons.reduce((s, d) => s + (d.amount_cents ?? 0), 0);
    const pctToGoal = c.goal_cents > 0 ? Math.round((raisedCents / c.goal_cents) * 100) : 0;

    const created = c.created_at ? new Date(c.created_at).getTime() : null;
    const deadline = c.deadline ? new Date(c.deadline).getTime() : null;
    const daysRemaining = deadline != null ? daysBetween(deadline, now) : null;

    const lastDonation = campDons[0] ?? null; // already sorted desc
    const lastDonationAt = lastDonation?.created_at ?? null;
    const daysSinceLastDonation = lastDonationAt ? daysBetween(now, new Date(lastDonationAt).getTime()) : null;

    const lastThreadAt = lastThreadByCamp[slug] ?? null;
    const campAudit = recentAuditByCamp[slug] ?? [];
    const lastAuditAt = campAudit[0]?.created_at ?? null;
    const lastActivityAt = [lastDonationAt, lastThreadAt, lastAuditAt]
      .filter((v): v is string => !!v)
      .sort((a, b) => (a > b ? -1 : 1))[0] ?? null;
    const daysSinceLastActivity = lastActivityAt ? daysBetween(now, new Date(lastActivityAt).getTime()) : null;
    const daysSinceLastComms = lastThreadAt ? daysBetween(now, new Date(lastThreadAt).getTime()) : null;

    const athleteCount = athletesByCamp[slug] ?? 0;
    const memberCount  = membersByCamp[slug] ?? 0;
    const campCoaches  = coachesByCamp[slug] ?? [];
    const hasCoach     = campCoaches.length > 0;
    const hasLinkedCoach = campCoaches.some(cc => cc.account_id != null);
    const hasStaleInvite = campCoaches.some(cc => pendingInviteCoachIds.has(cc.id));

    // ── 1. Donation pace vs goal/deadline — 30 pts ──
    let paceRatio = 1;
    let paceScore = 15; // neutral default when timeline can't be determined
    if (created != null && deadline != null && deadline > created) {
      const timeFraction = clamp((now - created) / (deadline - created), 0, 1);
      const expected = timeFraction; // linear expected pace
      const actual   = c.goal_cents > 0 ? raisedCents / c.goal_cents : timeFraction;
      paceRatio = expected > 0 ? actual / expected : 1;
      paceScore = Math.round(30 * clamp(paceRatio, 0, 1));
    }

    // ── 2. Recent donation activity — 15 pts ──
    let recentDonationScore: number;
    if (daysSinceLastDonation == null) {
      const startedDaysAgo = created != null ? daysBetween(now, created) : 999;
      recentDonationScore = startedDaysAgo < 7 ? 8 : 0; // grace period for brand-new campaigns
    } else {
      recentDonationScore = Math.round(15 * clamp((7 - daysSinceLastDonation) / 7, 0, 1));
    }

    // ── 3. Participation — 15 pts ──
    const participationScore = Math.round(15 * clamp(athleteCount / 8, 0, 1));

    // ── 4. Team communication activity — 15 pts ──
    let commsScore: number;
    if (daysSinceLastComms == null) {
      const startedDaysAgo = created != null ? daysBetween(now, created) : 999;
      commsScore = startedDaysAgo < 14 ? 8 : 0;
    } else {
      commsScore = Math.round(15 * clamp((14 - daysSinceLastComms) / 14, 0, 1));
    }

    // ── 5. Campaign setup completeness — 15 pts ──
    let setupScore = 0;
    if (c.logo_url)   setupScore += 8;
    if (c.team_photo) setupScore += 4;
    if (c.goal_cents > 0) setupScore += 3;

    // ── 6. Follow-up / admin attention risk — 10 pts ──
    let attentionScore = 0;
    if (hasLinkedCoach) attentionScore += 5;
    else if (hasCoach)  attentionScore += 2;
    if (!hasStaleInvite) attentionScore += 3;
    if (campAudit.length > 0) attentionScore += 2;

    const score = clamp(
      paceScore + recentDonationScore + participationScore + commsScore + setupScore + attentionScore,
      0, 100,
    );

    const label: HealthLabel = score >= 80 ? "healthy" : score >= 60 ? "watch" : "at_risk";

    // ── Reasons ──
    const reasons: string[] = [];
    if (paceRatio < 0.5) reasons.push("Behind donation pace");
    if (daysSinceLastDonation == null || daysSinceLastDonation >= 7) reasons.push("No donations in 7+ days");
    if (athleteCount < 3) reasons.push("Low athlete participation");
    if (daysSinceLastComms == null || daysSinceLastComms >= 14) reasons.push("No recent coach communication");
    if (!c.logo_url && !c.team_photo) reasons.push("Missing campaign photo");
    if (daysRemaining != null && daysRemaining >= 0 && daysRemaining <= 7) reasons.push("Deadline approaching");
    if (paceRatio >= 1.2 && raisedCents > 0) reasons.push("Strong donation momentum");
    if ((daysSinceLastDonation != null && daysSinceLastDonation <= 2) || (daysSinceLastComms != null && daysSinceLastComms <= 2)) {
      reasons.push("Recently active");
    }

    return {
      slug,
      schoolName: c.school_name,
      sportName:  c.sport_name,
      season:     c.season,
      archived:   c.archived,
      score,
      label,
      reasons,
      raisedCents,
      goalCents:  c.goal_cents ?? 0,
      pctToGoal,
      daysRemaining,
      deadline:   c.deadline ?? "",
      lastDonationAt,
      daysSinceLastDonation,
      athleteCount,
      memberCount,
      lastActivityAt,
    };
  });

  const totalTeams = teams.length;
  const healthy = teams.filter(t => t.label === "healthy").length;
  const watch   = teams.filter(t => t.label === "watch").length;
  const atRisk  = teams.filter(t => t.label === "at_risk").length;
  const averageScore = totalTeams > 0 ? Math.round(teams.reduce((s, t) => s + t.score, 0) / totalTeams) : 0;
  const behindPaceCount = teams.filter(t => t.reasons.includes("Behind donation pace")).length;

  const summary: HealthSummary = { totalTeams, healthy, watch, atRisk, averageScore, behindPaceCount };

  const data: HealthData = { teams: teams.sort((a, b) => a.score - b.score), summary };

  return <TeamHealthView data={data} />;
}
