import { restList, restInsert, restUpdate } from "./_client";
import { getCampaignSummary, type CampaignSummary } from "./campaigns";

export type SponsorStatus = "prospect" | "contacted" | "active" | "recurring" | "paused" | "lost";

export const SPONSOR_STATUSES: SponsorStatus[] = [
  "prospect", "contacted", "active", "recurring", "paused", "lost",
];

export type SponsorActivityType =
  | "note" | "call" | "email" | "meeting" | "sponsorship" | "renewal" | "status_change";

export const SPONSOR_ACTIVITY_TYPES: SponsorActivityType[] = [
  "note", "call", "email", "meeting", "sponsorship", "renewal", "status_change",
];

export type SponsorBusiness = {
  id:                          string;
  business_name:               string;
  contact_name:                string | null;
  contact_email:               string | null;
  contact_phone:               string | null;
  website:                     string | null;
  industry:                    string | null;
  city:                        string | null;
  state:                       string | null;
  address:                     string | null;
  preferred_sports:            string[];
  preferred_sponsorship_level: string | null;
  estimated_annual_budget:     number | null;
  lifetime_value:              number;
  last_sponsored_at:           string | null;
  next_renewal_at:             string | null;
  status:                      SponsorStatus;
  source:                      string | null;
  notes:                       string | null;
  created_at:                  string;
  updated_at:                  string;
};

export type SponsorActivity = {
  id:            string;
  business_id:   string;
  activity_type: SponsorActivityType;
  title:         string;
  body:          string | null;
  activity_at:   string;
  created_at:    string;
};

export type SponsorRelationship = {
  id:                 string;
  business_id:        string;
  campaign_slug:      string | null;
  sponsorship_amount: number | null;
  sponsorship_level:  string | null;
  sponsored_at:       string;
  notes:              string | null;
  created_at:         string;
};

export type SponsorSummary = {
  totalBusinesses:            number;
  activeSponsors:             number;
  recurringSponsors:          number;
  prospectSponsors:           number;
  estimatedAnnualBudgetCents: number;
  lifetimeValueCents:         number;
  renewalsDue:                number;
};

export async function getSponsors(): Promise<SponsorBusiness[]> {
  return restList<SponsorBusiness>("sponsor_businesses?select=*&order=created_at.desc&limit=2000");
}

export async function getSponsor(id: string): Promise<SponsorBusiness | null> {
  const rows = await restList<SponsorBusiness>(
    `sponsor_businesses?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
  );
  return rows[0] ?? null;
}

export type CreateSponsorInput = Partial<Omit<SponsorBusiness, "id" | "created_at" | "updated_at" | "lifetime_value">> & {
  business_name: string;
};

export async function createSponsor(input: CreateSponsorInput): Promise<SponsorBusiness> {
  const rows = await restInsert<SponsorBusiness>("sponsor_businesses", {
    business_name:               input.business_name,
    contact_name:                input.contact_name ?? null,
    contact_email:                input.contact_email ?? null,
    contact_phone:                input.contact_phone ?? null,
    website:                     input.website ?? null,
    industry:                    input.industry ?? null,
    city:                        input.city ?? null,
    state:                       input.state ?? "AZ",
    address:                     input.address ?? null,
    preferred_sports:            input.preferred_sports ?? [],
    preferred_sponsorship_level: input.preferred_sponsorship_level ?? null,
    estimated_annual_budget:     input.estimated_annual_budget ?? null,
    next_renewal_at:             input.next_renewal_at ?? null,
    status:                      input.status ?? "prospect",
    source:                      input.source ?? null,
    notes:                       input.notes ?? null,
  });
  return rows[0];
}

export type UpdateSponsorInput = Partial<Omit<SponsorBusiness, "id" | "created_at" | "updated_at">>;

// Generic patch. When `status` changes, automatically records a
// `status_change` activity — same convention as the Coach CRM service.
export async function updateSponsor(id: string, patch: UpdateSponsorInput): Promise<SponsorBusiness> {
  const prior = await getSponsor(id);
  if (!prior) throw new Error("Sponsor not found.");

  const rows = await restUpdate<SponsorBusiness>(
    `sponsor_businesses?id=eq.${encodeURIComponent(id)}`,
    { ...patch, updated_at: new Date().toISOString() },
  );
  const sponsor = rows[0];

  if (patch.status && patch.status !== prior.status) {
    await createSponsorActivity({
      business_id:   id,
      activity_type: "status_change",
      title:         `Status changed: ${prior.status} → ${patch.status}`,
    }).catch(() => {});
  }

  return sponsor;
}

export async function getSponsorActivities(businessId?: string, limit = 500): Promise<SponsorActivity[]> {
  const filter = businessId ? `&business_id=eq.${encodeURIComponent(businessId)}` : "";
  return restList<SponsorActivity>(`sponsor_activities?select=*&order=activity_at.desc&limit=${limit}${filter}`);
}

export type CreateSponsorActivityInput = {
  business_id:   string;
  activity_type: SponsorActivityType;
  title:         string;
  body?:         string | null;
};

export async function createSponsorActivity(input: CreateSponsorActivityInput): Promise<SponsorActivity> {
  const rows = await restInsert<SponsorActivity>("sponsor_activities", {
    business_id:   input.business_id,
    activity_type: input.activity_type,
    title:         input.title,
    body:          input.body ?? null,
  });
  return rows[0];
}

export async function getSponsorRelationships(businessId?: string, limit = 500): Promise<SponsorRelationship[]> {
  const filter = businessId ? `&business_id=eq.${encodeURIComponent(businessId)}` : "";
  return restList<SponsorRelationship>(
    `sponsor_relationships?select=*&order=sponsored_at.desc&limit=${limit}${filter}`,
  );
}

export type CreateSponsorRelationshipInput = {
  business_id:        string;
  campaign_slug?:     string | null;
  sponsorship_amount?: number | null;
  sponsorship_level?: string | null;
  notes?:             string | null;
};

// Creating a relationship is the moment a sponsorship becomes real: bumps
// lifetime_value, stamps last_sponsored_at, promotes prospects to active,
// and logs a `sponsorship` activity — mirrors Coach CRM's status_change wiring.
export async function createSponsorRelationship(input: CreateSponsorRelationshipInput): Promise<SponsorRelationship> {
  const business = await getSponsor(input.business_id);
  if (!business) throw new Error("Sponsor not found.");

  const rows = await restInsert<SponsorRelationship>("sponsor_relationships", {
    business_id:        input.business_id,
    campaign_slug:      input.campaign_slug ?? null,
    sponsorship_amount: input.sponsorship_amount ?? null,
    sponsorship_level:  input.sponsorship_level ?? null,
    notes:              input.notes ?? null,
  });
  const relationship = rows[0];

  const amount = input.sponsorship_amount ?? 0;
  const now = new Date().toISOString();
  const nextStatus: SponsorStatus = business.status === "prospect" || business.status === "contacted"
    ? "active" : business.status;

  await restUpdate(`sponsor_businesses?id=eq.${encodeURIComponent(input.business_id)}`, {
    lifetime_value:     (business.lifetime_value ?? 0) + amount,
    last_sponsored_at:  now,
    status:             nextStatus,
    updated_at:         now,
  }).catch(() => {});

  await createSponsorActivity({
    business_id:   input.business_id,
    activity_type: "sponsorship",
    title:         input.campaign_slug
      ? `Sponsorship recorded for campaign "${input.campaign_slug}"`
      : "Sponsorship recorded",
    body: amount > 0 ? `Amount: $${(amount / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : null,
  }).catch(() => {});

  return relationship;
}

export async function getRenewalsDue(withinDays = 30): Promise<SponsorBusiness[]> {
  const sponsors = await getSponsors();
  const cutoff = Date.now() + withinDays * 86400000;
  return sponsors
    .filter(s => s.next_renewal_at && new Date(s.next_renewal_at).getTime() <= cutoff)
    .sort((a, b) => new Date(a.next_renewal_at!).getTime() - new Date(b.next_renewal_at!).getTime());
}

export async function getSponsorSummary(): Promise<SponsorSummary> {
  const sponsors = await getSponsors();
  const renewalsDue = await getRenewalsDue(30);

  return {
    totalBusinesses:            sponsors.length,
    activeSponsors:             sponsors.filter(s => s.status === "active").length,
    recurringSponsors:          sponsors.filter(s => s.status === "recurring").length,
    prospectSponsors:           sponsors.filter(s => s.status === "prospect").length,
    estimatedAnnualBudgetCents: sponsors.reduce((sum, s) => sum + (s.estimated_annual_budget ?? 0), 0),
    lifetimeValueCents:         sponsors.reduce((sum, s) => sum + (s.lifetime_value ?? 0), 0),
    renewalsDue:                renewalsDue.length,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase A16B — Sponsor Intelligence & Matching Engine
//
// Turns the CRM from "storage" into "insight": a 0-100 relationship-quality
// score per sponsor, campaign-aware recommendations, portfolio insights, and
// a renewal forecast. Everything here is read-only and derived from the same
// three tables above (sponsor_businesses / sponsor_activities /
// sponsor_relationships) plus campaigns.ts — no schema changes.
//
// Future-hook note: `recommendSponsors()` and `calculateSponsorScore()` are
// intentionally pure/composable so a later Business Portal or AI-matching
// phase can call them directly (e.g. from a public-facing recommendation
// endpoint) without re-deriving this logic.
// ═══════════════════════════════════════════════════════════════════════════

function clampScore(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export type SponsorScoreFactors = {
  frequency:        number; // 0-15  sponsorship count
  lifetimeValue:    number; // 0-20  total $ given, ceiling $10,000
  recency:          number; // 0-15  days since last sponsorship, decays over 180 days
  schoolsSupported: number; // 0-10  distinct campaigns sponsored
  sportsSupported:  number; // 0-10  distinct sports sponsored (falls back to preferred_sports if no campaign data)
  renewalHistory:   number; // 0-10  flat 10 if sponsored 2+ times (implies at least one renewal)
  budget:           number; // 0-20  estimated annual budget, ceiling $25,000
};

export type ScoredSponsor = {
  sponsor: SponsorBusiness;
  score:   number; // 0-100, sum of factors below
  factors: SponsorScoreFactors;
};

// Pure — no fetching. Callers supply this sponsor's own relationships (and,
// optionally, a campaign lookup so "sports supported" reflects what was
// actually sponsored rather than just stated preference).
export function calculateSponsorScore(
  sponsor: SponsorBusiness,
  relationships: SponsorRelationship[],
  campaignsBySlug?: Map<string, CampaignSummary>,
): ScoredSponsor {
  const frequency = Math.round(clampScore(relationships.length * 5, 0, 15));

  const lifetimeValue = Math.round(20 * clampScore((sponsor.lifetime_value ?? 0) / 1_000_000, 0, 1));

  const daysSinceLast = daysSince(sponsor.last_sponsored_at);
  const recency = daysSinceLast == null ? 0 : Math.round(15 * clampScore((180 - daysSinceLast) / 180, 0, 1));

  const distinctSchools = new Set(relationships.map(r => r.campaign_slug).filter((s): s is string => !!s)).size;
  const schoolsSupported = Math.round(clampScore(distinctSchools * 5, 0, 10));

  let distinctSports: number;
  if (campaignsBySlug) {
    distinctSports = new Set(
      relationships
        .map(r => (r.campaign_slug ? campaignsBySlug.get(r.campaign_slug)?.sport_name : null))
        .filter((s): s is string => !!s),
    ).size;
  } else {
    distinctSports = sponsor.preferred_sports.length;
  }
  const sportsSupported = Math.round(clampScore(distinctSports * 5, 0, 10));

  const renewalHistory = relationships.length >= 2 ? 10 : 0;

  const budget = Math.round(20 * clampScore((sponsor.estimated_annual_budget ?? 0) / 2_500_000, 0, 1));

  const factors: SponsorScoreFactors = {
    frequency, lifetimeValue, recency, schoolsSupported, sportsSupported, renewalHistory, budget,
  };
  const score = clampScore(
    frequency + lifetimeValue + recency + schoolsSupported + sportsSupported + renewalHistory + budget,
    0, 100,
  );

  return { sponsor, score, factors };
}

export type SponsorScoringContext = {
  sponsors:       SponsorBusiness[];
  relationships:  SponsorRelationship[];
  activities:     SponsorActivity[];
  relByBusiness:  Record<string, SponsorRelationship[]>;
  campaigns:      CampaignSummary[];
  campaignsBySlug: Map<string, CampaignSummary>;
};

// Single fetch-once context shared by every bulk scoring function below.
// Exported so a page that needs several of these functions (e.g. the Sponsor
// Intelligence dashboard, which wants top sponsors + insights + a renewal
// forecast in one request) can fetch it ONCE and pass it in, instead of each
// function independently re-fetching sponsors/relationships/campaigns.
export async function getSponsorScoringContext(): Promise<SponsorScoringContext> {
  const [sponsors, relationships, activities, campaigns] = await Promise.all([
    getSponsors(),
    getSponsorRelationships(),
    getSponsorActivities(),
    getCampaignSummary(),
  ]);
  const relByBusiness: Record<string, SponsorRelationship[]> = {};
  for (const r of relationships) (relByBusiness[r.business_id] ??= []).push(r);
  const campaignsBySlug = new Map(campaigns.map(c => [c.campaign_slug, c]));
  return { sponsors, relationships, activities, relByBusiness, campaigns, campaignsBySlug };
}

async function scoreAllSponsors(ctx?: SponsorScoringContext): Promise<ScoredSponsor[]> {
  const { sponsors, relByBusiness, campaignsBySlug } = ctx ?? await getSponsorScoringContext();
  return sponsors.map(s => calculateSponsorScore(s, relByBusiness[s.id] ?? [], campaignsBySlug));
}

export async function getTopSponsors(limit = 10, ctx?: SponsorScoringContext): Promise<ScoredSponsor[]> {
  const scored = await scoreAllSponsors(ctx);
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

export async function getNearbySponsors(city: string, limit = 10, ctx?: SponsorScoringContext): Promise<ScoredSponsor[]> {
  const target = city.trim().toLowerCase();
  const scored = await scoreAllSponsors(ctx);
  return scored
    .filter(s => (s.sponsor.city ?? "").toLowerCase() === target)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export type SponsorRecommendation = {
  sponsor:    SponsorBusiness;
  matchScore: number; // 0-100
  reasons:    string[];
};

// Ranking factors (documented, additive, capped at 100):
//   Same sport as campaign             +30
//   Same city as campaign              +20
//   Previously sponsored this campaign +15
//   Overall sponsor score >= 70        +20 (scaled: score * 0.2)
//   Renewal opportunity (<=60 days)    +10
//   Budget fits campaign scale         +10
//   Recently active (<=30 days)        +5
// Sponsors with status 'lost' are excluded — not viable recommendations.
export async function recommendSponsors(campaignSlug: string, limit = 10, ctx?: SponsorScoringContext): Promise<SponsorRecommendation[]> {
  const { sponsors, relByBusiness, campaignsBySlug } = ctx ?? await getSponsorScoringContext();
  const campaign = campaignsBySlug.get(campaignSlug);
  if (!campaign) return [];

  const campaignSport = campaign.sport_name?.toLowerCase() ?? "";
  const campaignCity  = campaign.location?.toLowerCase() ?? "";
  const now = Date.now();

  const recommendations: SponsorRecommendation[] = sponsors
    .filter(s => s.status !== "lost")
    .map(sponsor => {
      const relationships = relByBusiness[sponsor.id] ?? [];
      const { score: sponsorScore } = calculateSponsorScore(sponsor, relationships, campaignsBySlug);

      let matchScore = 0;
      const reasons: string[] = [];

      if (campaignSport && sponsor.preferred_sports.some(sp => sp.toLowerCase() === campaignSport)) {
        matchScore += 30;
        reasons.push(`Prefers sponsoring ${campaign.sport_name}`);
      }
      if (campaignCity && (sponsor.city ?? "").toLowerCase() === campaignCity) {
        matchScore += 20;
        reasons.push(`Located in ${campaign.location}`);
      }
      if (relationships.some(r => r.campaign_slug === campaignSlug)) {
        matchScore += 15;
        reasons.push("Previously sponsored this campaign");
      }
      matchScore += Math.round(sponsorScore * 0.2);
      if (sponsorScore >= 70) reasons.push("Strong overall sponsor score");

      const renewalDays = daysSince(sponsor.next_renewal_at) != null
        ? Math.round((new Date(sponsor.next_renewal_at as string).getTime() - now) / 86400000)
        : null;
      if (renewalDays != null && renewalDays >= 0 && renewalDays <= 60) {
        matchScore += 10;
        reasons.push("Renewal opportunity in the next 60 days");
      }

      if (sponsor.estimated_annual_budget != null && campaign.goal_cents > 0
        && sponsor.estimated_annual_budget >= campaign.goal_cents * 0.05) {
        matchScore += 10;
        reasons.push("Budget fits campaign scale");
      }

      const lastActiveDays = daysSince(sponsor.last_sponsored_at);
      if (lastActiveDays != null && lastActiveDays <= 30) {
        matchScore += 5;
        reasons.push("Recently active");
      }

      return { sponsor, matchScore: clampScore(matchScore, 0, 100), reasons };
    })
    .filter(r => r.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit);

  return recommendations;
}

export type SponsorInsights = {
  topLifetime:      SponsorBusiness[];
  mostActive:       Array<{ sponsor: SponsorBusiness; activityCount: number }>;
  highestBudget:    SponsorBusiness[];
  mostDiverse:      Array<{ sponsor: SponsorBusiness; sportCount: number }>;
  recentlyLost:     SponsorBusiness[];
  upcomingRenewals: SponsorBusiness[];
  inactiveSponsors: SponsorBusiness[];
};

export async function getSponsorInsights(limit = 10, ctx?: SponsorScoringContext): Promise<SponsorInsights> {
  const { sponsors, relationships, activities } = ctx ?? await getSponsorScoringContext();

  const activityCountByBusiness: Record<string, number> = {};
  for (const r of relationships) activityCountByBusiness[r.business_id] = (activityCountByBusiness[r.business_id] ?? 0) + 1;
  for (const a of activities) activityCountByBusiness[a.business_id] = (activityCountByBusiness[a.business_id] ?? 0) + 1;

  const now = Date.now();
  const renewalCutoff = now + 30 * 86400000;
  const inactiveCutoffDays = 180;

  return {
    topLifetime: [...sponsors].sort((a, b) => b.lifetime_value - a.lifetime_value).slice(0, limit),

    mostActive: sponsors
      .map(sponsor => ({ sponsor, activityCount: activityCountByBusiness[sponsor.id] ?? 0 }))
      .filter(s => s.activityCount > 0)
      .sort((a, b) => b.activityCount - a.activityCount)
      .slice(0, limit),

    highestBudget: sponsors
      .filter(s => s.estimated_annual_budget != null)
      .sort((a, b) => (b.estimated_annual_budget ?? 0) - (a.estimated_annual_budget ?? 0))
      .slice(0, limit),

    mostDiverse: sponsors
      .map(sponsor => ({ sponsor, sportCount: sponsor.preferred_sports.length }))
      .filter(s => s.sportCount > 0)
      .sort((a, b) => b.sportCount - a.sportCount)
      .slice(0, limit),

    recentlyLost: sponsors
      .filter(s => s.status === "lost")
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, limit),

    upcomingRenewals: sponsors
      .filter(s => s.next_renewal_at && new Date(s.next_renewal_at).getTime() <= renewalCutoff)
      .sort((a, b) => new Date(a.next_renewal_at!).getTime() - new Date(b.next_renewal_at!).getTime())
      .slice(0, limit),

    inactiveSponsors: sponsors
      .filter(s => (s.status === "active" || s.status === "recurring"))
      .filter(s => {
        const d = daysSince(s.last_sponsored_at);
        return d == null || d >= inactiveCutoffDays;
      })
      .slice(0, limit),
  };
}

export type RenewalForecast = {
  overdue:  number;
  next30:   number;
  next60:   number;
  next90:   number;
  upcoming: SponsorBusiness[];
};

export async function getRenewalForecast(ctx?: SponsorScoringContext): Promise<RenewalForecast> {
  const { sponsors } = ctx ?? await getSponsorScoringContext();
  const now = Date.now();
  const withRenewal = sponsors.filter((s): s is SponsorBusiness & { next_renewal_at: string } => !!s.next_renewal_at);

  const daysUntil = (iso: string) => Math.round((new Date(iso).getTime() - now) / 86400000);

  return {
    overdue: withRenewal.filter(s => daysUntil(s.next_renewal_at) < 0).length,
    next30:  withRenewal.filter(s => { const d = daysUntil(s.next_renewal_at); return d >= 0 && d <= 30; }).length,
    next60:  withRenewal.filter(s => { const d = daysUntil(s.next_renewal_at); return d > 30 && d <= 60; }).length,
    next90:  withRenewal.filter(s => { const d = daysUntil(s.next_renewal_at); return d > 60 && d <= 90; }).length,
    upcoming: withRenewal
      .filter(s => daysUntil(s.next_renewal_at) >= 0)
      .sort((a, b) => new Date(a.next_renewal_at).getTime() - new Date(b.next_renewal_at).getTime())
      .slice(0, 10),
  };
}
