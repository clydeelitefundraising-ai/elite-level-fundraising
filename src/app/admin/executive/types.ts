export type Kpis = {
  totalCampaigns:           number;
  activeCampaigns:          number;
  totalRaisedCents:         number;
  estimatedElfRevenueCents: number;
  totalDonations:           number;
  avgDonationCents:         number;
  avgCampaignCents:         number;
  activeCoaches:            number;
  teamsAtRisk:              number;
  healthyTeams:             number;
  crmPipelineValueCents:    number;
  openAutomationEvents:     number;
  sponsorBusinesses:        number;
  sponsorLifetimeValueCents: number;
  sponsorRenewalsDue:       number;
};

export type CampaignHealthDistribution = { healthy: number; watch: number; atRisk: number };

export type DonationMomentum = {
  last7Cents:  number;
  last30Cents: number;
  last7Count:  number;
  last30Count: number;
};

export type CoachPipeline = {
  prospects: number;
  demos:     number;
  proposals: number;
  signed:    number;
  returning: number;
};

export type AutomationHealth = {
  lastRunStatus:  string | null;
  lastRunAt:      string | null;
  failedRuns:     number;
  criticalEvents: number;
  warningEvents:  number;
};

export type RevenueForecast = {
  projectedCampaignRevenueCents: number;
  projectedPlatformRevenueCents: number;
  likelyToHitGoal:               number;
  unlikelyToHitGoal:             number;
  feeRatePct:                    number;
};

export type SponsorIntelSummary = {
  topSponsors:            Array<{ businessName: string; score: number }>;
  renewalsNext30:         number;
  largestLifetimeSponsor: { businessName: string; valueCents: number } | null;
  largestBudgetSponsor:   { businessName: string; budgetCents: number } | null;
  businessesAddedThisMonth: number;
};

export type InsightTone = "positive" | "neutral" | "warning" | "critical";
export type Insight = { text: string; tone: InsightTone };

export type TimelineKind = "audit" | "crm" | "automation" | "donation" | "campaign";
export type TimelineItem = {
  id:      string;
  kind:    TimelineKind;
  title:   string;
  detail?: string | null;
  at:      string;
  href:    string;
};

export type ExecutiveData = {
  kpis:             Kpis;
  campaignHealth:   CampaignHealthDistribution;
  donationMomentum: DonationMomentum;
  coachPipeline:    CoachPipeline;
  automationHealth: AutomationHealth;
  forecast:         RevenueForecast;
  sponsorIntel:     SponsorIntelSummary;
  insights:         Insight[];
  timeline:         TimelineItem[];
  generatedAt:      string;
};
