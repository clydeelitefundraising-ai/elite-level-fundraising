import { getTeamHealthData } from "@/lib/teamHealth";

export type AutomationSeverity = "info" | "warning" | "critical";

export type RuleKey =
  | "team_health_at_risk"
  | "crm_follow_up_overdue"
  | "no_donations_7d"
  | "deadline_approaching_underfunded"
  | "pending_invite_stale";

export const RULE_KEYS: RuleKey[] = [
  "team_health_at_risk",
  "crm_follow_up_overdue",
  "no_donations_7d",
  "deadline_approaching_underfunded",
  "pending_invite_stale",
];

export type AutomationCandidate = {
  rule_key:       RuleKey;
  severity:       AutomationSeverity;
  campaign_slug?: string | null;
  coach_id?:      string | null;
  crm_contact_id?: string | null;
  title:          string;
  description?:   string | null;
};

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

function daysBetween(a: number, b: number) {
  return Math.floor((a - b) / 86400000);
}

// ── Rule 1: Team Health < 60 ───────────────────────────────────────────────────
async function ruleTeamHealthAtRisk(): Promise<AutomationCandidate[]> {
  const { teams } = await getTeamHealthData();
  return teams
    .filter(t => t.score < 60)
    .map(t => ({
      rule_key:      "team_health_at_risk",
      severity:      "critical",
      campaign_slug: t.slug,
      title:         "Team health is at risk.",
      description:   `${t.schoolName} (${t.sportName}) has a health score of ${t.score}. Reasons: ${t.reasons.join(", ") || "multiple factors"}.`,
    }));
}

// ── Rule 2: CRM follow-up overdue ──────────────────────────────────────────────
type RawCrmContact = { id: string; name: string; status: string; next_follow_up_at: string | null };

async function ruleCrmFollowUpOverdue(): Promise<AutomationCandidate[]> {
  const contacts = await safeFetch<RawCrmContact>(
    `${BASE}/rest/v1/coach_crm_contacts?status=neq.lost&next_follow_up_at=not.is.null&select=id,name,status,next_follow_up_at&limit=1000`,
  );
  const now = Date.now();
  return contacts
    .filter(c => c.next_follow_up_at && new Date(c.next_follow_up_at).getTime() < now)
    .map(c => ({
      rule_key:       "crm_follow_up_overdue",
      severity:       "warning",
      crm_contact_id: c.id,
      title:          "Coach follow-up overdue.",
      description:    `Follow-up for "${c.name}" (${c.status}) was due ${c.next_follow_up_at}.`,
    }));
}

// ── Rule 3: No donations in 7+ days ────────────────────────────────────────────
async function ruleNoDonations7d(): Promise<AutomationCandidate[]> {
  const { teams } = await getTeamHealthData();
  return teams
    .filter(t => t.daysSinceLastDonation == null || t.daysSinceLastDonation >= 7)
    .map(t => ({
      rule_key:      "no_donations_7d",
      severity:      "warning",
      campaign_slug: t.slug,
      title:         "Campaign has received no donations in 7+ days.",
      description:   `${t.schoolName} (${t.sportName}) last donation: ${t.lastDonationAt ?? "never"}.`,
    }));
}

// ── Rule 4: Ends within 3 days and below 80% funded ────────────────────────────
async function ruleDeadlineApproachingUnderfunded(): Promise<AutomationCandidate[]> {
  const { teams } = await getTeamHealthData();
  return teams
    .filter(t => t.daysRemaining != null && t.daysRemaining >= 0 && t.daysRemaining <= 3 && t.pctToGoal < 80)
    .map(t => ({
      rule_key:      "deadline_approaching_underfunded",
      severity:      "critical",
      campaign_slug: t.slug,
      title:         "Campaign ends within 3 days and is below 80% funded.",
      description:   `${t.schoolName} (${t.sportName}) is at ${t.pctToGoal}% of goal with ${t.daysRemaining} day(s) remaining.`,
    }));
}

// ── Rule 5: Pending coach invite older than 7 days ─────────────────────────────
type RawInvite = { coach_id: string; created_at: string };
type RawCoach   = { id: string; name: string; campaign_slug: string };

async function rulePendingInviteStale(): Promise<AutomationCandidate[]> {
  const [invites, coaches] = await Promise.all([
    safeFetch<RawInvite>(`${BASE}/rest/v1/coach_invite_tokens?used_at=is.null&select=coach_id,created_at&limit=500`),
    safeFetch<RawCoach>(`${BASE}/rest/v1/team_coaches?select=id,name,campaign_slug&limit=2000`),
  ]);
  const coachById = new Map(coaches.map(c => [c.id, c]));
  const now = Date.now();

  return invites
    .filter(i => daysBetween(now, new Date(i.created_at).getTime()) >= 7)
    .map(i => {
      const coach = coachById.get(i.coach_id);
      return {
        rule_key:      "pending_invite_stale",
        severity:      "info",
        campaign_slug: coach?.campaign_slug ?? null,
        coach_id:      i.coach_id,
        title:         "Pending coach invite older than 7 days.",
        description:   `Invite for ${coach?.name ?? "a coach"} sent ${i.created_at} has not been activated.`,
      } satisfies AutomationCandidate;
    });
}

// ── Registry ────────────────────────────────────────────────────────────────────
// Add new rules here — each is an independent async function returning candidates.
const RULES: Array<() => Promise<AutomationCandidate[]>> = [
  ruleTeamHealthAtRisk,
  ruleCrmFollowUpOverdue,
  ruleNoDonations7d,
  ruleDeadlineApproachingUnderfunded,
  rulePendingInviteStale,
];

export async function evaluateAutomationRules(): Promise<{ candidates: AutomationCandidate[]; rulesEvaluated: number }> {
  const results = await Promise.all(RULES.map(rule => rule()));
  return { candidates: results.flat(), rulesEvaluated: RULES.length };
}

export function dedupKey(c: {
  rule_key: string;
  campaign_slug?: string | null;
  coach_id?: string | null;
  crm_contact_id?: string | null;
}): string {
  return `${c.rule_key}|${c.campaign_slug ?? ""}|${c.coach_id ?? ""}|${c.crm_contact_id ?? ""}`;
}
